import { recordTriggerLink } from './debug'
import { bubbleUpChange, objectsWithDeepWatchers } from './deep-watch-state'
import { getActiveEffect, isRunning } from './effect-context'
import { batch, effectTrackers, hasBatched, opaqueEffects, recordActivation } from './effects'
import { unwrap } from './proxy-state'
import { watchers } from './registry'
import { allProps, type Evolution, options, type ScopedCallback, type State } from './types'

const states = new WeakMap<object, State>()

export function addState(obj: any, evolution: Evolution) {
	obj = unwrap(obj)
	const next = {}
	const state = getState(obj)
	if (state) Object.assign(state, { evolution, next })
	states.set(obj, next)
}

/**
 * Gets the current state of a reactive object for evolution tracking
 * @param obj - The reactive object
 * @returns The current state object
 */
export function getState(obj: any) {
	obj = unwrap(obj)
	let state = states.get(obj)
	if (!state) {
		state = {}
		states.set(obj, state)
	}
	return state
}

export function collectEffects(
	obj: any,
	evolution: Evolution,
	effects: Set<ScopedCallback>,
	objectWatchers: Map<any, Set<ScopedCallback>>,
	...keyChains: Iterable<any>[]
) {
	const sourceEffect = getActiveEffect()
	for (const keys of keyChains)
		for (const key of keys) {
			const deps = objectWatchers.get(key)
			if (deps)
				for (const effect of deps) {
					const runningChain = isRunning(effect)
					if (runningChain) {
						options.skipRunningEffect(effect, runningChain as any)
						continue
					}
					if (!effects.has(effect)) {
						effects.add(effect)
						if (!hasBatched(effect)) recordActivation(effect, obj, evolution, key)
					}
					const trackers = effectTrackers.get(effect)
					recordTriggerLink(sourceEffect, effect, obj, key, evolution)
					if (trackers) {
						for (const tracker of trackers) tracker(obj, evolution, key)
						trackers.delete(effect)
					}
				}
		}
}

/**
 * Triggers effects for a single property change
 * @param obj - The object that changed
 * @param evolution - The type of change
 * @param prop - The property that changed
 */
export function touched1(obj: any, evolution: Evolution, prop: any) {
	touched(obj, evolution, [prop])
}

/**
 * Triggers effects for property changes
 * @param obj - The object that changed
 * @param evolution - The type of change
 * @param props - The properties that changed
 */
export function touched(obj: any, evolution: Evolution, props?: Iterable<any>) {
	obj = unwrap(obj)
	addState(obj, evolution)
	const objectWatchers = watchers.get(obj)
	if (objectWatchers) {
		// Note: we have to collect effects to remove duplicates in the specific case when no batch is running
		const effects = new Set<ScopedCallback>()
		if (props) collectEffects(obj, evolution, effects, objectWatchers, [allProps], props)
		else collectEffects(obj, evolution, effects, objectWatchers, objectWatchers.keys())
		options.touched(obj, evolution, props as any[] | undefined, effects)
		batch(Array.from(effects))
	}

	// Bubble up changes if this object has deep watchers
	if (objectsWithDeepWatchers.has(obj)) {
		bubbleUpChange(obj, evolution)
	}
}

/**
 * Triggers only opaque effects for property changes
 * Used by deep-touch to ensure opaque listeners are notified even when deep optimization is active
 */
export function touchedOpaque(obj: any, evolution: Evolution, prop: any) {
	obj = unwrap(obj)
	const objectWatchers = watchers.get(obj)
	if (!objectWatchers) return

	const deps = objectWatchers.get(prop)
	if (!deps) return

	const effects = new Set<ScopedCallback>()
	const sourceEffect = getActiveEffect()

	for (const effect of deps) {
		if (!opaqueEffects.has(effect)) continue

		const runningChain = isRunning(effect)
		if (runningChain) {
			options.skipRunningEffect(effect, runningChain as any)
			continue
		}
		effects.add(effect)
		recordActivation(effect, obj, evolution, prop)
		const trackers = effectTrackers.get(effect)
		recordTriggerLink(sourceEffect, effect, obj, prop, evolution)
		if (trackers) {
			for (const tracker of trackers) tracker(obj, evolution, prop)
			trackers.delete(effect)
		}
	}

	if (effects.size > 0) {
		options.touched(obj, evolution, [prop], effects)
		batch(Array.from(effects))
	}
}
