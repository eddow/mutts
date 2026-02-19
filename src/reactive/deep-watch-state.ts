import { debugHooks } from './debug-hooks'
import { batch } from './effects'
import { getEffectNode } from './registry'
import { getDependencyStack } from './tracking'
import { allProps, EffectTrigger, type Evolution, options } from './types'

// Track which objects contain which other objects (back-references)
export const objectParents = new WeakMap<object, Set<{ parent: object; prop: PropertyKey }>>()

// Track which objects have deep watchers
export const objectsWithDeepWatchers = new WeakSet<object>()
let deepWatcherCount = 0
export function registerDeepWatcher() {
	deepWatcherCount++
}

// Track deep watchers per object
export const deepWatchers = new WeakMap<object, Set<EffectTrigger>>()

// Track which effects are doing deep watching
export const effectToDeepWatchedObjects = new WeakMap<EffectTrigger, Set<object>>()

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
		for (const entry of parents) {
			if (entry.parent === parent && entry.prop === prop) {
				parents.delete(entry)
				break
			}
		}
		if (parents.size === 0) {
			objectParents.delete(child)
		}
	}
}

/**
 * Check if an object needs back-references (has deep watchers or parents with deep watchers)
 */
export function needsBackReferences(obj: object): boolean {
	// Fast path: if no deep watchers exist anywhere, skip entirely
	if (!deepWatcherCount) return false // fast path: no deep watchers anywhere
	// Check if object itself has deep watchers
	if (objectsWithDeepWatchers.has(obj)) return true
	// Slow path: check if any parent has deep watchers (recursive)
	return hasParentWithDeepWatchers(obj)
}

/**
 * Bubble up changes through the back-reference chain
 */
export function bubbleUpChange(changedObject: object, evolution: Evolution) {
	const parents = objectParents.get(changedObject)
	if (!parents) return

	for (const { parent, prop } of parents) {
		// Trigger deep watchers on parent
		const parentDeepWatchers = deepWatchers.get(parent)
		if (parentDeepWatchers) {
			if (options.introspection?.gatherReasons) {
				const gatherReasons = options.introspection.gatherReasons
				const lineageConfig = gatherReasons.lineages
				
				let touchStack: unknown | undefined
				if (lineageConfig === 'touch' || lineageConfig === 'both') {
					touchStack = debugHooks.captureLineage()
				}
				
				for (const watcher of parentDeepWatchers) {
					const dependencyStack = (lineageConfig === 'dependency' || lineageConfig === 'both')
						? getDependencyStack(watcher, parent, allProps)
						: undefined
						
					const node = getEffectNode(watcher)
					if (!node.pendingTriggers) node.pendingTriggers = []
					node.pendingTriggers.push({ obj: parent, evolution, dependency: dependencyStack, touch: touchStack })
				}
			}
			for (const watcher of parentDeepWatchers) batch(watcher)
		}

		// Continue bubbling up
		bubbleUpChange(parent, evolution)
	}
}

function hasParentWithDeepWatchers(obj: object): boolean {
	const parents = objectParents.get(obj)
	if (!parents) return false

	for (const { parent } of parents) {
		if (objectsWithDeepWatchers.has(parent)) return true
		if (hasParentWithDeepWatchers(parent)) return true
	}
	return false
}
