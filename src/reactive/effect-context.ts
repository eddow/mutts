import { tag } from '../utils'
import { asyncZone, ZoneAggregator, ZoneHistory } from '../zone'
import { getRoot } from './registry'
import { type ScopedCallback } from './types'

export const effectHistory = tag('effectHistory', new ZoneHistory<ScopedCallback>())
tag('effectHistory.present', effectHistory.present)
asyncZone.add(effectHistory)
export const effectAggregator = tag('effectAggregator', new ZoneAggregator(effectHistory.present))

export function isRunning(effect: ScopedCallback): boolean {
	const root = getRoot(effect)
	return effectHistory.some((e) => getRoot(e) === root)
}

export function getActiveEffect() {
	return effectHistory.present.active
}