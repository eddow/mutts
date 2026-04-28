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
import { getActiveEffect } from './effect-context'
import { inertDepth } from './effects'
import { absent, isNonReactive, isUnreactiveProp } from './non-reactive'
import { dependant } from './tracking'
import {
	getExistingProxy,
	isReactive,
	keysOf,
	options,
	proxyToObject,
	ReactiveError,
	ReactiveErrorCode,
	storeProxyRelationship,
	unwrap,
} from './types'
export const metaProtos = new WeakMap()
export const wrapProtos = new WeakMap()
const arrayLengths = new WeakMap<unknown[], number>()
const hasReentry = new Set<PropertyKey>()
type AccessAnalysis = {
	hasProp: boolean
	owner: any
	isInheritedAccess: boolean
	shouldIgnoreAccessor: boolean
	ignoreAccessors: boolean
	instanceMembers: boolean
}
const accessAnalysisCache = new WeakMap<object, Map<PropertyKey, AccessAnalysis>>()
const readonlyObjectToProxy = new WeakMap<object, object>()
const shallowObjectToProxy = new WeakMap<object, object>()
const readonlyMutators = new Set<PropertyKey>([
	'copyWithin',
	'fill',
	'pop',
	'push',
	'reverse',
	'shift',
	'sort',
	'splice',
	'unshift',
	'add',
	'clear',
	'delete',
	'set',
])
export type SubProxy = {
	get?(obj: any, prop: PropertyKey, receiver: any): any
	has?(obj: any, prop: PropertyKey): boolean
	ownKeys?(obj: any): ArrayLike<string | symbol>
	getOwnPropertyDescriptor?(obj: any, prop: PropertyKey): PropertyDescriptor | undefined
}
// Sub-proxy registration for custom reactive behaviors
const subsRegister = new WeakMap<any, SubProxy>()
// Internal untracked flag for setter/getter operations - only used when testing oldValue while setting a value
// TODO: `touched` trigger also compares to old value and should use the internalUntracked flag
let internalUntracked = false

function wrapReactiveValue(obj: any, prop: PropertyKey, value: any) {
	// Optional fast-path for inert reads - skips reactive wrapping
	// Disabled by default for safety, can be enabled for performance-critical read-only contexts
	if (inertDepth > 0) return value

	if (!isReactive(value) && typeof value === 'object' && value !== null) {
		const reactiveValue = reactiveObject(value)

		// Only create back-references if this object needs them
		if (needsBackReferences(obj)) {
			addBackReference(reactiveValue, obj, prop)
		}

		return reactiveValue
	}
	return value
}

function computeAccessAnalysis(obj: object, prop: PropertyKey, receiver: any): AccessAnalysis {
	const proto = Object.getPrototypeOf(obj)
	const isOwnProp = Object.hasOwn(obj, prop)
	const shouldIgnoreAccessor =
		options.ignoreAccessors &&
		isOwnProp &&
		proto !== null &&
		(isOwnAccessor(receiver, prop) || isOwnAccessor(obj, prop))

	let hasProp = isOwnProp
	let owner: any = isOwnProp ? obj : undefined
	if (!isOwnProp) {
		let raw = proto
		while (raw && raw !== Object.prototype) {
			if (Object.hasOwn(raw, prop)) {
				hasProp = true
				owner = raw
				break
			}
			raw = Object.getPrototypeOf(raw)
		}
	}

	return {
		hasProp,
		owner,
		isInheritedAccess: hasProp && !isOwnProp,
		shouldIgnoreAccessor,
		ignoreAccessors: options.ignoreAccessors,
		instanceMembers: options.instanceMembers,
	}
}

function analyzeAccess(obj: object, prop: PropertyKey, receiver: any): AccessAnalysis {
	const proto = Object.getPrototypeOf(obj)
	if (Object.hasOwn(obj, prop)) return computeAccessAnalysis(obj, prop, receiver)
	if (proto === null || Array.isArray(obj)) return computeAccessAnalysis(obj, prop, receiver)

	let propCache = accessAnalysisCache.get(proto)
	if (!propCache) {
		propCache = new Map()
		accessAnalysisCache.set(proto, propCache)
	}
	const cached = propCache.get(prop)
	if (
		cached &&
		cached.ignoreAccessors === options.ignoreAccessors &&
		cached.instanceMembers === options.instanceMembers
	)
		return cached

	const analysis = computeAccessAnalysis(obj, prop, receiver)
	if (analysis.hasProp) propCache.set(prop, analysis)
	return analysis
}

const reactiveHandlers: ProxyHandler<any> & Record<symbol, unknown> = {
	[Symbol.toStringTag]: 'MutTs Reactive',
	get(obj, prop, receiver) {
		if (internalUntracked) return FoolProof.get(obj, prop, receiver)
		if (obj && typeof obj === 'object' && prop !== Symbol.toStringTag) {
			const metaProto = metaProtos.get(obj.constructor)
			if (metaProto && Object.hasOwn(metaProto, prop)) {
				const desc = Object.getOwnPropertyDescriptor(metaProto, prop)!
				if (desc.get) {
					if (!Object.hasOwn(obj, prop)) return desc.get.call(obj)
					// For own properties (e.g., array length): only override if writable/configurable
					const ownDesc = Object.getOwnPropertyDescriptor(obj, prop)!
					if (ownDesc.configurable || ownDesc.writable || ownDesc.get) return desc.get.call(obj)
				} else if (!Object.hasOwn(obj, prop)) return (...args: any[]) => desc.value.apply(obj, args)
			}
			const wrapProto = wrapProtos.get(obj.constructor)
			if (wrapProto && Object.hasOwn(wrapProto, prop)) return wrapProto[prop]
		}
		// Symbols: fast-path — no reactivity tracking
		if (typeof prop === 'symbol' || prop === 'constructor' || isUnreactiveProp(obj, prop))
			return FoolProof.get(obj, prop, receiver)

		const subProxy = subsRegister.get(obj)

		if (inertDepth > 0) {
			const value = (subProxy?.get || FoolProof.get)(obj, prop, receiver)
			return wrapReactiveValue(obj, prop, value)
		}

		const activeEffect = getActiveEffect()
		if (!activeEffect) {
			const value = (subProxy?.get || FoolProof.get)(obj, prop, receiver)
			return wrapReactiveValue(obj, prop, value)
		}

		if (!subProxy && !Array.isArray(obj)) {
			const proto = Object.getPrototypeOf(obj)
			if (proto === Object.prototype || proto === null) {
				const ownDesc = Object.getOwnPropertyDescriptor(obj, prop)
				if (ownDesc && 'value' in ownDesc) {
					dependant(obj, prop)
					return wrapReactiveValue(obj, prop, ownDesc.value)
				}
			}
		}

		// Check if property exists using a trap-free walk to avoid triggering
		// the has-trap cascade on prototype chains of reactive proxies.
		const { hasProp, owner, isInheritedAccess, shouldIgnoreAccessor } = analyzeAccess(
			obj,
			prop,
			receiver
		)

		// Depend if...
		if (
			!hasProp ||
			(!(options.instanceMembers && isInheritedAccess && obj instanceof Object) &&
				!shouldIgnoreAccessor)
		)
			dependant(obj, prop)

		// Two-Point Tracking: for inherited access on null-proto chains, also track
		// the owning ancestor so that writing directly to it triggers dependent effects.
		if (isInheritedAccess && owner && (!options.instanceMembers || !(obj instanceof Object))) {
			dependant(owner, prop)
		}
		// For arrays, use FoolProof.get (Indexer path) for numeric index reactivity.
		// For all other objects, inline Reflect.get directly (skips 3 function calls).
		const value = (subProxy?.get || FoolProof.get)(obj, prop, receiver)
		return wrapReactiveValue(obj, prop, value)
	},
	set(obj, prop, value, receiver) {
		const unwrapped = unwrap(receiver)
		if (obj !== unwrapped)
			return Object.defineProperty(unwrapped, prop, {
				value,
				configurable: true,
				writable: true,
				enumerable: true,
			})
		if (internalUntracked)
			throw new Error('Internal untracked: setting a value in an getter in a set operation')
		//return FoolProof.set(obj, prop, value, receiver)

		// Check if this property is marked as unreactive
		if (isUnreactiveProp(obj, prop)) return FoolProof.set(obj, prop, value, receiver)
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
		const isArrayLength = prop === 'length' && Array.isArray(obj)
		internalUntracked = true
		try {
			if (Reflect.has(obj, prop)) {
				oldVal = isArrayLength
					? arrayLengths.get(obj) === newValue
						? newValue
						: absent
					: Reflect.get(obj, prop, receiver)
			}
		} finally {
			internalUntracked = false
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
				if (isArrayLength) arrayLengths.set(obj, newValue)
				notifyPropertyChange(obj, prop, oldVal, newValue, oldVal !== absent)
			}
		}
		return true
	},
	has(obj, prop) {
		if (hasReentry.has(obj))
			throw new ReactiveError(
				`[reactive] Circular dependency detected in 'has' check for property '${String(prop)}'`,
				{
					code: ReactiveErrorCode.CycleDetected,
					cycle: [], // We don't have the full cycle here, but we know it involves obj
				}
			)
		hasReentry.add(obj)
		if (inertDepth > 0) {
			const rv = (subsRegister.get(obj)?.has || Reflect.has)(obj, prop)
			hasReentry.delete(obj)
			return rv
		}
		if (!internalUntracked && !isUnreactiveProp(obj, prop)) dependant(obj, prop)
		const rv = (subsRegister.get(obj)?.has || Reflect.has)(obj, prop)
		hasReentry.delete(obj)
		return rv
	},
	deleteProperty(obj, prop) {
		if (!Object.hasOwn(obj, prop)) return true

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
	ownKeys(obj) {
		if (inertDepth > 0) {
			return subsRegister.get(obj)?.ownKeys?.(obj) || Reflect.ownKeys(obj)
		}
		dependant(obj, keysOf)
		return subsRegister.get(obj)?.ownKeys?.(obj) || Reflect.ownKeys(obj)
	},
	getOwnPropertyDescriptor(obj, prop) {
		return (
			subsRegister.get(obj)?.getOwnPropertyDescriptor?.(obj, prop) ||
			Reflect.getOwnPropertyDescriptor(obj, prop)
		)
	},
}

function readonlyError(prop: PropertyKey): Error {
	return new ReactiveError(
		`[reactive] Cannot mutate readonly reactive property '${String(prop)}'`,
		{
			code: ReactiveErrorCode.WriteInComputed,
		}
	)
}

function readonlyValue<T>(value: T): T {
	if (!value || typeof value !== 'object') return value
	return readonlyReactive(value)
}

const shallowReactiveHandlers: ProxyHandler<any> = {
	get(obj, prop, receiver) {
		if (typeof prop === 'symbol' || prop === 'constructor' || isUnreactiveProp(obj, prop))
			return Reflect.get(obj, prop, receiver)
		if (getActiveEffect()) dependant(obj, prop)
		return Reflect.get(obj, prop, receiver)
	},
	set(obj, prop, value, receiver) {
		const unwrapped = unwrap(receiver)
		if (obj !== unwrapped)
			return Object.defineProperty(unwrapped, prop, {
				value,
				configurable: true,
				writable: true,
				enumerable: true,
			})
		if (isUnreactiveProp(obj, prop)) return FoolProof.set(obj, prop, value, receiver)
		const hadProperty = Reflect.has(obj, prop)
		const oldVal = hadProperty ? Reflect.get(obj, prop, receiver) : absent
		const newValue = unwrap(value)
		if (oldVal !== newValue && FoolProof.set(obj, prop, newValue, receiver)) {
			touched1(obj, { type: hadProperty ? 'set' : 'add', prop }, prop)
		}
		return true
	},
	has(obj, prop) {
		return reactiveHandlers.has!(obj, prop)
	},
	deleteProperty(obj, prop) {
		if (!Object.hasOwn(obj, prop)) return true
		delete (obj as any)[prop]
		touched1(obj, { type: 'del', prop }, prop)
		return true
	},
	ownKeys(obj) {
		return reactiveHandlers.ownKeys!(obj)
	},
	getOwnPropertyDescriptor(obj, prop) {
		return Reflect.getOwnPropertyDescriptor(obj, prop)
	},
}

const readonlyReactiveHandlers: ProxyHandler<any> = {
	get(obj, prop, receiver) {
		if (readonlyMutators.has(prop)) {
			return () => {
				throw readonlyError(prop)
			}
		}
		const reactiveTarget = reactiveObject(obj)
		const value = FoolProof.get(reactiveTarget, prop, receiver)
		if (typeof value === 'function') {
			return (...args: any[]) => readonlyValue(value.apply(reactiveTarget, args))
		}
		return readonlyValue(value)
	},
	set(_obj, prop) {
		throw readonlyError(prop)
	},
	deleteProperty(_obj, prop) {
		throw readonlyError(prop)
	},
	defineProperty(_obj, prop) {
		throw readonlyError(prop)
	},
	setPrototypeOf() {
		throw readonlyError('[[Prototype]]')
	},
	has(obj, prop) {
		const reactiveTarget = reactiveObject(obj)
		return Reflect.has(reactiveTarget, prop)
	},
	ownKeys(obj) {
		const reactiveTarget = reactiveObject(obj)
		return Reflect.ownKeys(reactiveTarget)
	},
	getOwnPropertyDescriptor(obj, prop) {
		return Reflect.getOwnPropertyDescriptor(obj, prop)
	},
}

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
function reactiveObject<T>(anyTarget: T, subProxy?: SubProxy): T {
	if (!anyTarget || typeof anyTarget !== 'object') return anyTarget
	const target = anyTarget as any
	// If target is already a proxy, return it
	if (isNonReactive(target)) return target as T
	const isProxy = proxyToObject.has(target)
	if (isProxy) return target as T

	// If we already have a proxy for this object, return it (optimized: get returns undefined if not found)
	const existing = getExistingProxy(target)
	if (existing !== undefined) return existing as T

	if (subProxy) subsRegister.set(target, subProxy)
	const proxy = new Proxy(target, reactiveHandlers)
	if (Array.isArray(target)) arrayLengths.set(target, target.length)
	// Store the relationships
	storeProxyRelationship(target, proxy)
	return proxy as T
}

function shallowReactiveObject<T>(anyTarget: T): T {
	if (!anyTarget || typeof anyTarget !== 'object') return anyTarget
	const target = unwrap(anyTarget as any) as object
	if (isNonReactive(target)) return target as T
	const existing = shallowObjectToProxy.get(target)
	if (existing) return existing as T
	const proxy = new Proxy(target, shallowReactiveHandlers)
	shallowObjectToProxy.set(target, proxy)
	proxyToObject.set(proxy, target)
	return proxy as T
}

function readonlyReactiveObject<T>(anyTarget: T): T {
	if (!anyTarget || typeof anyTarget !== 'object') return anyTarget
	const target = unwrap(anyTarget as any) as object
	if (isNonReactive(target)) return target as T
	const existing = readonlyObjectToProxy.get(target)
	if (existing) return existing as T
	const proxy = new Proxy(target, readonlyReactiveHandlers)
	readonlyObjectToProxy.set(target, proxy)
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
	get(original: any) {
		return reactiveObject(original)
	},
	default: reactiveObject,
})

export const shallowReactive = shallowReactiveObject
export const readonlyReactive = readonlyReactiveObject
