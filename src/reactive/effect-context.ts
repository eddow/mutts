import { effectParent, getRoot } from './registry'
import { ReactiveError, type ScopedCallback } from './types'

/**
 * Effect context stack for nested tracking (front = active, next = parent)
 */
const stack: (ScopedCallback | undefined)[] = []
export const effectStack = stack

export function captureEffectStack() {
	return stack.slice()
}
export function isRunning(effect: ScopedCallback): (ScopedCallback | undefined)[] | false {
	const rootEffect = getRoot(effect)

	// Check if the effect is directly in the stack
	const rootIndex = stack.indexOf(rootEffect)
	if (rootIndex !== -1) {
		return stack.slice(0, rootIndex + 1).reverse()
	}

	// Check if any effect in the stack is a descendant of this effect
	// (i.e., walk up the parent chain from each stack effect to see if we reach this effect)
	for (let i = 0; i < stack.length; i++) {
		const stackEffect = stack[i]
		let current: ScopedCallback | undefined = stackEffect
		const visited = new WeakSet<ScopedCallback>()
		const ancestorChain: ScopedCallback[] = []
		// TODO: That's perhaps a lot of computations for an `assert`
		// Walk up the parent chain to find if this effect is an ancestor
		while (current && !visited.has(current)) {
			visited.add(current)
			const currentRoot = getRoot(current)
			ancestorChain.push(currentRoot)
			if (currentRoot === rootEffect) {
				// Found a descendant - build the full chain from ancestor to active
				// The ancestorChain contains [descendant, parent, ..., ancestor] (walking up)
				// We need [ancestor (effect), ..., parent, descendant, ...stack from descendant to active]
				const chainFromAncestor = ancestorChain.reverse() // [ancestor, ..., descendant]
				// Prepend the actual effect we're checking (in case current is a wrapper)
				if (chainFromAncestor[0] !== rootEffect) {
					chainFromAncestor.unshift(rootEffect)
				}
				// Append the rest of the stack from the descendant to the active effect
				const stackFromDescendant = stack.slice(0, i + 1).reverse() // [descendant, ..., active]
				// Remove duplicate descendant (it's both at end of chainFromAncestor and start of stackFromDescendant)
				if (chainFromAncestor.length > 0 && stackFromDescendant.length > 0) {
					stackFromDescendant.shift() // Remove duplicate descendant
				}
				return [...chainFromAncestor, ...stackFromDescendant]
			}
			current = effectParent.get(current)
		}
	}

	return false
}
export function withEffectStack<T>(snapshot: (ScopedCallback | undefined)[], fn: () => T): T {
	const previousStack = stack.slice()
	assignStack(snapshot)
	try {
		return fn()
	} finally {
		assignStack(previousStack)
	}
}

export function getActiveEffect() {
	return stack[0]
}

/**
 * Executes a function with a specific effect context
 * @param effect - The effect to use as context
 * @param fn - The function to execute
 * @param keepParent - Whether to keep the parent effect context
 * @returns The result of the function
 */
export function withEffect<T>(effect: ScopedCallback | undefined, fn: () => T): T {

	if (getRoot(effect) === getRoot(getActiveEffect())) return fn()
	stack.unshift(effect)
	try {
		return fn()
	} finally {
		const recoveredEffect = stack.shift()
		if (recoveredEffect !== effect) throw new ReactiveError('[reactive] Effect stack mismatch')
	}
}

function assignStack(values: (ScopedCallback | undefined)[]) {
	stack.length = 0
	stack.push(...values)
}
