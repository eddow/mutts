import { isObject } from '../utils'
import { options, type Evolution, type ScopedCallback } from './types'
import { effect } from './effects'
import { markWithRoot } from './tracking'
import { batch } from './effects'
import { reactive } from './proxy'
import { unwrap } from './proxy'
import { isNonReactive } from './non-reactive'

// Deep watching data structures
// Track which objects contain which other objects (back-references)
export const objectParents = new WeakMap<object, Set<{ parent: object; prop: PropertyKey }>>()

// Track which objects have deep watchers
export const objectsWithDeepWatchers = new WeakSet<object>()

// Track deep watchers per object
export const deepWatchers = new WeakMap<object, Set<ScopedCallback>>()

// Track which effects are doing deep watching
export const effectToDeepWatchedObjects = new WeakMap<ScopedCallback, Set<object>>()

/**
 * Add a back-reference from child to parent
 */
export function addBackReference(child: object, parent: object, prop: any) {
	let parents = objectParents.get(child)
	if (!parents) {
		parents = new Set()
		objectParents.set(child, parents)
	}
	parents.add({ parent, prop })
}

/**
 * Remove a back-reference from child to parent
 */
export function removeBackReference(child: object, parent: object, prop: any) {
	const parents = objectParents.get(child)
	if (parents) {
		parents.delete({ parent, prop })
		if (parents.size === 0) {
			objectParents.delete(child)
		}
	}
}

/**
 * Check if an object needs back-references (has deep watchers or parents with deep watchers)
 */
export function needsBackReferences(obj: object): boolean {
	return objectsWithDeepWatchers.has(obj) || hasParentWithDeepWatchers(obj)
}

/**
 * Check if an object has any parent with deep watchers
 */
function hasParentWithDeepWatchers(obj: object): boolean {
	const parents = objectParents.get(obj)
	if (!parents) return false

	for (const { parent } of parents) {
		if (objectsWithDeepWatchers.has(parent)) return true
		if (hasParentWithDeepWatchers(parent)) return true
	}
	return false
}

/**
 * Bubble up changes through the back-reference chain
 */
export function bubbleUpChange(changedObject: object, evolution: Evolution) {
	const parents = objectParents.get(changedObject)
	if (!parents) return

	for (const { parent } of parents) {
		// Trigger deep watchers on parent
		const parentDeepWatchers = deepWatchers.get(parent)
		if (parentDeepWatchers) for (const watcher of parentDeepWatchers) batch(watcher)

		// Continue bubbling up
		bubbleUpChange(parent, evolution)
	}
}

/**
 * Tracks property changes and manages back-references for deep watching
 * @param obj - The object that changed
 * @param prop - The property that changed
 * @param oldVal - The old value
 * @param newValue - The new value
 */
export function track1(obj: object, prop: any, oldVal: any, newValue: any) {
	// Manage back-references if this object has deep watchers
	if (objectsWithDeepWatchers.has(obj)) {
		// Remove old back-references
		if (typeof oldVal === 'object' && oldVal !== null) {
			removeBackReference(oldVal, obj, prop)
		}

		// Add new back-references
		if (typeof newValue === 'object' && newValue !== null) {
			const reactiveValue = reactive(newValue)
			addBackReference(reactiveValue, obj, prop)
		}
	}
	return newValue
}

/**
 * Deep watch an object and all its nested properties
 * @param target - The object to watch deeply
 * @param callback - The callback to call when any nested property changes
 * @param options - Options for the deep watch
 * @returns A cleanup function to stop watching
 */
/**
 * Sets up deep watching for an object, tracking all nested property changes
 * @param target - The object to watch
 * @param callback - The callback to call when changes occur
 * @param options - Options for deep watching
 * @returns A cleanup function to stop deep watching
 */
export function deepWatch<T extends object>(
	target: T,
	callback: (value: T) => void,
	{ immediate = false } = {}
): (() => void) | undefined {
	if (target === null || target === undefined) return undefined
	if (typeof target !== 'object') throw new Error('Target of deep watching must be an object')
	// Create a wrapper callback that matches ScopedCallback signature
	const wrappedCallback: ScopedCallback = markWithRoot(() => callback(target), callback)

	// Use the existing effect system to register dependencies
	return effect(() => {
		// Mark the target object as having deep watchers
		objectsWithDeepWatchers.add(target)

		// Track which objects this effect is watching for cleanup
		let effectObjects = effectToDeepWatchedObjects.get(wrappedCallback)
		if (!effectObjects) {
			effectObjects = new Set()
			effectToDeepWatchedObjects.set(wrappedCallback, effectObjects)
		}
		effectObjects!.add(target)

		// Traverse the object graph and register dependencies
		// This will re-run every time the effect runs, ensuring we catch all changes
		const visited = new WeakSet()
		function traverseAndTrack(obj: any, depth = 0) {
			// Prevent infinite recursion and excessive depth
			if (visited.has(obj) || !isObject(obj) || depth > options.maxDeepWatchDepth) return
			// Do not traverse into unreactive objects
			if (isNonReactive(obj)) return
			visited.add(obj)

			// Mark this object as having deep watchers
			objectsWithDeepWatchers.add(obj)
			effectObjects!.add(obj)

			// Traverse all properties to register dependencies
			// unwrap to avoid kicking dependency
			for (const key in unwrap(obj)) {
				if (Object.hasOwn(obj, key)) {
					// Access the property to register dependency
					const value = (obj as any)[key]
					// Make the value reactive if it's an object
					const reactiveValue =
						typeof value === 'object' && value !== null ? reactive(value) : value
					traverseAndTrack(reactiveValue, depth + 1)
				}
			}

			// Also handle array indices and length
			// biome-ignore lint/suspicious/useIsArray: Check for both native arrays and reactive arrays
			if (Array.isArray(obj) || obj instanceof Array) {
				// Access array length to register dependency on length changes
				const length = obj.length

				// Access all current array elements to register dependencies
				for (let i = 0; i < length; i++) {
					// Access the array element to register dependency
					const value = obj[i]
					// Make the value reactive if it's an object
					const reactiveValue =
						typeof value === 'object' && value !== null ? reactive(value) : value
					traverseAndTrack(reactiveValue, depth + 1)
				}
			}
			// Handle Set values (deep watch values only, not keys since Sets don't have separate keys)
			else if (obj instanceof Set) {
				// Access all Set values to register dependencies
				for (const value of obj) {
					// Make the value reactive if it's an object
					const reactiveValue =
						typeof value === 'object' && value !== null ? reactive(value) : value
					traverseAndTrack(reactiveValue, depth + 1)
				}
			}
			// Handle Map values (deep watch values only, not keys)
			else if (obj instanceof Map) {
				// Access all Map values to register dependencies
				for (const [_key, value] of obj) {
					// Make the value reactive if it's an object
					const reactiveValue =
						typeof value === 'object' && value !== null ? reactive(value) : value
					traverseAndTrack(reactiveValue, depth + 1)
				}
			}
			// Note: WeakSet and WeakMap cannot be iterated, so we can't deep watch their contents
			// They will only trigger when the collection itself is replaced
		}

		// Traverse the target object to register all dependencies
		// This will register dependencies on all current properties and array elements
		traverseAndTrack(target)

		// Only call the callback if immediate is true or if it's not the first run
		if (immediate) callback(target)
		immediate = true

		// Return a cleanup function that properly removes deep watcher tracking
		return () => {
			// Get the objects this effect was watching
			const effectObjects = effectToDeepWatchedObjects.get(wrappedCallback)
			if (effectObjects) {
				// Remove deep watcher tracking from all objects this effect was watching
				for (const obj of effectObjects) {
					// Check if this object still has other deep watchers
					const watchers = deepWatchers.get(obj)
					if (watchers) {
						// Remove this effect's callback from the watchers
						watchers.delete(wrappedCallback)

						// If no more watchers, remove the object from deep watchers tracking
						if (watchers.size === 0) {
							deepWatchers.delete(obj)
							objectsWithDeepWatchers.delete(obj)
						}
					} else {
						// No watchers found, remove from deep watchers tracking
						objectsWithDeepWatchers.delete(obj)
					}
				}

				// Clean up the tracking data
				effectToDeepWatchedObjects.delete(wrappedCallback)
			}
		}
	})
}
