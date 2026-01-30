import { tag } from '../utils'
import { asyncZone, ZoneAggregator, ZoneHistory } from '../zone'
import { getRoot } from './registry'
import { type ScopedCallback } from './types'

export const effectHistory = tag(new ZoneHistory<ScopedCallback>(), 'effectHistory')
tag(effectHistory.present, 'effectHistory.present')
asyncZone.add(effectHistory)
export const effectAggregator = tag(new ZoneAggregator(effectHistory.present), 'effectAggregator')

export function isRunning(effect: ScopedCallback): boolean {
	const root = getRoot(effect)
	return effectHistory.some((e) => getRoot(e) === root)
}

export function getActiveEffect() {
	return effectHistory.present.active
}