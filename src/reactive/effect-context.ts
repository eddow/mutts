import { tag } from '../utils'
import { asyncZone, ZoneAggregator, ZoneHistory } from '../zone'
import { getRoot } from './registry'
import type { CleanupReason, EffectTrigger, ScopedCallback } from './types'

export const effectHistory = tag('effectHistory', new ZoneHistory<EffectTrigger>())
tag('effectHistory.present', effectHistory.present)
asyncZone.add(effectHistory)

/**
 * Aggregator for zones that need to be tracked along effects.
 * ie. in each effect, the active zone of the given zoning will be the one active at effect's definition
 */
export const effectAggregator = tag('effectAggregator', new ZoneAggregator(effectHistory.present))

export function isRunning(effect: EffectTrigger): boolean {
	const root = getRoot(effect)
	return effectHistory.some((e) => getRoot(e) === root)
}

export function getActiveEffect() {
	return effectHistory.present.active
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
export function link<T extends object>(obj: T, ...cleanupFns: (ScopedCallback | object)[]): T {
	const set = cleanups.get(obj)
	if (!set) cleanups.set(obj, new Set(cleanupFns))
	else for (const fn of cleanupFns) set.add(fn)
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
