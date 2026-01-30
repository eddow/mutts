import { tag } from '../utils'
import { asyncZone, configureAsyncZone, ZoneAggregator, ZoneHistory } from '../zone'
import { getRoot } from './registry'
import { options, type ScopedCallback } from './types'

export const effectHistory = tag(new ZoneHistory<ScopedCallback>(), 'effectHistory')
tag(effectHistory.present, 'effectHistory.present')
asyncZone.add(effectHistory)
export const effectAggregator = tag(new ZoneAggregator(effectHistory.present), 'effectAggregator')
configureAsyncZone(options.zones)

export function isRunning(effect: ScopedCallback): boolean {
	const root = getRoot(effect)
	return effectHistory.some((e) => getRoot(e) === root)
}

export function getActiveEffect() {
	return effectHistory.present.active
}