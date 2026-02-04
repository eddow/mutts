import { tag } from '../utils'
import { asyncZone, ZoneAggregator, ZoneHistory } from '../zone'
import { getRoot } from './registry'
import { type EffectTrigger } from './types'

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