import { tag } from '../utils'
import { asyncZone, ZoneAggregator, ZoneHistory } from '../zone'
import { getRoot } from './registry'
import {
	cleanup,
	CleanupReason,
	type EffectTrigger,
	type ScopedCallback,
	stopped,
} from './types'

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

/**
 * ADD a cleanup function to an object using the cleanup symbol.
 * The cleanup function will be called when the object needs to be disposed.
 *
 * Note: most of the time, you don't need to use this function directly.
 * The main use if for the cleanup function to be stored with the object, as GC calls the cleanup function when the *function* is garbage collected.
 *
 * @param obj - The object to attach the cleanup function to
 * @param cleanupFn - The cleanup function to attach
 * @returns The object with the cleanup function attached
 */
export function cleanedBy<T extends object>(obj: T, cleanupFn: ScopedCallback) {
	const oldCleanup = obj[cleanup]
	return Object.defineProperty(obj, cleanup, {
		value: oldCleanup
			? Object.defineProperties(
					(reason?: CleanupReason) => {
						oldCleanup(reason)
						cleanupFn(reason)
					},
					{
						[stopped]: { get: () => oldCleanup[stopped] || cleanupFn[stopped] },
					}
				)
			: cleanupFn,
		writable: false,
		enumerable: false,
		configurable: true,
	}) as T & { [cleanup]: ScopedCallback }
}

