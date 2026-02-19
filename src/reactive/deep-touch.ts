import { addState, collectEffects, touched1, touchedOpaque } from './change'
import { debugHooks } from './debug-hooks'
import { bubbleUpChange, objectsWithDeepWatchers } from './deep-watch-state'
import { batch, untracked } from './effects'
import { isNonReactive } from './non-reactive-state'
import { getEffectNode, watchers } from './registry'
import { getDependencyStack } from './tracking'
import {
	allProps,
	type EffectCleanup,
	type EffectTrigger,
	type Evolution,
	keysOf,
	optionCall,
	options,
	unwrap,
} from './types'

function getPrototypeToken(value: any): object | null | undefined {
	if (Array.isArray(value)) return Array.prototype
	if (typeof value !== 'object') return undefined
	try {
		return value.constructor
	} catch {
		return undefined
	}
}

export function shouldRecurseTouch(oldValue: any, newValue: any): boolean {
	if (oldValue === newValue) return false
	if (
		(typeof oldValue !== 'object' && !Array.isArray(oldValue)) ||
		(typeof newValue !== 'object' && !Array.isArray(newValue))
	)
		return false
	if (isNonReactive(oldValue) || isNonReactive(newValue)) return false
	return getPrototypeToken(oldValue) === getPrototypeToken(newValue)
}

/**
 * Centralized function to handle property change notifications with optional recursive touch
 * @param targetObj - The object whose property changed
 * @param prop - The property that changed
 * @param oldValue - The old value (before change)
 * @param newValue - The new value (after change)
 * @param hadProperty - Whether the property existed before (for add vs set)
 */
export function notifyPropertyChange(
	targetObj: any,
	prop: any,
	oldValue: any,
	newValue: any,
	hadProperty: boolean
) {
	const evolution: Evolution = { type: hadProperty ? 'set' : 'add', prop }

	if (
		options.recursiveTouching &&
		oldValue !== undefined &&
		shouldRecurseTouch(oldValue, newValue)
	) {
		const unwrappedObj = unwrap(targetObj)
		const origin = { obj: unwrappedObj, prop }
		// Deep touch: only notify nested property changes with origin filtering
		// Don't notify direct property change - the whole point is to avoid parent effects re-running
		dispatchNotifications(
			untracked(() => recursiveTouch(oldValue, newValue, new WeakMap(), [], origin))
		)

		// Notify opaque listeners (like memoize) that always want to know about identity changes
		touchedOpaque(targetObj, evolution, prop)
	} else {
		touched1(targetObj, evolution, prop)
	}
}

type VisitedPairs = WeakMap<object, WeakSet<object>>
type PendingNotification = {
	target: any
	evolution: Evolution
	prop: any
	origin?: { obj: object; prop: PropertyKey } // The property access that triggered this deep touch
}

function hasVisitedPair(visited: VisitedPairs, oldObj: object, newObj: object): boolean {
	let mapped = visited.get(oldObj)
	if (!mapped) {
		mapped = new WeakSet<object>()
		visited.set(oldObj, mapped)
	}
	if (mapped.has(newObj)) return true
	mapped.add(newObj)
	return false
}

function collectObjectKeys(obj: any): Set<PropertyKey> {
	const keys = new Set<PropertyKey>(Reflect.ownKeys(obj))
	let proto = Object.getPrototypeOf(obj)
	// Continue walking while prototype exists and doesn't have its own constructor
	// This stops at Object.prototype (has own constructor) and class prototypes (have own constructor)
	// but continues for data prototypes (Object.create({}), Object.create(instance), etc.)
	while (proto && !Object.hasOwn(proto, 'constructor')) {
		for (const key of Reflect.ownKeys(proto)) keys.add(key)
		proto = Object.getPrototypeOf(proto)
	}
	return keys
}

export function recursiveTouch(
	oldValue: any,
	newValue: any,
	visited: VisitedPairs = new WeakMap(),
	notifications: PendingNotification[] = [],
	origin?: { obj: object; prop: PropertyKey }
): PendingNotification[] {
	if (!shouldRecurseTouch(oldValue, newValue)) return notifications
	if (
		(typeof oldValue !== 'object' && !Array.isArray(oldValue)) ||
		(typeof newValue !== 'object' && !Array.isArray(newValue))
	)
		return notifications
	if (hasVisitedPair(visited, oldValue, newValue)) return notifications

	if (Array.isArray(oldValue) && Array.isArray(newValue)) {
		diffArrayElements(oldValue, newValue, visited, notifications, origin)
		return notifications
	}

	diffObjectProperties(oldValue, newValue, visited, notifications, origin)
	return notifications
}

function diffArrayElements(
	oldArray: any[] | readonly any[],
	newArray: any[] | readonly any[],
	_visited: VisitedPairs,
	notifications: PendingNotification[],
	origin?: { obj: object; prop: PropertyKey }
) {
	const local: PendingNotification[] = []
	const oldLength = oldArray.length
	const newLength = newArray.length
	const max = Math.max(oldLength, newLength)

	for (let index = 0; index < max; index++) {
		const hasOld = index < oldLength
		const hasNew = index < newLength
		if (hasOld && !hasNew) {
			local.push({ target: oldArray, evolution: { type: 'del', prop: index }, prop: index, origin })
			continue
		}
		if (!hasOld && hasNew) {
			local.push({ target: oldArray, evolution: { type: 'add', prop: index }, prop: index, origin })
			continue
		}
		if (!hasOld || !hasNew) continue
		const oldEntry = unwrap(oldArray[index])
		const newEntry = unwrap(newArray[index])
		if (!Object.is(oldEntry, newEntry)) {
			local.push({ target: oldArray, evolution: { type: 'set', prop: index }, prop: index, origin })
		}
	}

	if (oldLength !== newLength)
		local.push({
			target: oldArray,
			evolution: { type: 'set', prop: 'length' },
			prop: 'length',
			origin,
		})

	notifications.push(...local)
}

function diffObjectProperties(
	oldObj: any,
	newObj: any,
	visited: VisitedPairs,
	notifications: PendingNotification[],
	origin?: { obj: object; prop: PropertyKey }
) {
	const oldKeys = collectObjectKeys(oldObj)
	const newKeys = collectObjectKeys(newObj)
	const local: PendingNotification[] = []

	for (const key of oldKeys)
		if (!newKeys.has(key))
			local.push({ target: oldObj, evolution: { type: 'del', prop: key }, prop: key, origin })

	for (const key of newKeys)
		if (!oldKeys.has(key))
			local.push({ target: oldObj, evolution: { type: 'add', prop: key }, prop: key, origin })

	for (const key of newKeys) {
		if (!oldKeys.has(key)) continue
		const oldEntry = unwrap((oldObj as any)[key])
		const newEntry = unwrap((newObj as any)[key])
		if (shouldRecurseTouch(oldEntry, newEntry)) {
			recursiveTouch(oldEntry, newEntry, visited, notifications, origin)
		} else if (!Object.is(oldEntry, newEntry)) {
			local.push({ target: oldObj, evolution: { type: 'set', prop: key }, prop: key, origin })
		}
	}

	notifications.push(...local)
}

/**
 * Checks if an effect or any of its ancestors is in the allowed set
 */
function hasAncestorInSet(
	effect: EffectTrigger | EffectCleanup,
	allowedSet: Set<EffectTrigger | EffectCleanup>
): boolean {
	let current: EffectTrigger | EffectCleanup | undefined = effect
	const visited = new WeakSet<EffectTrigger | EffectCleanup>()
	while (current && !visited.has(current)) {
		visited.add(current)
		if (allowedSet.has(current)) return true
		const node = getEffectNode(current as EffectTrigger)
		current = node.parent
	}
	return false
}

export function dispatchNotifications(notifications: PendingNotification[]) {
	if (!notifications.length) return
	const combinedEffects = new Set<EffectTrigger>()
	const effectCauses = new Map<EffectTrigger, PendingNotification[]>()

	// Extract origin from first notification (all should have the same origin from a single deep touch)
	const origin = notifications[0]?.origin
	let allowedEffects: Set<EffectTrigger> | undefined

	// If origin exists, compute allowed effects (those that depend on origin.obj[origin.prop])
	if (origin) {
		allowedEffects = new Set<EffectTrigger>()
		const originWatchers = watchers.get(origin.obj)
		if (originWatchers) {
			const originEffects = new Map<EffectTrigger, unknown>()
			collectEffects(
				origin.obj,
				{ type: 'set', prop: origin.prop },
				originEffects,
				originWatchers,
				[allProps],
				[origin.prop]
			)
			for (const effect of originEffects.keys()) allowedEffects.add(effect)
		}
		// If no allowed effects, skip all notifications (no one should be notified)
		if (allowedEffects.size === 0) return
	}

	for (const notification of notifications) {
		const { target, evolution, prop } = notification
		if (typeof target !== 'object' && !Array.isArray(target)) continue
		const obj = unwrap(target)
		addState(obj, evolution)
		const objectWatchers = watchers.get(obj)
		let currentEffects: Map<EffectTrigger, unknown> | undefined
		const propsArray = [prop]
		if (objectWatchers) {
			// console.log(`[DEBUG] dispatchNotifications: processing ${obj.constructor.name} (has watchers)`)
			currentEffects = new Map<EffectTrigger, unknown>()
			const broad = evolution.type !== 'set' ? [allProps, keysOf] : [allProps]
			collectEffects(obj, evolution, currentEffects, objectWatchers, broad, propsArray)

			// Filter effects by ancestor chain if origin exists
			// Include effects that either directly depend on origin or have an ancestor that does
			if (origin && allowedEffects) {
				const filteredEffects = new Map<EffectTrigger, unknown>()
				for (const [effect, associated] of currentEffects) {
					// Check if effect itself is allowed OR has an ancestor that is allowed
					if (allowedEffects.has(effect) || hasAncestorInSet(effect, allowedEffects)) {
						filteredEffects.set(effect, associated)
					}
				}
				currentEffects = filteredEffects
			}

			for (const effect of currentEffects.keys()) {
				combinedEffects.add(effect)
				let causes = effectCauses.get(effect)
				if (!causes) {
					causes = []
					effectCauses.set(effect, causes)
				}
				causes.push(notification)
			}
		}
		optionCall('touched', obj, evolution, propsArray, Array.from(currentEffects.keys()))
		if (objectsWithDeepWatchers.has(obj)) bubbleUpChange(obj, evolution)
	}
	if (combinedEffects.size) {
		if (options.introspection?.gatherReasons) {
			const gatherReasons = options.introspection.gatherReasons
			const lineageConfig = gatherReasons.lineages
			
			let touchStack: unknown | undefined
			if (lineageConfig === 'touch' || lineageConfig === 'both') {
				touchStack = debugHooks.captureLineage()
			}
			
			for (const effect of combinedEffects) {
				const node = getEffectNode(effect)
				if (!node.pendingTriggers) node.pendingTriggers = []
				for (const { target, evolution, prop } of effectCauses.get(effect)!) {
					const dependencyStack = (lineageConfig === 'dependency' || lineageConfig === 'both')
						? getDependencyStack(effect, unwrap(target), prop ?? allProps)
						: undefined
					node.pendingTriggers.push({ obj: unwrap(target), evolution, dependency: dependencyStack, touch: touchStack })
				}
			}
		}
		batch([...combinedEffects])
	}
}
