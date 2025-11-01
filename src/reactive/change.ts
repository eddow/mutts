import { bubbleUpChange, objectsWithDeepWatchers } from './deep-watch'
import { batch, effectTrackers } from './effects'
import { unwrap } from './proxy'
import { watchers } from './tracking'
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
	for (const keys of keyChains)
		for (const key of keys) {
			const deps = objectWatchers.get(key)
			if (deps)
				for (const effect of Array.from(deps)) {
					effects.add(effect)
					const trackers = effectTrackers.get(effect)
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
		if (props) {
			props = Array.from(props) // For debug purposes only
			collectEffects(obj, evolution, effects, objectWatchers, [allProps], props)
		} else collectEffects(obj, evolution, effects, objectWatchers, objectWatchers.keys())
		options.touched(obj, evolution, props as any[] | undefined, effects)
		batch(Array.from(effects))
	}

	// Bubble up changes if this object has deep watchers
	if (objectsWithDeepWatchers.has(obj)) {
		bubbleUpChange(obj, evolution)
	}
}
