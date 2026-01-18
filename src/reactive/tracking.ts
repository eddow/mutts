import { getActiveEffect } from './effect-context'
import { unwrap } from './proxy-state'
import { allProps, rootFunction, type ScopedCallback } from './types'

// Track which effects are watching which reactive objects for cleanup
export const effectToReactiveObjects = new WeakMap<ScopedCallback, Set<object>>()

// Track effects per reactive object and property
export const watchers = new WeakMap<object, Map<any, Set<ScopedCallback>>>()

// runEffect -> set<stop>
export const effectChildren = new WeakMap<ScopedCallback, Set<ScopedCallback>>()

// Track parent effect relationships for hierarchy traversal (used in deep touch filtering)
export const effectParent = new WeakMap<ScopedCallback, ScopedCallback | undefined>()

/**
 * Marks a function with its root function for effect tracking
 * @param fn - The function to mark
 * @param root - The root function
 * @returns The marked function
 */
export function markWithRoot<T extends Function>(fn: T, root: Function): T {
	// Mark fn with the new root
	return Object.defineProperty(fn, rootFunction, {
		value: getRoot(root),
		writable: false,
	})
}

/**
 * Gets the root function of a function for effect tracking
 * @param fn - The function to get the root of
 * @returns The root function
 */
export function getRoot<T extends Function | undefined>(fn: T): T {
	return (fn as any)?.[rootFunction] || fn
}

// Flag to disable dependency tracking for the current active effect (not globally)
const trackingDisabledEffects = new WeakSet<ScopedCallback>()
let globalTrackingDisabled = false

export function getTrackingDisabled(): boolean {
	const active = getActiveEffect()
	if (!active) return globalTrackingDisabled
	return trackingDisabledEffects.has(getRoot(active))
}

export function setTrackingDisabled(value: boolean): void {
	const active = getActiveEffect()
	if (!active) {
		globalTrackingDisabled = value
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

	registerDependency(obj, prop, currentActiveEffect)
}

function registerDependency(obj: any, prop: any, currentActiveEffect: ScopedCallback) {
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
