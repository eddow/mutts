import { type EffectCleanup, type EffectTrigger, rootFunction } from './types'

// Track which effects are watching which reactive objects for cleanup
export const effectToReactiveObjects = new WeakMap<EffectTrigger, Set<object>>()

// Track effects per reactive object and property
export const watchers = new WeakMap<object, Map<any, Set<EffectTrigger>>>()

// runEffect -> set<stop>
export const effectChildren = new WeakMap<EffectTrigger, Set<EffectCleanup>>()

// Track parent effect relationships for hierarchy traversal (used in deep touch filtering)
// TODO: we finally have made `effect.parent` in Object.defineProperties - chose only one way to store parent
export const effectParent = new WeakMap<EffectTrigger, EffectTrigger | undefined>()

// Track reverse mapping to ensure unicity: One Root -> One Function
const reverseRoots = new WeakMap<any, WeakRef<Function>>()

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

	// Mark fn with the new root
	return Object.defineProperty(fn, rootFunction, {
		value: getRoot(root),
		writable: false,
	})
}

/**
 * Gets the root function of a function for effect tracking
 * @param fn - The function to get the root of
 * @returns The root function
 */
export function getRoot<T extends Function | undefined>(fn: T): T {
	while (fn && rootFunction in fn) fn = fn[rootFunction] as T
	return fn
}
