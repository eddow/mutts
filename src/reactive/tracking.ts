import { debugHooks } from './debug-hooks'
import { getActiveEffect } from './effect-context'
import { effectToReactiveObjects, getEffectNode, watchers } from './registry'
import { allProps, type EffectTrigger, keysOf, options, unwrap } from './types'

// Track dependency stacks per (obj, prop, effect)
let dependencyStacks = new WeakMap<object, Map<any, Map<EffectTrigger, unknown>>>()
let assertUntrackedFlag = false

export function resetTracking() {
	dependencyStacks = new WeakMap()
}

/**
 * Executes a function and throws if any reactive dependencies are tracked during execution.
 * Used to assert that code runs in an untracked context.
 */
export function assertUntracked<T>(fn: () => T): T {
	if (assertUntrackedFlag) {
		throw new Error('assertUntracked: nested calls are not supported')
	}
	assertUntrackedFlag = true
	try {
		return fn()
	} finally {
		assertUntrackedFlag = false
	}
}

function getDependencyStack(effect: EffectTrigger, obj: object, prop: any): unknown | undefined {
	const objStacks = dependencyStacks.get(obj)
	if (!objStacks) return undefined
	return objStacks.get(prop)?.get(effect) ?? objStacks.get(allProps)?.get(effect)
}

export { getDependencyStack }

/**
 * Marks a property as a dependency of the current effect
 * @param obj - The object containing the property
 * @param prop - The property name (defaults to allProps)
 */
export function dependant(obj: any, prop: any = allProps) {
	if (assertUntrackedFlag) {
		throw new Error(
			`Reactive dependency tracking detected in assertUntracked context: ${String(prop)} on ${obj}`
		)
	}
	obj = unwrap(obj)
	const currentActiveEffect = getActiveEffect()

	// Early return if no active effect, tracking disabled, or invalid prop
	if (!currentActiveEffect || (typeof prop === 'symbol' && prop !== allProps && prop !== keysOf))
		return

	const node = getEffectNode(currentActiveEffect)
	if ('dependencyHook' in node) {
		node.dependencyHook?.(obj, prop)
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

	// Store dependency stack if introspection is enabled
	const gatherReasons = options.introspection?.gatherReasons
	if (gatherReasons) {
		const lineageConfig = gatherReasons.lineages
		if (lineageConfig === 'dependency' || lineageConfig === 'both') {
			let objStacks = dependencyStacks.get(obj)
			if (!objStacks) {
				objStacks = new Map()
				dependencyStacks.set(obj, objStacks)
			}
			let propStacks = objStacks.get(prop)
			if (!propStacks) {
				propStacks = new Map()
				objStacks.set(prop, propStacks)
			}
			propStacks.set(currentActiveEffect, debugHooks.captureLineage())
		}
	}
}
