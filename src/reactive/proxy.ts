import { decorator } from '../decorator'
import { mixin } from '../mixins'
import { isOwnAccessor, ReflectGet, ReflectSet } from '../utils'
import { touched1 } from './change'
import { notifyPropertyChange } from './deep-touch'
import {
	addBackReference,
	bubbleUpChange,
	needsBackReferences,
	objectsWithDeepWatchers,
	removeBackReference,
} from './deep-watch-state'
import { untracked } from './effects'
import { absent, isNonReactive } from './non-reactive-state'
import {
	getExistingProxy,
	proxyToObject,
	storeProxyRelationship,
	trackProxyObject,
	unwrap,
} from './proxy-state'
import { dependant } from './tracking'
import {
	allProps,
	nativeReactive,
	nonReactiveMark,
	options,
	ReactiveError,
	ReactiveErrorCode,
	unreactiveProperties,
} from './types'
import { ReflectIGet, ReflectISet } from './utils'
export const metaProtos = new WeakMap()

const hasReentry: any[] = []
const reactiveHandlers = {
	[Symbol.toStringTag]: 'MutTs Reactive',
	get(obj: any, prop: PropertyKey, receiver: any) {
		if(obj && typeof obj === 'object' && !Object.hasOwn(obj, prop)) {
			const metaProto = metaProtos.get(obj.constructor)
			if (metaProto && prop in metaProto) {
				const desc = Object.getOwnPropertyDescriptor(metaProto, prop)!
				return desc.get ? desc.get.call(obj) : (...args) => desc.value.apply(obj, args)
			}
		}
		if (prop === nonReactiveMark) return false
		const unwrappedObj = unwrap(obj)
		// Check if this property is marked as unreactive
		if (unwrappedObj[unreactiveProperties]?.has(prop) || typeof prop === 'symbol')
			return ReflectIGet(obj, prop, receiver)

		// Check if property exists and if it's an own property (cached for later use)
		const hasProp = Reflect.has(receiver, prop)
		const isOwnProp = hasProp && Object.hasOwn(receiver, prop)
		const isInheritedAccess = hasProp && !isOwnProp

		// For accessor properties, check the unwrapped object to see if it's an accessor
		// This ensures ignoreAccessors works correctly even after operations like Object.setPrototypeOf
		const shouldIgnoreAccessor =
			options.ignoreAccessors &&
			isOwnProp &&
			(isOwnAccessor(receiver, prop) || isOwnAccessor(unwrappedObj, prop))

		// Depend if...
		if (
			!hasProp ||
			(!(options.instanceMembers && isInheritedAccess && obj instanceof Object) &&
				!shouldIgnoreAccessor)
		)
			dependant(obj, prop)

		// Watch the whole prototype chain when requested or for null-proto objects
		if (isInheritedAccess && (!options.instanceMembers || !(obj instanceof Object))) {
			let current = reactiveObject(Object.getPrototypeOf(obj))
			while (current && current !== Object.prototype) {
				dependant(current, prop)
				if (Object.hasOwn(current, prop)) break
				let next = reactiveObject(Object.getPrototypeOf(current))
				if (next === current) {
					next = reactiveObject(Object.getPrototypeOf(unwrap(current)))
				}
				current = next
			}
		}
		const value = ReflectIGet(obj, prop, receiver)
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
		// Read old value directly from unwrapped object to avoid triggering dependency tracking
		const unwrappedObj = unwrap(obj)
		const unwrappedReceiver = unwrap(receiver)

		// Check if this property is marked as unreactive
		if (unwrappedObj[unreactiveProperties]?.has(prop) || unwrappedObj !== unwrappedReceiver)
			return ReflectISet(obj, prop, value, receiver)
		const newValue = unwrap(value)
		// Read old value, using withEffect(undefined, ...) for getter-only accessors to avoid
		// breaking memoization dependency tracking during SET operations
		let oldVal = absent
		if (Reflect.has(unwrappedReceiver, prop)) {
			// Check descriptor on both receiver and target to handle proxy cases
			const receiverDesc = Object.getOwnPropertyDescriptor(unwrappedReceiver, prop)
			const targetDesc = Object.getOwnPropertyDescriptor(unwrappedObj, prop)
			const desc = receiverDesc || targetDesc
			// We *need* to use `receiver` and not `unwrappedObj` here, otherwise we break
			// the dependency tracking for memoized getters
			if (desc?.get && !desc?.set) {
				oldVal = untracked(() => Reflect.get(unwrappedObj, prop, receiver))
			} else {
				oldVal = untracked(() => Reflect.get(unwrappedObj, prop, receiver))
			}
		}
		if (objectsWithDeepWatchers.has(obj)) {
			if (typeof oldVal === 'object' && oldVal !== null) {
				removeBackReference(oldVal, obj, prop)
			}
			if (typeof newValue === 'object' && newValue !== null) {
				const reactiveValue = reactiveObject(newValue)
				addBackReference(reactiveValue, obj, prop)
			}
		}

		if (oldVal !== newValue) {
			// For getter-only accessors, Reflect.set() may fail, but we still return true
			// to avoid throwing errors. Only proceed with change notifications if set succeeded.
			if (ReflectISet(obj, prop, newValue, receiver)) {
				notifyPropertyChange(obj, prop, oldVal, newValue, oldVal !== absent)
			}
		}
		return true
	},
	has(obj: any, prop: PropertyKey): boolean {
		if (hasReentry.includes(obj))
			throw new ReactiveError(
				`[reactive] Circular dependency detected in 'has' check for property '${String(prop)}'`,
				{
					code: ReactiveErrorCode.CycleDetected,
					cycle: [], // We don't have the full cycle here, but we know it involves obj
				}
			)
		hasReentry.push(obj)
		dependant(obj, prop)
		const rv = Reflect.has(obj, prop)
		hasReentry.pop()
		return rv
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
	if (isNonReactive(target)) return target as T
	const isProxy = proxyToObject.has(target)
	if (isProxy) return target as T

	// If we already have a proxy for this object, return it (optimized: get returns undefined if not found)
	const existing = getExistingProxy(target)
	if (existing !== undefined) return existing as T

	const proxied =
		nativeReactive in target && !(target instanceof target[nativeReactive])
			? new target[nativeReactive](target)
			: target
	if (proxied !== target) trackProxyObject(proxied, target)
	const proxy = new Proxy(proxied, reactiveHandlers)

	// Store the relationships
	storeProxyRelationship(target, proxy)
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
	get(original: any) {
		return reactiveObject(original)
	},
	default: reactiveObject,
})

/**
 * Gets the original, non-reactive object from a reactive proxy
 * @param proxy - The reactive proxy
 * @returns The original object
 */
export { isReactive, objectToProxy, proxyToObject, unwrap } from './proxy-state'
