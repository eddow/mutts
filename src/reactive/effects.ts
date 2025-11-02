import { decorator } from '../decorator'
import {
	effectChildren,
	effectParent,
	effectToReactiveObjects,
	getActiveEffect,
	getParentEffect,
	getRoot,
	markWithRoot,
	setActiveEffect,
	setParentEffect,
	watchers,
} from './tracking'
import {
	type DependencyAccess,
	type Evolution,
	options,
	ReactiveError,
	type ScopedCallback,
} from './types'

type EffectTracking = (obj: any, evolution: Evolution, prop: any) => void

/**
 * Registers a debug callback that is called when the current effect is triggered by a dependency change
 *
 * This function is useful for debugging purposes as it pin-points exactly which reactive property
 * change triggered the effect. The callback receives information about:
 * - The object that changed
 * - The type of change (evolution)
 * - The specific property that changed
 *
 * **Note:** The tracker callback is automatically removed after being called once. If you need
 * to track multiple triggers, call `trackEffect` again within the effect.
 *
 * @param onTouch - Callback function that receives (obj, evolution, prop) when the effect is triggered
 * @throws {Error} If called outside of an effect context
 *
 * @example
 * ```typescript
 * const state = reactive({ count: 0, name: 'John' })
 *
 * effect(() => {
 *   // Register a tracker to see what triggers this effect
 *   trackEffect((obj, evolution, prop) => {
 *     console.log(`Effect triggered by:`, {
 *       object: obj,
 *       change: evolution.type,
 *       property: prop
 *     })
 *   })
 *
 *   // Access reactive properties
 *   console.log(state.count, state.name)
 * })
 *
 * state.count = 5
 * // Logs: Effect triggered by: { object: state, change: 'set', property: 'count' }
 * ```
 */
export function trackEffect(onTouch: EffectTracking) {
	const activeEffect = getActiveEffect()
	if (!activeEffect) throw new Error('Not in an effect')
	if (!effectTrackers.has(activeEffect)) effectTrackers.set(activeEffect, new Set([onTouch]))
	else effectTrackers.get(activeEffect)!.add(onTouch)
}

const effectTrackers = new WeakMap<ScopedCallback, Set<EffectTracking>>()

// Track currently executing effects to prevent re-execution
// These are all the effects triggered under `activeEffect`
let batchedEffects: Map<Function, ScopedCallback> | undefined
const batchCleanups = new Set<ScopedCallback>()

/**
 * Adds a cleanup function to be called when the current batch of effects completes
 * @param cleanup - The cleanup function to add
 */
export function addBatchCleanup(cleanup: ScopedCallback) {
	if (!batchedEffects) cleanup()
	else batchCleanups.add(cleanup)
}
// Track which sub-effects have been executed to prevent infinite loops
// These are all the effects triggered under `activeEffect` and all their sub-effects
export function batch(effect: ScopedCallback | ScopedCallback[], immediate?: 'immediate') {
	if (!Array.isArray(effect)) effect = [effect]
	const roots = effect.map(getRoot)

	if (batchedEffects) {
		options?.chain(roots, getRoot(getActiveEffect()))
		for (let i = 0; i < effect.length; i++) batchedEffects.set(roots[i], effect[i])
		if (immediate)
			for (let i = 0; i < effect.length; i++)
				try {
					effect[i]()
				} finally {
					batchedEffects.delete(roots[i])
				}
	} else {
		options.beginChain(roots)
		const runEffects: any[] = []
		batchedEffects = new Map<Function, ScopedCallback>(roots.map((root, i) => [root, effect[i]]))
		const firstReturn: { value?: any } = {}
		try {
			while (batchedEffects.size) {
				if (runEffects.length > options.maxEffectChain) {
					switch (options.maxEffectReaction) {
						case 'throw':
							throw new ReactiveError('[reactive] Max effect chain reached')
						case 'debug':
							// biome-ignore lint/suspicious/noDebugger: This is the whole point here
							debugger
							break
						case 'warn':
							options.warn('[reactive] Max effect chain reached')
							break
					}
				}
				const [root, effect] = batchedEffects.entries().next().value!
				runEffects.push(root)
				const rv = effect()
				if (!('value' in firstReturn)) firstReturn.value = rv
				batchedEffects.delete(root)
			}
			const cleanups = Array.from(batchCleanups)
			batchCleanups.clear()
			for (const cleanup of cleanups) cleanup()
			return firstReturn.value
		} finally {
			batchedEffects = undefined
			options.endChain()
		}
	}
}

/**
 * Decorator that makes methods atomic - batches all effects triggered within the method
 */
export const atomic = decorator({
	method(original) {
		return function (...args: any[]) {
			return batch(
				markWithRoot(() => original.apply(this, args), original),
				'immediate'
			)
		}
	},
	default<Args extends any[], Return>(
		original: (...args: Args) => Return
	): (...args: Args) => Return {
		return function (...args: Args) {
			return batch(
				markWithRoot(() => original.apply(this, args), original),
				'immediate'
			)
		}
	},
})

/**
 * Executes a function with a specific effect context
 * @param effect - The effect to use as context
 * @param fn - The function to execute
 * @param keepParent - Whether to keep the parent effect context
 * @returns The result of the function
 */
export function withEffect<T>(
	effect: ScopedCallback | undefined,
	fn: () => T,
	keepParent?: true
): T {
	const currentActiveEffect = getActiveEffect()
	if (getRoot(effect) === getRoot(currentActiveEffect)) return fn()
	const oldActiveEffect = currentActiveEffect
	const oldParentEffect = getParentEffect()
	setActiveEffect(effect)
	if (!keepParent) setParentEffect(effect)
	try {
		return fn()
	} finally {
		setActiveEffect(oldActiveEffect)
		setParentEffect(oldParentEffect)
	}
}

const fr = new FinalizationRegistry<() => void>((f) => f())

/**
 * @param fn - The effect function to run - provides the cleaner
 * @returns The cleanup function
 */
/**
 * Creates a reactive effect that automatically re-runs when dependencies change
 * @param fn - The effect function that provides dependencies and may return a cleanup function
 * @param args - Additional arguments that are forwarded to the effect function
 * @returns A cleanup function to stop the effect
 */
export function effect<Args extends any[]>(
	//biome-ignore lint/suspicious/noConfusingVoidType: We have to
	fn: (access: DependencyAccess, ...args: Args) => ScopedCallback | undefined | void,
	...args: Args
): ScopedCallback {
	let cleanup: (() => void) | null = null
	// capture the parent effect at creation time for ascend
	const parentForAscend = getParentEffect()
	const tracked = markWithRoot(<T>(cb: () => T) => withEffect(runEffect, cb), fn)
	const ascend = markWithRoot(
		<T>(cb: () => T) => withEffect(parentForAscend, cb),
		getRoot(parentForAscend)
	)
	let effectStopped = false
	let hasReacted = false

	function runEffect() {
		// Clear previous dependencies
		cleanup?.()
		// The effect has been stopped after having been planned
		if (effectStopped) return

		options.enter(getRoot(fn))
		let reactionCleanup: ScopedCallback | undefined
		try {
			reactionCleanup = withEffect(runEffect, () =>
				fn({ tracked, ascend, reaction: hasReacted }, ...args)
			) as undefined | ScopedCallback
		} finally {
			hasReacted = true
			options.leave(fn)
		}

		// Create cleanup function for next run
		cleanup = () => {
			cleanup = null
			reactionCleanup?.()
			// Remove this effect from all reactive objects it's watching
			const effectObjects = effectToReactiveObjects.get(runEffect)
			if (effectObjects) {
				for (const reactiveObj of effectObjects) {
					const objectWatchers = watchers.get(reactiveObj)
					if (objectWatchers) {
						for (const [prop, deps] of objectWatchers.entries()) {
							deps.delete(runEffect)
							if (deps.size === 0) {
								objectWatchers.delete(prop)
							}
						}
						if (objectWatchers.size === 0) {
							watchers.delete(reactiveObj)
						}
					}
				}
				effectToReactiveObjects.delete(runEffect)
			}
			// Invoke all child stops (recursive via subEffectCleanup calling its own mainCleanup)
			const children = effectChildren.get(runEffect)
			if (children) {
				for (const childCleanup of children) childCleanup()
				effectChildren.delete(runEffect)
			}
		}
	}
	// Mark the runEffect callback with the original function as its root
	markWithRoot(runEffect, fn)

	batch(runEffect, 'immediate')

	const stopEffect = (): void => {
		if (effectStopped) return
		effectStopped = true
		cleanup?.()
		fr.unregister(stopEffect)
	}

	const parent = getParentEffect()
	// Store parent relationship for hierarchy traversal
	effectParent.set(runEffect, parent)
	// Only ROOT effects are registered for GC cleanup
	if (!parent) {
		const callIfCollected = () => stopEffect()
		fr.register(callIfCollected, stopEffect, stopEffect)
		return callIfCollected
	}
	// Register this effect to be stopped when the parent effect is cleaned up
	let children = effectChildren.get(parent)
	if (!children) {
		children = new Set()
		effectChildren.set(parent, children)
	}
	const subEffectCleanup = (): void => {
		children.delete(subEffectCleanup)
		if (children.size === 0) {
			effectChildren.delete(parent)
		}
		// Execute this child effect cleanup (which triggers its own mainCleanup)
		stopEffect()
	}
	children.add(subEffectCleanup)
	return subEffectCleanup
}

/**
 * Executes a function without tracking dependencies
 * @param fn - The function to execute
 */
export function untracked<T>(fn: () => T): T {
	let rv: T
	withEffect(
		undefined,
		() => {
			rv = fn()
		} /*,
		true*/
	)
	return rv
}

export { effectTrackers }
