import {
	deepWatchers,
	effectToDeepWatchedObjects,
	objectsWithDeepWatchers,
} from './deep-watch-state'
import { effect } from './effects'
import { isNonReactive } from './non-reactive-state'
import { reactive, unwrap } from './proxy'
import { markWithRoot } from './registry'
import { type EffectCleanup, type EffectTrigger, options } from './types'

function isObject(value: any): value is object {
	return typeof value === 'object' && value !== null
}

export {
	addBackReference,
	bubbleUpChange,
	deepWatchers,
	effectToDeepWatchedObjects,
	needsBackReferences,
	objectParents,
	objectsWithDeepWatchers,
	removeBackReference,
} from './deep-watch-state'

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
): EffectCleanup | undefined {
	if (target === null || target === undefined) return undefined
	if (typeof target !== 'object') throw new Error('Target of deep watching must be an object')
	// Create a wrapper callback that matches EffectTrigger signature
	const wrappedCallback: EffectTrigger = markWithRoot(
		(() => callback(target)) as EffectTrigger,
		callback
	)

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
			if (!obj || visited.has(obj) || !isObject(obj) || depth > options.maxDeepWatchDepth) return
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
