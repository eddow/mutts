import { debugHooks } from './debug-hooks'
import { bubbleUpChange, objectsWithDeepWatchers } from './deep-watch-state'
import { getActiveEffect, isRunning } from './effect-context'
import { batch, hasBatched, recordActivation } from './effects'
import { getEffectNode, watchers } from './registry'
import {
	allProps,
	type EffectTrigger,
	type Evolution,
	keysOf,
	optionCall,
	options,
	type State,
	unwrap,
} from './types'

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
	effects: Set<EffectTrigger>,
	objectWatchers: Map<any, Set<EffectTrigger>>,
	...keyChains: Iterable<any>[]
) {
	const sourceEffect = getActiveEffect()
	for (const keys of keyChains)
		for (const key of keys) {
			const deps = objectWatchers.get(key)
			if (deps) {
				for (const effect of deps) {
					const runningChain = isRunning(effect)
					if (runningChain) {
						optionCall('skipRunningEffect', effect)
						continue
					}
					if (!effects.has(effect)) {
						effects.add(effect)
						if (!hasBatched(effect)) recordActivation(effect, obj, evolution, key)
					}
					debugHooks.recordTriggerLink(sourceEffect, effect, obj, key, evolution)
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
		const effects = new Set<EffectTrigger>()
		const structural = evolution.type !== 'set'
		const broad = structural ? [allProps, keysOf] : [allProps]
		if (props) collectEffects(obj, evolution, effects, objectWatchers, broad, props)
		else collectEffects(obj, evolution, effects, objectWatchers, objectWatchers.keys())
		optionCall('touched', obj, evolution, props as any[] | undefined, effects)
		// Store pending triggers for CleanupReason before batching
		if (options.introspection?.gatherReasons) {
			const stack = debugHooks.isDevtoolsEnabled() ? new Error().stack : undefined
			for (const effect of effects) {
				const node = getEffectNode(effect)
				if (!node.pendingTriggers) node.pendingTriggers = []
				node.pendingTriggers.push({ obj, evolution, stack })
			}
		}
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

	const effects = new Set<EffectTrigger>()
	const sourceEffect = getActiveEffect()

	const gather = options.introspection?.gatherReasons
	const stack = gather && debugHooks.isDevtoolsEnabled() ? new Error().stack : undefined
	for (const effect of deps) {
		const node = getEffectNode(effect)
		if (!node.isOpaque) continue

		const runningChain = isRunning(effect)
		if (runningChain) {
			optionCall('skipRunningEffect', effect)
			continue
		}
		effects.add(effect)
		if (gather) {
			if (!node.pendingTriggers) node.pendingTriggers = []
			node.pendingTriggers.push({ obj, evolution, stack })
		}
		recordActivation(effect, obj, evolution, prop)
		debugHooks.recordTriggerLink(sourceEffect, effect, obj, prop, evolution)
	}

	if (effects.size > 0) {
		optionCall('touched', obj, evolution, [prop], effects)
		batch(Array.from(effects))
	}
}
