import { ReactiveError, type ScopedCallback } from './types'

/**
 * Effect context stack for nested tracking (front = active, next = parent)
 */
const stack: ScopedCallback[] = []
export const effectStack = stack

export function captureEffectStack() {
	return stack.slice()
}

export function withEffectStack<T>(snapshot: ScopedCallback[], fn: () => T): T {
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

export function getParentEffect() {
	return stack[1]
}

export function withEffectContext<T>(
	effect: ScopedCallback | undefined,
	fn: () => T
): T {
	stack.unshift(effect)
	try {
		return fn()
	} finally {
		const recoveredEffect = stack.shift()
		if (recoveredEffect !== effect)
			throw new ReactiveError('[reactive] Effect stack mismatch')
	}
}

function assignStack(values: ScopedCallback[]) {
	stack.length = 0
	stack.push(...values)
}

