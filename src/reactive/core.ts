export type DependencyFunction = <T>(cb: () => T) => T

export type ScopedCallback = () => void

export type PropEvolution = {
	type: 'set' | 'del' | 'add'
	prop: any
}

export type BunchEvolution = {
	type: 'bunch'
	method: string
}
type Evolution = PropEvolution | BunchEvolution

type State =
	| {
			evolution: Evolution
			next: State
	  }
	| {}

const states = new WeakMap<object, State>()

// Stack of active effects to handle nested effects
let activeEffect: ScopedCallback | undefined
// Track effects per reactive object and property
const watchers = new WeakMap<object, Map<any, Set<ScopedCallback>>>()
// Track which effects are watching which reactive objects for cleanup
const effectToReactiveObjects = new WeakMap<ScopedCallback, Set<object>>()

// Track object -> proxy and proxy -> object relationships
const objectToProxy = new WeakMap<object, object>()
const proxyToObject = new WeakMap<object, object>()

// Track objects that should never be reactive
const nonReactiveObjects = new WeakSet<object>()
// Track native reactivity
const nativeReactive = Symbol('native-reactive')

// Symbol to mark individual objects as non-reactive
const nonReactiveMark = Symbol('non-reactive')
// Symbol to mark class properties as non-reactive
const unreactiveProperties = Symbol('unreactive-properties')
const unspecified = Symbol('unspecified')
export const prototypeForwarding = Symbol('prototype-forwarding')

// Symbol to mark functions with their root function
const rootFunction = Symbol('root-function')

/**
 * Mark a function with its root function. If the function already has a root,
 * the root becomes the root of the new root (transitive root tracking).
 * @param fn - The function to mark
 * @param root - The root function to associate with fn
 */
function markWithRoot<T extends Function>(fn: T, root: Function): T {
	// Mark fn with the new root
	return Object.defineProperty(fn, rootFunction, { value: getRoot(root), writable: false })
}

/**
 * Retrieve the root function from a callback. Returns the function itself if it has no root.
 * @param fn - The function to get the root from
 * @returns The root function, or the function itself if no root exists
 */
function getRoot(fn: Function): Function {
	const root = (fn as any)[rootFunction]
	return root || fn
}

export class ReactiveError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ReactiveError'
	}
}

/**
 * Options for the reactive system, can be configured at runtime
 */
export const options = {
	/**
	 * Debug purpose: called when an effect is entered
	 * @param effect - The effect that is entered
	 */
	enter: (effect: Function) => {},
	/**
	 * Debug purpose: called when an effect is left
	 * @param effect - The effect that is left
	 */
	leave: (effect: Function) => {},
	/**
	 * Debug purpose: called when an effect is chained
	 * @param caller - The effect that is calling the target
	 * @param target - The effect that is being triggered
	 */
	chain: (caller: Function, target: Function) => {},
	/**
	 * Debug purpose: maximum effect chain (like call stack max depth)
	 * Used to prevent infinite loops
	 * @default 100
	 */
	maxEffectChain: 100,
	/**
	 * Only react on instance members modification (not inherited properties)
	 * @default true
	 */
	instanceMembers: true,
	areReactive: {
		Array: true,
		Map: true,
		Set: true,
		WeakMap: true,
		WeakSet: true,
	},
}

//#region nonReactive

/**
 * Mark an object as non-reactive. This object and all its properties will never be made reactive.
 * @param obj - The object to mark as non-reactive
 */
function nonReactive<T extends object[]>(...obj: T): T[0] {
	for (const o of obj) nonReactiveObjects.add(o)
	return obj[0]
}

/**
 * Mark an object as non-reactive. This object and all its properties will never be made reactive.
 * @param obj - The object to mark as non-reactive
 */
function deepNonReactive<T>(obj: T): T {
	if (isNonReactive(obj)) return obj
	nonReactiveObjects.add(obj as object)
	for (const key in obj) deepNonReactive(obj[key])
	return obj
}

/**
 * Mark a class as non-reactive. All instances of this class will automatically be non-reactive.
 * @param cls - The class constructor to mark as non-reactive
 */
function nonReactiveClass<T extends (new (...args: any[]) => any)[]>(...cls: T): T[0] {
	for (const c of cls) if (c) (c.prototype as any)[nonReactiveMark] = true
	return cls[0]
}

/**
 * Decorator to mark a class property as non-reactive.
 * The property change will not be tracked by the reactive system and its value neither
 *
 */
export function unreactive(target: any, desc: PropertyKey): void
/**
 * Decorator to mark a class property as non-reactive.
 * The property change will not be tracked by the reactive system and its value neither
 *
 */
export function unreactive(target: undefined, desc: ClassFieldDecoratorContext): void
/**
 * Mark a class as non-reactive. All instances of this class will automatically be non-reactive.
 * @param target - The class to mark as non-reactive
 */
export function unreactive<T>(target: new (...args: any[]) => T): new (...args: any[]) => T
/**
 * Mark an object as non-reactive. This object and all its properties will never be made reactive.
 * Note: the object is marked deeply, so all its children will also be non-reactive.
 * @param target - The object to mark as non-reactive
 */
export function unreactive<T>(target: T): T

export function unreactive(
	target: any,
	spec: PropertyKey | ClassFieldDecoratorContext = unspecified
) {
	return typeof spec === 'object'
		? unreactiveStage3(spec as ClassFieldDecoratorContext)
		: spec !== unspecified
			? unreactiveLegacy(target, spec as PropertyKey)
			: typeof target === 'function'
				? nonReactiveClass(target)
				: deepNonReactive(target)
}
// TODO: stage3 decorators -> generic prototype decorators
function unreactiveLegacy(target: any, propertyKey: PropertyKey) {
	// Initialize the unreactive properties set if it doesn't exist
	if (!target[unreactiveProperties]) {
		target[unreactiveProperties] = new Set<PropertyKey>()
	}

	// Add this property to the unreactive set
	target[unreactiveProperties].add(propertyKey)
}
function unreactiveStage3(context: ClassFieldDecoratorContext) {
	context.addInitializer(function (this: any) {
		// Initialize the unreactive properties set if it doesn't exist
		if (!this[unreactiveProperties]) {
			this[unreactiveProperties] = new Set<PropertyKey>()
		}

		// Add this property to the unreactive set
		this[unreactiveProperties].add(context.name)
	})
}

/**
 * Check if an object is marked as non-reactive (for testing purposes)
 * @param obj - The object to check
 * @returns true if the object is marked as non-reactive
 */
export function isNonReactive(obj: any): boolean {
	// Don't make primitives reactive
	if (obj === null || typeof obj !== 'object') return true

	// Check if the object itself is marked as non-reactive
	if (nonReactiveObjects.has(obj)) return true

	// Check if the object has the non-reactive symbol
	if (obj[nonReactiveMark]) return true

	return false
}

//#endregion

//#region evolution

export function addState(obj: any, evolution: Evolution) {
	obj = unwrap(obj)
	const next = {}
	const state = getState(obj)
	if (state) Object.assign(state, { evolution, next })
	states.set(obj, next)
}

export function getState(obj: any) {
	obj = unwrap(obj)
	let state = states.get(obj)
	if (!state) {
		state = {}
		states.set(obj, state)
	}
	return state
}

export function dependant(obj: any, prop: any) {
	if (activeEffect) {
		const objectWatchers = watchers.get(obj) || new Map<PropertyKey, Set<ScopedCallback>>()
		const deps = objectWatchers.get(prop) || new Set<ScopedCallback>()
		deps.add(activeEffect)
		objectWatchers.set(prop, deps)
		watchers.set(obj, objectWatchers)

		// Track which reactive objects this effect is watching
		const effectObjects = effectToReactiveObjects.get(activeEffect) || new Set<object>()
		effectObjects.add(obj)
		effectToReactiveObjects.set(activeEffect, effectObjects)
	}
}

// Track currently executing effects to prevent re-execution
const plannedEffects = new Map<Function, ScopedCallback>()
function hasEffect(effect: ScopedCallback) {
	plannedEffects.set(getRoot(effect), effect)
	const runEffects: any[] = []
	if (!activeEffect) {
		try {
			while (plannedEffects.size) {
				if (runEffects.length > options.maxEffectChain)
					throw new ReactiveError('[reactive] Max effect chain reached')
				const [root, effect] = plannedEffects.entries().next().value!
				runEffects.push(getRoot(effect))
				effect()
				plannedEffects.delete(root)
			}
		} finally {
			plannedEffects.clear()
		}
	} else
		options?.chain(getRoot(activeEffect), getRoot(effect))
}

export function touched(obj: any, prop: any, evolution?: Evolution) {
	if (evolution) addState(obj, evolution)
	const objectWatchers = watchers.get(obj)
	if (objectWatchers) {
		const deps = objectWatchers.get(prop)
		if (deps) {
			const theseDeps = Array.from(deps)
			for (const effect of theseDeps) hasEffect(effect)
		}
	}
}

//#endregion

function retyped(prop: PropertyKey) {
	if (typeof prop !== 'string') return prop
	const n = Number.parseFloat(prop as string)
	return isNaN(n) ? prop : n
}
// Only used for Array.length as it is hardcoded as a fake own property - but needed
export const specificAccessors = Symbol('specific-accessors')
const reactiveHandlers = {
	[Symbol.toStringTag]: 'MutTs Reactive',
	get(obj: any, prop: PropertyKey, receiver: any) {
		// Check if this property is marked as unreactive
		prop = retyped(prop)
		function get() {
			if (specificAccessors in obj && prop in obj[specificAccessors])
				return obj[specificAccessors][prop].get(receiver)
			// For unreactive properties, bypass reactivity entirely
			if (!(prop in obj)) return obj[prop]
			let browser = obj
			let pD = Object.getOwnPropertyDescriptor(browser, prop)
			while (!pD && browser !== Object.prototype) {
				browser = Object.getPrototypeOf(browser)
				pD = Object.getOwnPropertyDescriptor(browser, prop)
			}
			return pD?.get ? pD.get.call(receiver) : obj[prop]
		}
		if (obj[unreactiveProperties]?.has(prop) || typeof prop === 'symbol') return get()
		const absent = !(prop in obj)
		// Depend if...
		if (!options.instanceMembers || Object.hasOwn(receiver, prop) || absent)
			dependant(obj, prop)
		if(typeof prop === 'number') return obj[prop]
		if (absent) return obj[prop]
		return reactive(get())
	},
	set(obj: any, prop: PropertyKey, value: any, receiver: any): boolean {
		prop = retyped(prop)
		function set(newValue: any) {
			if (specificAccessors in obj && prop in obj[specificAccessors])
				return obj[specificAccessors][prop].set(receiver, value)
			if (!(prop in obj)) return false
			let browser = obj
			let pD = Object.getOwnPropertyDescriptor(browser, prop)
			while (!pD && browser !== Object.prototype) {
				browser = Object.getPrototypeOf(browser)
				pD = Object.getOwnPropertyDescriptor(browser, prop)
			}
			if (!pD?.set) return false
			pD.set.call(receiver, newValue)
			return true
		}

		// Check if this property is marked as unreactive
		if (obj[unreactiveProperties]?.has(prop)) {
			if (!set(value)) (obj as any)[prop] = value
			return true
		}

		const oldVal = (obj as any)[prop]
		const oldPresent = prop in obj || (typeof prop === 'number' && prop < receiver.length)
		const newValue = unwrap(value)

		if (!set(newValue)) (obj as any)[prop] = newValue
		if (oldVal !== newValue) touched(obj, prop, { type: oldPresent ? 'set' : 'add', prop })
		return true
	},
	deleteProperty(obj: any, prop: PropertyKey): boolean {
		prop = retyped(prop)
		if (!Object.hasOwn(obj, prop)) return false
		delete (obj as any)[prop]
		touched(obj, prop, { type: 'del', prop })
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
} as const

function withEffect<T>(effect: ScopedCallback | undefined, fn: () => T): T {
	const oldActiveEffect = activeEffect
	activeEffect = effect
	try {
		return fn()
	} finally {
		activeEffect = oldActiveEffect
	}
}

export function reactive<T>(anyTarget: T): T {
	/*if(typeof anyTarget === 'function') { // Stage 3 decorator and legacy decorator
		// @ts-expect-error - decorator, so `anyTarget` is the base class constructor
		return class extends anyTarget {
			constructor(...args: any[]) {
				super(...args)
				return reactive(this)
			}
		}
	}*/
	const target = anyTarget as any
	// If target is already a proxy, return it
	if (proxyToObject.has(target) || isNonReactive(target)) return target as T

	// If we already have a proxy for this object, return it
	if (objectToProxy.has(target)) return objectToProxy.get(target) as T

	const proxied =
		nativeReactive in target && !(target instanceof target[nativeReactive])
			? new target[nativeReactive](target)
			: target

	const proxy = new Proxy(proxied, reactiveHandlers)

	// Store the relationships
	objectToProxy.set(target, proxy)
	proxyToObject.set(proxy, target)
	return proxy as T
}

export function unwrap<T>(proxy: T): T {
	// If it's not a proxy, return as-is
	if (!proxyToObject.has(proxy as any)) {
		return proxy
	}

	// Return the original object
	return proxyToObject.get(proxy as any) as T
}

export function isReactive(obj: any): boolean {
	return proxyToObject.has(obj)
}
// TODO: effect chains are badly debugged as `runEffect` is referred, not `fn` - should be corrected or removed

export function untracked(
	fn: () => ScopedCallback | undefined | void
) {
	withEffect(undefined, fn)
}

/**
 * @param fn - The effect function to run - provides the cleaner
 * @returns The cleanup function
 */
export function effect<Args extends any[]>(
	fn: (dep: DependencyFunction, ...args: Args) => ScopedCallback | undefined | void,
	...args: Args
): ScopedCallback {

	let cleanup: (() => void) | null = null
	const dep = <T>(cb: () => T) => withEffect(runEffect, cb)

	function runEffect() {
		// Clear previous dependencies
		if (cleanup) {
			cleanup()
			cleanup = null
		}

		options.enter(fn)
		const reactionCleanup = withEffect(runEffect, () => fn(dep, ...args))
		options.leave(fn)

		// Create cleanup function for next run
		cleanup = () => {
			reactionCleanup?.()
			// Remove this effect from all reactive objects it's watching
			const effectObjects = effectToReactiveObjects.get(runEffect)
			if (effectObjects) {
				for (const reactiveObj of effectObjects) {
					const objectWatchers = watchers.get(reactiveObj)
					if (objectWatchers) {
						for (const [prop, deps] of objectWatchers.entries()) {
							deps.delete(runEffect)
							if (deps.size === 0) {
								objectWatchers.delete(prop)
							}
						}
						if (objectWatchers.size === 0) {
							watchers.delete(reactiveObj)
						}
					}
				}
				effectToReactiveObjects.delete(runEffect)
			}
		}
	}
	Object.defineProperty(runEffect, 'original', { value: fn })
	
	// Mark the runEffect callback with the original function as its root
	markWithRoot(runEffect, fn)

	// Run the effect immediately
	runEffect()

	return (): void => {
		if (cleanup) {
			cleanup()
			cleanup = null
		}
	}
}
const unsetYet = Symbol('unset-yet')
export function watch<T, Args extends any[]>(
	value: (dep: DependencyFunction, ...args: Args) => T,
	changed: (value: T, oldValue?: T) => void, ...args: Args
) {
	let oldValue: T | typeof unsetYet = unsetYet
	return effect(markWithRoot((dep) => {
		const newValue = value(dep, ...args)
		if(oldValue !== newValue) {
			if (oldValue === unsetYet) changed(newValue)
			else changed(newValue, oldValue)
			oldValue = newValue
		}
	}, value))
}

// TODO: Note - and in the documentation, that `Reactive` must be the last mixin applied!

const classCache = new WeakMap<new (...args: any[]) => any, new (...args: any[]) => any>()
/**
 * Mixin to have a class defining reactive objects
 * Note: creates a proxy per instance, not per prototype, so that instances can be `unwrap`-ed
 * @param target - The object to make reactive
 * @returns The reactive object
 */
export const Reactive = <Base extends new (...args: any[]) => any>(Base: Base) => {
	// Check cache first
	const cache = classCache.get(Base)
	if (cache) return cache as Base

	// Create new Reactive class
	const ReactiveClass = class Reactive extends Base {
		constructor(...args: any[]) {
			super(...args)
			//biome-ignore lint/correctness/noConstructorReturn: This is the whole point of this mixin
			return reactive(this)
		}
	}

	// Cache the result
	classCache.set(Base, ReactiveClass)
	return ReactiveClass
}

nonReactiveClass(Date, RegExp, Error, Promise, Function)
if (typeof window !== 'undefined') nonReactive(window, document)
if (typeof Element !== 'undefined') nonReactiveClass(Element, Node)

export function registerNativeReactivity(
	originalClass: new (...args: any[]) => any,
	reactiveClass: new (...args: any[]) => any
) {
	originalClass.prototype[nativeReactive] = reactiveClass
}
type ComputedFunction<T> = (dep: DependencyFunction) => T
const computedCache = new WeakMap<ComputedFunction<any>, any>()
function computedFunction<T>(getter: ComputedFunction<T>): T {
	const cache = computedCache.get(getter)
	dependant(computedCache, getter)
	if (cache) return cache
	const oldActiveEffect = activeEffect
	activeEffect = undefined
	try {
		const stop = effect(markWithRoot((dep) => {
			if (computedCache.has(getter)) {
				computedCache.delete(getter)
				touched(computedCache, getter)
				stop()
			}
			computedCache.set(getter, getter(dep))
		}, getter))
	} finally {
		activeEffect = oldActiveEffect
	}
	return computedCache.get(getter)
}

/**
 * Decorator to mark a class accessor as computed.
 * The computed value will be cached and recomputed when the dependencies change
 */
export function computed(target: any, desc: PropertyKey, descriptor: PropertyDescriptor): void
/**
 * Decorator to mark a class accessor as computed.
 * The computed value will be cached and recomputed when the dependencies change
 */
export function computed(target: undefined, desc: ClassAccessorDecoratorContext): void
/**
 * Get the cached value of a computed function - cache is invalidated when the dependencies change
 * @param target - The computed function
 */
export function computed<T>(getter: ComputedFunction<T>): T

export function computed(
	target: any,
	spec: PropertyKey | ClassAccessorDecoratorContext = unspecified,
	descriptor?: PropertyDescriptor
) {
	return descriptor
		? computedLegacy(target, spec as string | symbol, descriptor)
		: spec !== unspecified
			? computedStage3(spec as ClassAccessorDecoratorContext)
			: computedFunction(target)
}
function computedStage3(context: ClassAccessorDecoratorContext) {
	return {
		get(this: any) {
			return computedFunction(markWithRoot(() => context.access.get(this), context.access.get))
		},
		set(this: any, value: any) {
			context.access.set(this, value)
		},
	}
}
function computedLegacy(_target: any, _propertyKey: string | symbol, descriptor: PropertyDescriptor) {
	const original = descriptor.get
	if (original)
		return {
			get(this: any) {
				return computedFunction(markWithRoot(() => original.call(this), original))
			},
			set: descriptor.set,
		}
}
