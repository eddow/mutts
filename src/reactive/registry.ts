import { type EffectCleanup, type EffectNode, type EffectTrigger } from './types'

// Track which effects are watching which reactive objects for cleanup
export let effectToReactiveObjects = new WeakMap<EffectTrigger, Set<object>>()

// Track effects per reactive object and property
export let watchers = new WeakMap<object, Map<any, Set<EffectTrigger>>>()

// Track effect metadata and relationships
export let effectNodes = new WeakMap<EffectTrigger, EffectNode>()

// Root function mapping (replaces Object.defineProperty with rootFunction symbol)
export let rootFunctions = new WeakMap<Function, Function>()

export function getEffectNode(effect: EffectTrigger): EffectNode {
    let node = effectNodes.get(effect)
    if (!node) {
        node = {}
        effectNodes.set(effect, node)
    }
    return node
}

// Track reverse mapping to ensure unicity: One Root -> One Function
let reverseRoots = new WeakMap<any, WeakRef<Function>>()

export function resetRegistry() {
	effectToReactiveObjects = new WeakMap()
	watchers = new WeakMap()
	effectNodes = new WeakMap()
	reverseRoots = new WeakMap()
	rootFunctions = new WeakMap()
}

/**
 * Marks a function with its root function for effect tracking
 * Enforces strict unicity: A root function can only identify ONE function.
 * @param fn - The function to mark
 * @param root - The root function
 * @returns The marked function
 */
export function markWithRoot<T extends Function>(fn: T, root: any): T {
	// Check for collision
	const existingRef = reverseRoots.get(root)
	const existing = existingRef?.deref()

	if (existing && existing !== fn) {
		const rootName = root.name || 'anonymous'
		const existingName = existing.name || 'anonymous'
		const fnName = fn.name || 'anonymous'
		throw new Error(
			`[reactive] Abusive Shared Root detected: Root '${rootName}' is already identifying function '${existingName}'. ` +
				`Cannot reuse it for '${fnName}'. Shared roots cause lost updates and broken identity logic.`
		)
	}

	// Always update the map so subsequent checks find this one
	// (Last writer wins for the check)
	reverseRoots.set(root, new WeakRef(fn))

	// Store root mapping in WeakMap (avoids expensive Object.defineProperty)
	rootFunctions.set(fn, getRoot(root))
	return fn
}

/**
 * Gets the root function of a function for effect tracking
 * @param fn - The function to get the root of
 * @returns The root function
 */
export function getRoot<T extends Function | undefined>(fn: T): T {
	while (fn) {
		const r = rootFunctions.get(fn)
		if (!r) break
		fn = r as T
	}
	return fn
}
