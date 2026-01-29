import { getActiveEffect } from './effect-context'
import { unwrap } from './proxy-state'
import {
	effectToReactiveObjects,
	getRoot,
	globalTrackingDisabled,
	setGlobalTrackingDisabled,
	trackingDisabledEffects,
	watchers,
} from './registry'
import { allProps, type ScopedCallback } from './types'

export function getTrackingDisabled(): boolean {
	const active = getActiveEffect()
	if (!active) return globalTrackingDisabled
	return trackingDisabledEffects.has(getRoot(active))
}

export function setTrackingDisabled(value: boolean): void {
	const active = getActiveEffect()
	if (!active) {
		setGlobalTrackingDisabled(value)
		return
	}
	const root = getRoot(active)
	if (value) trackingDisabledEffects.add(root)
	else trackingDisabledEffects.delete(root)
}

/**
 * Marks a property as a dependency of the current effect
 * @param obj - The object containing the property
 * @param prop - The property name (defaults to allProps)
 */
export function dependant(obj: any, prop: any = allProps) {
	obj = unwrap(obj)
	const currentActiveEffect = getActiveEffect()

	// Early return if no active effect, tracking disabled, or invalid prop
	if (
		!currentActiveEffect ||
		getTrackingDisabled() ||
		(typeof prop === 'symbol' && prop !== allProps)
	)
		return

	let objectWatchers = watchers.get(obj)
	if (!objectWatchers) {
		objectWatchers = new Map<PropertyKey, Set<ScopedCallback>>()
		watchers.set(obj, objectWatchers)
	}
	let deps = objectWatchers.get(prop)
	if (!deps) {
		deps = new Set<ScopedCallback>()
		objectWatchers.set(prop, deps)
	}
	deps.add(currentActiveEffect)

	// Track which reactive objects this effect is watching
	const effectObjects = effectToReactiveObjects.get(currentActiveEffect)
	if (effectObjects) {
		effectObjects.add(obj)
	} else {
		effectToReactiveObjects.set(currentActiveEffect, new Set([obj]))
	}
}
