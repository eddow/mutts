import { tag } from '../utils'
import { asyncZone, Zone, ZoneAggregator, ZoneHistory } from '../zone'
import { getRoot } from './registry'
import type { CleanupReason, EffectTrigger, ScopedCallback } from './types'

export const effectHistory = tag('effectHistory', new ZoneHistory<EffectTrigger>())
tag('effectHistory.present', effectHistory.present)
asyncZone.add(effectHistory)
export const externalReason = tag('externalReason', new Zone<CleanupReason>())
asyncZone.add(externalReason)

/**
 * Aggregator for zones that need to be tracked along effects.
 * ie. in each effect, the active zone of the given zoning will be the one active at effect's definition
 */
export const effectAggregator = tag('effectAggregator', new ZoneAggregator(effectHistory.present))
effectAggregator.add(externalReason)

export function chainExternalReason(reason?: CleanupReason): CleanupReason | undefined {
	const external = externalReason.active
	if (!external) return reason
	if (!reason) return external
	let current: CleanupReason | undefined = reason
	while (current) {
		if (
			current.type === 'external' &&
			external.type === 'external' &&
			current.detail === external.detail
		)
			return reason
		current = current.chain
	}
	return { ...reason, chain: chainExternalReason(reason.chain) }
}

export function isRunning(effect: EffectTrigger): boolean {
	const root = getRoot(effect)
	return effectHistory.some((e) => getRoot(e) === root)
}

export function getActiveEffect() {
	return effectHistory.present.active
}

/**
 * Opaque token representing a captured effect context.
 * Obtained via `effectContext()`, consumed by `withEffectContext()`.
 */
export type EffectContext = { readonly __brand: unique symbol }

/**
 * Captures the current effect context so that deferred code can later
 * create child effects parented to this point in the effect tree.
 *
 * @returns An opaque token to pass to `withEffectContext()`
 *
 * @example
 * ```ts
 * const ctx = effectContext() // inside an effect or root()
 * // later, in a deferred callback:
 * withEffectContext(ctx, () => {
 *   effect(() => { /* child of the captured context *​/ })
 * })
 * ```
 */
export function effectContext(): EffectContext | undefined {
	return effectHistory.active as unknown as EffectContext | undefined
}

/**
 * Runs `fn` within a previously captured effect context.
 * Any effects created inside `fn` become children of the captured parent.
 *
 * @param ctx - The context token from `effectContext()`, or `undefined` for root context
 * @param fn - The function to execute within the restored context
 * @returns The return value of `fn`
 */
export function withEffectContext<R>(ctx: EffectContext | undefined, fn: () => R): R {
	return effectHistory.with(ctx as any, fn)
}

const cleanups = new WeakMap<object, Set<ScopedCallback | object>>()

/**
 * Attach cleanup dependencies to an object. When `unlink(obj)` is called,
 * each dependency is disposed: functions are invoked with the cleanup reason,
 * objects are recursively `unlink`ed. This forms a cleanup tree.
 *
 * @param obj - The owner object
 * @param cleanupFns - Cleanup callbacks and/or child objects to unlink recursively
 * @returns The owner object (for chaining)
 *
 * @example
 * ```ts
 * // Functions are called with CleanupReason
 * link(parent, () => console.log('disposed'))
 *
 * // Objects are recursively unlinked
 * link(parent, childA, childB)
 *
 * // Mixed
 * link(parent, childObj, () => timer.clear())
 *
 * unlink(parent) // disposes childA, childB, calls the function
 * ```
 */
export function link<T extends object>(
	obj: T,
	...cleanupFns: (ScopedCallback | object | undefined)[]
): T {
	const set = cleanups.get(obj)
	if (!set)
		cleanups.set(
			obj,
			new Set(cleanupFns.filter((fn): fn is ScopedCallback | object => fn !== undefined))
		)
	else for (const fn of cleanupFns) if (fn) set.add(fn)
	return obj
}

/**
 * Dispose an object's cleanup dependencies. Functions are called with the
 * reason; linked objects are recursively unlinked. The cleanup set is removed
 * so calling `unlink` twice is safe (second call is a no-op).
 *
 * @param obj - The object to dispose
 * @param reason - Optional cleanup reason propagated to callbacks
 */
export function unlink(obj: object, reason?: CleanupReason): void {
	const set = cleanups.get(obj)
	if (set) {
		cleanups.delete(obj)
		for (const fn of set)
			if (typeof fn === 'function') fn(reason)
			else unlink(fn, reason)
	}
}
