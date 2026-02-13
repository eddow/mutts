import { decorator } from '../decorator'
import { mixin } from '../mixins'
import { FoolProof, isOwnAccessor } from '../utils'
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
import { absent, isNonReactive, isUnreactiveProp } from './non-reactive-state'
import {
	getExistingProxy,
	proxyToObject,
	storeProxyRelationship,
	trackProxyObject,
	unwrap,
} from './proxy-state'
import { dependant } from './tracking'
import {
	keysOf,
	nativeReactive,
	nonReactiveMark,
	options,
	ReactiveError,
	ReactiveErrorCode,
} from './types'
export const metaProtos = new WeakMap()

const hasReentry: any[] = []
const reactiveHandlers = {
	[Symbol.toStringTag]: 'MutTs Reactive',
	get(obj: any, prop: PropertyKey, receiver: any) {
		if (obj && typeof obj === 'object' && prop !== Symbol.toStringTag) {
			const metaProto = metaProtos.get(obj.constructor)
			if (metaProto && Object.hasOwn(metaProto, prop)) {
				const desc = Object.getOwnPropertyDescriptor(metaProto, prop)!
				if (desc.get) {
					if (!Object.hasOwn(obj, prop)) return desc.get.call(obj)
					// For own properties (e.g., array length): only override if writable/configurable
					const ownDesc = Object.getOwnPropertyDescriptor(obj, prop)!
					if (ownDesc.configurable || ownDesc.writable || ownDesc.get)
						return desc.get.call(obj)
				} else if (!Object.hasOwn(obj, prop))
					return (...args: any[]) => desc.value.apply(obj, args)
			}
		}
		// Symbols: fast-path — no reactivity tracking, no unreactive check needed
		if (typeof prop === 'symbol')
			return prop === nonReactiveMark ? false : FoolProof.get(obj, prop, receiver)
		// Check if this property is marked as unreactive (WeakMap lookup — no proxy traps)
		if (isUnreactiveProp(obj, prop))
			return FoolProof.get(obj, prop, receiver)

		// Check if property exists using a trap-free walk to avoid triggering
		// the has-trap cascade on prototype chains of reactive proxies.
		const isOwnProp = Object.hasOwn(obj, prop)
		let hasProp = isOwnProp
		let owner: any = isOwnProp ? obj : undefined
		if (!isOwnProp) {
			let raw = Object.getPrototypeOf(obj)
			while (raw && raw !== Object.prototype) {
				if (Object.hasOwn(raw, prop)) {
					hasProp = true
					owner = raw
					break
				}
				raw = Object.getPrototypeOf(raw)
			}
		}
		const isInheritedAccess = hasProp && !isOwnProp

		// For accessor properties, check the unwrapped object to see if it's an accessor
		// This ensures ignoreAccessors works correctly even after operations like Object.setPrototypeOf
		// Skip for null-proto objects (pounce scopes) — they never have accessors
		const shouldIgnoreAccessor =
			options.ignoreAccessors &&
			isOwnProp &&
			Object.getPrototypeOf(obj) !== null &&
			(isOwnAccessor(receiver, prop) || isOwnAccessor(obj, prop))

		// Depend if...
		if (
			!hasProp ||
			(!(options.instanceMembers && isInheritedAccess && obj instanceof Object) &&
				!shouldIgnoreAccessor)
		)
			dependant(obj, prop)

		// Two-Point Tracking: for inherited access on null-proto chains, only track
		// the owning ancestor — not every intermediate level.  This relies on the
		// "structural stability" contract: key presence in the chain is fixed at
		// creation time, so intermediate levels never gain/lose shadowing properties.
		if (isInheritedAccess && owner && (!options.instanceMembers || !(obj instanceof Object))) {
			dependant(owner, prop)
		}
		// For arrays, use FoolProof.get (Indexer path) for numeric index reactivity.
		// For all other objects, inline Reflect.get directly (skips 3 function calls).
		const value = Array.isArray(obj) ? FoolProof.get(obj, prop, receiver) : Reflect.get(obj, prop, receiver)
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
		const unwrappedReceiver = unwrap(receiver)

		// Check if this property is marked as unreactive
		if (isUnreactiveProp(obj, prop) || obj !== unwrappedReceiver)
			return FoolProof.set(obj, prop, value, receiver)
		const newValue = unwrap(value)
		// metaProto setter dispatch (e.g., reactive array length)
		if (obj && typeof obj === 'object' && prop !== Symbol.toStringTag) {
			const metaProto = obj.constructor && metaProtos.get(obj.constructor)
			if (metaProto && Object.hasOwn(metaProto, prop)) {
				const desc = Object.getOwnPropertyDescriptor(metaProto, prop)!
				if (desc.set) {
					desc.set.call(obj, newValue)
					return true
				}
			}
		}
		// Read old value, using withEffect(undefined, ...) for getter-only accessors to avoid
		// breaking memoization dependency tracking during SET operations
		let oldVal = absent
		if (Reflect.has(unwrappedReceiver, prop)) {
			// We *need* to use `receiver` and not `obj` here, otherwise we break
			// the dependency tracking for memoized getters
			oldVal = untracked(() => Reflect.get(obj, prop, receiver))
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
			if (FoolProof.set(obj, prop, newValue, receiver)) {
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
		dependant(obj, keysOf)
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

	// Find nativeReactive via trap-free walk (avoids has-trap cascade on proxy chains)
	let nativeClass: (new (t: any) => any) | undefined
	let walk: any = target
	while (walk) {
		if (Object.hasOwn(walk, nativeReactive)) {
			nativeClass = walk[nativeReactive]
			break
		}
		walk = Object.getPrototypeOf(walk)
	}
	const proxied =
		nativeClass && !(target instanceof nativeClass)
			? new nativeClass(target)
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
