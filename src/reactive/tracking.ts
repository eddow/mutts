import { getActiveEffect } from './effect-context'
import { unwrap } from './proxy-state'
import { effectToReactiveObjects, watchers } from './registry'
import { allProps, keysOf, type EffectTrigger } from './types'

/**
 * Marks a property as a dependency of the current effect
 * @param obj - The object containing the property
 * @param prop - The property name (defaults to allProps)
 */
export function dependant(obj: any, prop: any = allProps) {
	obj = unwrap(obj)
	const currentActiveEffect = getActiveEffect()

	// Early return if no active effect, tracking disabled, or invalid prop
	if (!currentActiveEffect || (typeof prop === 'symbol' && prop !== allProps && prop !== keysOf)) return

	if ('dependencyHook' in currentActiveEffect) {
		// @ts-expect-error We declared it nowhere - it's okay as it's really internal and for edge-case debug purpose only
		currentActiveEffect.dependencyHook(obj, prop)
	}
	let objectWatchers = watchers.get(obj)
	if (!objectWatchers) {
		objectWatchers = new Map<PropertyKey, Set<EffectTrigger>>()
		watchers.set(obj, objectWatchers)
	}
	let deps = objectWatchers.get(prop)
	if (!deps) {
		deps = new Set<EffectTrigger>()
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
