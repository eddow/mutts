// biome-ignore-all lint/suspicious/noConfusingVoidType: Type 'void' is not assignable to type 'ScopedCallback | undefined'.
// Argument of type '() => void' is not assignable to parameter of type '(dep: DependencyFunction) => ScopedCallback | undefined'.


export type DependencyFunction = <T>(cb: () => T) => T
// TODO: proper async management, read when fn returns a promise and let the effect as "running",
//  either to cancel the running one or to avoid running 2 in "parallel" and debounce the second one

// TODO: deep watching

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
// Track which effects are watching which reactive objects for cleanup
const effectToReactiveObjects = new WeakMap<ScopedCallback, Set<object>>()

// Track object -> proxy and proxy -> object relationships
const objectToProxy = new WeakMap<object, object>()
const proxyToObject = new WeakMap<object, object>()

// Track objects that should never be reactive
export const nonReactiveObjects = new WeakSet<object>()
// Track native reactivity
const nativeReactive = Symbol('native-reactive')

// Symbol to mark individual objects as non-reactive
export const nonReactiveMark = Symbol('non-reactive')
// Symbol to mark class properties as non-reactive
export const unreactiveProperties = Symbol('unreactive-properties')
export const prototypeForwarding: unique symbol = Symbol('prototype-forwarding')

export const allProps = Symbol('all-props')

// Symbol to mark functions with their root function
const rootFunction = Symbol('root-function')

/**
 * Mark a function with its root function. If the function already has a root,
 * the root becomes the root of the new root (transitive root tracking).
 * @param fn - The function to mark
 * @param root - The root function to associate with fn
 */
export function markWithRoot<T extends Function>(fn: T, root: Function): T {
	// Mark fn with the new root
	return Object.defineProperty(fn, rootFunction, { value: getRoot(root), writable: false })
}

/**
 * Retrieve the root function from a callback. Returns the function itself if it has no root.
 * @param fn - The function to get the root from
 * @returns The root function, or the function itself if no root exists
 */
function getRoot<T extends Function | undefined>(fn: T): T {
	return (fn as any)?.[rootFunction] || fn
}

export class ReactiveError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ReactiveError'
	}
}

// biome-ignore-start lint/correctness/noUnusedFunctionParameters: Interface declaration with empty defaults
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
	 * @param target - The effect that is being triggered
	 * @param caller - The effect that is calling the target
	 */
	chain: (target: Function, caller?: Function) => {},
	/**
	 * Debug purpose: maximum effect chain (like call stack max depth)
	 * Used to prevent infinite loops
	 * @default 100
	 */
	maxEffectChain: 100,
	/**
	 * Only react on instance members modification (not inherited properties)
	 * For instance, do not track class methods
	 * @default true
	 */
	instanceMembers: true,
}
// biome-ignore-end lint/correctness/noUnusedFunctionParameters: Interface declaration with empty defaults

//#region evolution

// Track effects per reactive object and property
const watchers = new WeakMap<object, Map<any, Set<ScopedCallback>>>()

function raiseDeps(objectWatchers: Map<any, Set<ScopedCallback>>, ...keyChains: Iterable<any>[]) {
	for (const keys of keyChains)
		for (const key of keys) {
			const deps = objectWatchers.get(key)
			if (deps) for (const effect of Array.from(deps)) hasEffect(effect)
		}
}

export function touched1(obj: any, evolution: Evolution, prop: any) {
	obj = unwrap(obj)
	addState(obj, evolution)
	if (typeof prop !== 'symbol') {
		const objectWatchers = watchers.get(obj)
		if (objectWatchers) raiseDeps(objectWatchers, [allProps, prop])
	}
}

export function touched(obj: any, evolution: Evolution, props?: Iterable<any>) {
	obj = unwrap(obj)
	addState(obj, evolution)
	const objectWatchers = watchers.get(obj)
	if (objectWatchers) {
		if (props) raiseDeps(objectWatchers, [allProps], props)
		else raiseDeps(objectWatchers, objectWatchers.keys())
	}
}

const states = new WeakMap<object, State>()

function addState(obj: any, evolution: Evolution) {
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

export function dependant(obj: any, prop: any = allProps) {
	obj = unwrap(obj)
	if (activeEffect && (typeof prop !== 'symbol' || prop === allProps)) {
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
		deps.add(activeEffect)

		// Track which reactive objects this effect is watching
		let effectObjects = effectToReactiveObjects.get(activeEffect)
		if (!effectObjects) {
			effectObjects = new Set<object>()
			effectToReactiveObjects.set(activeEffect, effectObjects)
		}
		effectObjects.add(obj)
	}
}

// Stack of active effects to handle nested effects
let activeEffect: ScopedCallback | undefined

// Track currently executing effects to prevent re-execution
// These are all the effects triggered under `activeEffect`
let batchedEffects: Map<Function, ScopedCallback> | undefined

// Track which sub-effects have been executed to prevent infinite loops
// These are all the effects triggered under `activeEffect` and all their sub-effects

function hasEffect(effect: ScopedCallback) {
	const root = getRoot(effect)

	options?.chain(getRoot(effect), getRoot(activeEffect))
	if (batchedEffects) batchedEffects.set(root, effect)
	else {
		const runEffects: any[] = []
		batchedEffects = new Map<Function, ScopedCallback>([[root, effect]])
		try {
			while (batchedEffects.size) {
				if (runEffects.length > options.maxEffectChain)
					throw new ReactiveError('[reactive] Max effect chain reached')
				const [root, effect] = batchedEffects.entries().next().value!
				runEffects.push(root)
				effect()
				batchedEffects.delete(root)
			}
		} finally {
			batchedEffects = undefined
		}
	}
}

export function withEffect<T>(effect: ScopedCallback | undefined, fn: () => T): T {
	if (getRoot(effect) === getRoot(activeEffect)) return fn()
	const oldActiveEffect = activeEffect
	activeEffect = effect
	try {
		return fn()
	} finally {
		activeEffect = oldActiveEffect
	}
}

//#endregion

function retyped(prop: PropertyKey) {
	if (typeof prop !== 'string') return prop
	const n = Number.parseFloat(prop as string)
	return Number.isNaN(n) ? prop : n
}
// Only used for Array.length as it is hardcoded as a fake own property - but needed
const reactiveHandlers = {
	[Symbol.toStringTag]: 'MutTs Reactive',
	get(obj: any, prop: PropertyKey, receiver: any) {
		// Check if this property is marked as unreactive
		prop = retyped(prop)
		function get() {
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
		if (!options.instanceMembers || Object.hasOwn(receiver, prop) || absent) dependant(obj, prop)
		if (typeof prop === 'number' || absent) return obj[prop]
		return reactive(get())
	},
	set(obj: any, prop: PropertyKey, value: any, receiver: any): boolean {
		prop = retyped(prop)
		function set(newValue: any) {
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

		if (oldVal !== newValue) {
			if (!set(newValue)) (obj as any)[prop] = newValue
			// try to find a "generic" way to express that
			touched1(obj, { type: oldPresent ? 'set' : 'add', prop }, prop)
		}
		return true
	},
	deleteProperty(obj: any, prop: PropertyKey): boolean {
		prop = retyped(prop)
		if (!Object.hasOwn(obj, prop)) return false
		delete (obj as any)[prop]
		touched1(obj, { type: 'del', prop }, prop)
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
	if (proxied !== target) proxyToObject.set(proxied, target)
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
export function untracked(fn: () => ScopedCallback | undefined | void) {
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
	const dep = markWithRoot(<T>(cb: () => T) => withEffect(runEffect, cb), fn)
	let effectStopped = false

	function runEffect() {
		// Clear previous dependencies
		if (cleanup) {
			cleanup()
			cleanup = null
		}

		options.enter(fn)
		const reactionCleanup = withEffect(
			effectStopped ? undefined : runEffect,
			() => fn(dep, ...args)
		)
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
	// Mark the runEffect callback with the original function as its root
	markWithRoot(runEffect, fn)

	// Run the effect immediately
	if(!batchedEffects) {
		hasEffect(runEffect)
	} else {
		const oldBatchedEffects = batchedEffects
		try {
			// Simulate a hasEffect who batches, but do not execute the batch, give it back to the parent batch,
			// Only the immediate effect has to be executed, the sub-effects will be executed by the parent batch
			batchedEffects = new Map([[fn, runEffect]])
			runEffect()
			batchedEffects.delete(fn)
			for(const [root, effect] of batchedEffects!)
				oldBatchedEffects.set(root, effect)
		} finally {
			batchedEffects = oldBatchedEffects
		}
	}

	return (): void => {
		effectStopped = true
		if (cleanup) {
			cleanup()
			cleanup = null
		}
	}
}

/**
 * Mark an object as non-reactive. This object and all its properties will never be made reactive.
 * @param obj - The object to mark as non-reactive
 */
function nonReactive<T extends object[]>(...obj: T): T[0] {
	for (const o of obj) nonReactiveObjects.add(o)
	return obj[0]
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

/**
 * Mark a class as non-reactive. All instances of this class will automatically be non-reactive.
 * @param cls - The class constructor to mark as non-reactive
 */
export function nonReactiveClass<T extends (new (...args: any[]) => any)[]>(...cls: T): T[0] {
	for (const c of cls) if (c) (c.prototype as any)[nonReactiveMark] = true
	return cls[0]
}

nonReactiveClass(Date, RegExp, Error, Promise, Function)
if (typeof window !== 'undefined') nonReactive(window, document)
if (typeof Element !== 'undefined') nonReactiveClass(Element, Node)

export function registerNativeReactivity(
	originalClass: new (...args: any[]) => any,
	reactiveClass: new (...args: any[]) => any
) {
	originalClass.prototype[nativeReactive] = reactiveClass
	nonReactiveClass(reactiveClass)
}