import { decorator } from '../decorator'
import { mixin } from '../mixins'
import { isOwnAccessor, ReflectGet, ReflectSet } from '../utils'
import { touched1 } from './change'
import { dispatchNotifications, recursiveTouch, shouldRecurseTouch } from './deep-touch'
import {
	addBackReference,
	bubbleUpChange,
	needsBackReferences,
	objectsWithDeepWatchers,
	removeBackReference,
	track1,
} from './deep-watch'
import { absent, isNonReactive } from './non-reactive'
import { dependant } from './tracking'
import {
	allProps,
	nativeReactive,
	nonReactiveMark,
	options,
	prototypeForwarding,
	unreactiveProperties,
} from './types'

// Track object -> proxy and proxy -> object relationships
export const objectToProxy = new WeakMap<object, object>()
export const proxyToObject = new WeakMap<object, object>()

const reactiveHandlers = {
	[Symbol.toStringTag]: 'MutTs Reactive',
	get(obj: any, prop: PropertyKey, receiver: any) {
		if (prop === nonReactiveMark) return false
		// Check if this property is marked as unreactive
		if (unwrap(obj)[unreactiveProperties]?.has(prop) || typeof prop === 'symbol')
			return ReflectGet(obj, prop, receiver)
		// Depend if...
		if (
			!Reflect.has(receiver, prop) ||
			(!(options.instanceMembers && !Object.hasOwn(receiver, prop) && obj instanceof Object) &&
				!(options.ignoreAccessors && isOwnAccessor(receiver, prop)))
		)
			dependant(obj, prop)

		const isInheritedAccess = Reflect.has(receiver, prop) && !Object.hasOwn(receiver, prop)
		// Watch the whole prototype chain when requested or for null-proto objects
		if (isInheritedAccess && (!options.instanceMembers || !(obj instanceof Object))) {
			let current = reactiveObject(Object.getPrototypeOf(obj))
			while (current && current !== Object.prototype) {
				dependant(current, prop)
				if (Object.hasOwn(current, prop)) break
				current = reactiveObject(Object.getPrototypeOf(current))
			}
		}
		const value = ReflectGet(obj, prop, receiver)
		if (typeof value === 'object' && value !== null) {
			const reactiveValue = reactiveObject(value)

			// Only create back-references if this object needs them
			if (needsBackReferences(obj)) {
				addBackReference(reactiveValue, obj, prop)
			}

			return reactiveValue
		}
		return value
	},
	set(obj: any, prop: PropertyKey, value: any, receiver: any): boolean {
		// Check if this property is marked as unreactive
		if (unwrap(obj)[unreactiveProperties]?.has(prop) || obj !== unwrap(receiver))
			return ReflectSet(obj, prop, value, receiver)
		// Really specific case for when Array is forwarder, in order to let it manage the reactivity
		const isArrayCase =
			prototypeForwarding in obj &&
			// biome-ignore lint/suspicious/useIsArray: This is the whole point here
			obj[prototypeForwarding] instanceof Array &&
			(!Number.isNaN(Number(prop)) || prop === 'length')
		const newValue = unwrap(value)

		if (isArrayCase) {
			;(obj as any)[prop] = newValue
			return true
		}

		// Read old value directly from unwrapped object to avoid triggering dependency tracking
		const unwrappedObj = unwrap(obj)
		const unwrappedReceiver = unwrap(receiver)
		const oldVal = Reflect.has(unwrappedReceiver, prop)
			? Reflect.get(unwrappedObj, prop, unwrappedReceiver)
			: absent
		track1(obj, prop, oldVal, newValue)

		if (oldVal !== newValue) {
			ReflectSet(obj, prop, newValue, receiver)

			if (oldVal !== absent && shouldRecurseTouch(oldVal, newValue)) {
				const origin = { obj: unwrappedObj, prop }
				// Deep touch: only notify nested property changes with origin filtering
				// Don't notify direct property change - the whole point is to avoid parent effects re-running
				dispatchNotifications(recursiveTouch(oldVal, newValue, new WeakMap(), [], origin))
			} else touched1(obj, { type: oldVal !== absent ? 'set' : 'add', prop }, prop)
		}
		return true
	},
	has(obj: any, prop: PropertyKey): boolean {
		dependant(obj, prop)
		return Reflect.has(obj, prop)
	},
	deleteProperty(obj: any, prop: PropertyKey): boolean {
		if (!Object.hasOwn(obj, prop)) return false

		const oldVal = (obj as any)[prop]

		// Remove back-references if this object has deep watchers
		if (objectsWithDeepWatchers.has(obj) && typeof oldVal === 'object' && oldVal !== null) {
			removeBackReference(oldVal, obj, prop)
		}

		delete (obj as any)[prop]
		touched1(obj, { type: 'del', prop }, prop)

		// Bubble up changes if this object has deep watchers
		if (objectsWithDeepWatchers.has(obj)) {
			bubbleUpChange(obj, { type: 'del', prop })
		}

		return true
	},
	getPrototypeOf(obj: any): object | null {
		if (prototypeForwarding in obj) return obj[prototypeForwarding]
		return Object.getPrototypeOf(obj)
	},
	setPrototypeOf(obj: any, proto: object | null): boolean {
		if (prototypeForwarding in obj) return false
		Object.setPrototypeOf(obj, proto)
		return true
	},
	ownKeys(obj: any): (string | symbol)[] {
		dependant(obj, allProps)
		return Reflect.ownKeys(obj)
	},
} as const

const reactiveClasses = new WeakSet<Function>()

// Create the ReactiveBase mixin
/**
 * Base mixin for reactive classes that provides proper constructor reactivity
 * Solves constructor reactivity issues in complex inheritance trees
 */
export const ReactiveBase = mixin((base) => {
	class ReactiveMixin extends base {
		constructor(...args: any[]) {
			super(...args)
			// Only apply reactive transformation if the class is marked with @reactive
			// This allows the mixin to work properly with method inheritance
			// biome-ignore lint/correctness/noConstructorReturn: This is the whole point here
			return reactiveClasses.has(new.target) ? reactive(this) : this
		}
	}
	return ReactiveMixin
})
function reactiveObject<T>(anyTarget: T): T {
	if (!anyTarget || typeof anyTarget !== 'object') return anyTarget
	const target = anyTarget as any
	// If target is already a proxy, return it
	if (proxyToObject.has(target) || isNonReactive(target)) return target as T

	// If we already have a proxy for this object, return it
	if (objectToProxy.has(target)) return objectToProxy.get(target) as T

	const proxied =
		nativeReactive in target && !(target instanceof target[nativeReactive])
			? new target[nativeReactive](target)
			: target
	if (proxied !== target) proxyToObject.set(proxied, target)
	const proxy = new Proxy(proxied, reactiveHandlers)

	// Store the relationships
	objectToProxy.set(target, proxy)
	proxyToObject.set(proxy, target)
	return proxy as T
}

/**
 * Main decorator for making classes reactive
 * Automatically makes class instances reactive when created
 */
export const reactive = decorator({
	class(original) {
		if (original.prototype instanceof ReactiveBase) {
			reactiveClasses.add(original)
			return original
		}

		class Reactive extends original {
			constructor(...args: any[]) {
				super(...args)
				if (new.target !== Reactive && !reactiveClasses.has(new.target))
					options.warn(
						`${(original as any).name} has been inherited by ${this.constructor.name} that is not reactive.
@reactive decorator must be applied to the leaf class OR classes have to extend ReactiveBase.`
					)
				// biome-ignore lint/correctness/noConstructorReturn: This is the whole point here
				return reactive(this)
			}
		}
		Object.defineProperty(Reactive, 'name', {
			value: `Reactive<${original.name}>`,
		})
		return Reactive as any
	},
	get(original) {
		return reactiveObject(original)
	},
	default: reactiveObject,
})

/**
 * Gets the original, non-reactive object from a reactive proxy
 * @param proxy - The reactive proxy
 * @returns The original object
 */
export function unwrap<T>(proxy: T): T {
	// Return the original object
	return (proxyToObject.get(proxy as any) as T) ?? proxy
}

/**
 * Checks if an object is a reactive proxy
 * @param obj - The object to check
 * @returns True if the object is reactive
 */
export function isReactive(obj: any): boolean {
	return proxyToObject.has(obj)
}
