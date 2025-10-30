// biome-ignore-all lint/suspicious/noConfusingVoidType: Type 'void' is not assignable to type 'ScopedCallback | undefined'.
// Argument of type '() => void' is not assignable to parameter of type '(dep: DependencyFunction) => ScopedCallback | undefined'.

import { decorator } from '../decorator'
import { mixin } from '../mixins'
import { isObject, isOwnAccessor, ReflectGet, ReflectSet } from '../utils'

/**
 * Function type for dependency tracking in effects and computed values
 * Restores the active effect context for dependency tracking
 */
export type DependencyFunction = <T>(cb: () => T) => T
/**
 * Dependency access passed to user callbacks within effects/computed/watch
 * Provides functions to track dependencies and information about the effect execution
 */
export interface DependencyAccess {
	/**
	 * Tracks dependencies in the current effect context
	 * Use this for normal dependency tracking within the effect
	 * @example
	 * ```typescript
	 * effect(({ tracked }) => {
	 *   // In async context, use tracked to restore dependency tracking
	 *   await someAsyncOperation()
	 *   const value = tracked(() => state.count) // Tracks state.count in this effect
	 * })
	 * ```
	 */
	tracked: DependencyFunction
	/**
	 * Tracks dependencies in the parent effect context
	 * Use this when child effects should track dependencies in the parent,
	 * allowing parent cleanup to manage child effects while dependencies trigger the parent
	 * @example
	 * ```typescript
	 * effect(({ ascend }) => {
	 *   const length = inputs.length
	 *   if (length > 0) {
	 *     ascend(() => {
	 *       // Dependencies here are tracked in the parent effect
	 *       inputs.forEach(item => console.log(item))
	 *     })
	 *   }
	 * })
	 * ```
	 */
	ascend: DependencyFunction
	/**
	 * Indicates whether this is the initial execution of the effect
	 * - `true`: First execution when the effect is created
	 * - `false`: Subsequent executions triggered by dependency changes
	 * @example
	 * ```typescript
	 * effect(({ init }) => {
	 *   if (init) {
	 *     console.log('Effect initialized')
	 *     // Setup code that should only run once
	 *   } else {
	 *     console.log('Effect re-ran due to dependency change')
	 *     // Code that runs on every update
	 *   }
	 * })
	 * ```
	 */
	init: boolean
}
// TODO: proper async management, read when fn returns a promise and let the effect as "running",
//  either to cancel the running one or to avoid running 2 in "parallel" and debounce the second one

/**
 * Type for effect cleanup functions
 */
export type ScopedCallback = () => void

/**
 * Type for property evolution events
 */
export type PropEvolution = {
	type: 'set' | 'del' | 'add' | 'invalidate'
	prop: any
}

/**
 * Type for collection operation evolution events
 */
export type BunchEvolution = {
	type: 'bunch'
	method: string
}
export type Evolution = PropEvolution | BunchEvolution

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
// Deep watching data structures
// Track which objects contain which other objects (back-references)
const objectParents = new WeakMap<object, Set<{ parent: object; prop: PropertyKey }>>()

// Track which objects have deep watchers
const objectsWithDeepWatchers = new WeakSet<object>()

// Track deep watchers per object
const deepWatchers = new WeakMap<object, Set<ScopedCallback>>()

// Track which effects are doing deep watching
const effectToDeepWatchedObjects = new WeakMap<ScopedCallback, Set<object>>()

// Track objects that should never be reactive and cannot be modified
/**
 * WeakSet containing objects that should never be made reactive
 */
export const nonReactiveObjects = new WeakSet<object>()
const absent = Symbol('absent')
/**
 * Converts an iterator to a generator that yields reactive values
 */
export function* makeReactiveIterator<T>(iterator: Iterator<T>): Generator<T> {
	let result = iterator.next()
	while (!result.done) {
		yield reactive(result.value)
		result = iterator.next()
	}
}

/**
 * Converts an iterator of key-value pairs to a generator that yields reactive key-value pairs
 */
export function* makeReactiveEntriesIterator<K, V>(iterator: Iterator<[K, V]>): Generator<[K, V]> {
	let result = iterator.next()
	while (!result.done) {
		const [key, value] = result.value
		yield [reactive(key), reactive(value)]
		result = iterator.next()
	}
}

// Track effects per reactive object and property
const watchers = new WeakMap<object, Map<any, Set<ScopedCallback>>>()

/**
 * Object containing internal reactive system state for debugging and profiling
 */
export const profileInfo: any = {
	objectToProxy,
	proxyToObject,
	effectToReactiveObjects,
	watchers,
	objectParents,
	objectsWithDeepWatchers,
	deepWatchers,
	effectToDeepWatchedObjects,
	nonReactiveObjects,
}
// Track native reactivity
const nativeReactive = Symbol('native-reactive')

/**
 * Symbol to mark individual objects as non-reactive
 */
export const nonReactiveMark = Symbol('non-reactive')
/**
 * Symbol to mark class properties as non-reactive
 */
export const unreactiveProperties = Symbol('unreactive-properties')
/**
 * Symbol for prototype forwarding in reactive objects
 */
export const prototypeForwarding: unique symbol = Symbol('prototype-forwarding')

/**
 * Symbol representing all properties in reactive tracking
 */
export const allProps = Symbol('all-props')

// Symbol to mark functions with their root function
const rootFunction = Symbol('root-function')

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

/**
 * Error class for reactive system errors
 */
export class ReactiveError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ReactiveError'
	}
}

// biome-ignore-start lint/correctness/noUnusedFunctionParameters: Interface declaration with empty defaults
/**
 * Global options for the reactive system
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
	chain: (targets: Function[], caller?: Function) => {},
	/**
	 * Debug purpose: called when an effect chain is started
	 * @param target - The effect that is being triggered
	 */
	beginChain: (targets: Function[]) => {},
	/**
	 * Debug purpose: called when an effect chain is ended
	 */
	endChain: () => {},
	/**
	 * Debug purpose: called when an object is touched
	 * @param obj - The object that is touched
	 * @param evolution - The type of change
	 * @param props - The properties that changed
	 * @param deps - The dependencies that changed
	 */
	touched: (obj: any, evolution: Evolution, props?: any[], deps?: Set<ScopedCallback>) => {},
	/**
	 * Debug purpose: maximum effect chain (like call stack max depth)
	 * Used to prevent infinite loops
	 * @default 100
	 */
	maxEffectChain: 100,
	/**
	 * Debug purpose: maximum effect reaction (like call stack max depth)
	 * Used to prevent infinite loops
	 * @default 'throw'
	 */
	maxEffectReaction: 'throw' as 'throw' | 'debug' | 'warn',
	/**
	 * Maximum depth for deep watching traversal
	 * Used to prevent infinite recursion in circular references
	 * @default 100
	 */
	maxDeepWatchDepth: 100,
	/**
	 * Only react on instance members modification (not inherited properties)
	 * For instance, do not track class methods
	 * @default true
	 */
	instanceMembers: true,
	/**
	 * Ignore accessors (getters and setters) and only track direct properties
	 * @default true
	 */
	ignoreAccessors: true,
	// biome-ignore lint/suspicious/noConsole: This is the whole point here
	warn: (...args: any[]) => console.warn(...args),
}
// biome-ignore-end lint/correctness/noUnusedFunctionParameters: Interface declaration with empty defaults

//#region evolution
type EffectTracking = (obj: any, evolution: Evolution, prop: any) => void
/**
 * Registers a debug callback that is called when the current effect is triggered by a dependency change
 *
 * This function is useful for debugging purposes as it pin-points exactly which reactive property
 * change triggered the effect. The callback receives information about:
 * - The object that changed
 * - The type of change (evolution)
 * - The specific property that changed
 *
 * **Note:** The tracker callback is automatically removed after being called once. If you need
 * to track multiple triggers, call `trackEffect` again within the effect.
 *
 * @param onTouch - Callback function that receives (obj, evolution, prop) when the effect is triggered
 * @throws {Error} If called outside of an effect context
 *
 * @example
 * ```typescript
 * const state = reactive({ count: 0, name: 'John' })
 *
 * effect(() => {
 *   // Register a tracker to see what triggers this effect
 *   trackEffect((obj, evolution, prop) => {
 *     console.log(`Effect triggered by:`, {
 *       object: obj,
 *       change: evolution.type,
 *       property: prop
 *     })
 *   })
 *
 *   // Access reactive properties
 *   console.log(state.count, state.name)
 * })
 *
 * state.count = 5
 * // Logs: Effect triggered by: { object: state, change: 'set', property: 'count' }
 * ```
 */
export function trackEffect(onTouch: EffectTracking) {
	if (!activeEffect) throw new Error('Not in an effect')
	if (!effectTrackers.has(activeEffect)) effectTrackers.set(activeEffect, new Set([onTouch]))
	else effectTrackers.get(activeEffect)!.add(onTouch)
}

const effectTrackers = new WeakMap<ScopedCallback, Set<EffectTracking>>()

function collectEffects(
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

const states = new WeakMap<object, State>()

function addState(obj: any, evolution: Evolution) {
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

/**
 * Marks a property as a dependency of the current effect
 * @param obj - The object containing the property
 * @param prop - The property name (defaults to allProps)
 */
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

// Active effects to handle nested effects
export let activeEffect: ScopedCallback | undefined
// Parent effect used for lifecycle/cleanup relationships (can diverge later)
let parentEffect: ScopedCallback | undefined

// Track currently executing effects to prevent re-execution
// These are all the effects triggered under `activeEffect`
let batchedEffects: Map<Function, ScopedCallback> | undefined
const batchCleanups = new Set<ScopedCallback>()

/**
 * Adds a cleanup function to be called when the current batch of effects completes
 * @param cleanup - The cleanup function to add
 */
export function addBatchCleanup(cleanup: ScopedCallback) {
	if (!batchedEffects) cleanup()
	else batchCleanups.add(cleanup)
}
// Track which sub-effects have been executed to prevent infinite loops
// These are all the effects triggered under `activeEffect` and all their sub-effects
function batch(effect: ScopedCallback | ScopedCallback[], immediate?: 'immediate') {
	if (!Array.isArray(effect)) effect = [effect]
	const roots = effect.map(getRoot)

	if (batchedEffects) {
		options?.chain(roots, getRoot(activeEffect))
		for (let i = 0; i < effect.length; i++) batchedEffects.set(roots[i], effect[i])
		if (immediate)
			for (let i = 0; i < effect.length; i++)
				try {
					return effect[i]()
				} finally {
					batchedEffects.delete(roots[i])
				}
	} else {
		options.beginChain(roots)
		const runEffects: any[] = []
		batchedEffects = new Map<Function, ScopedCallback>(roots.map((root, i) => [root, effect[i]]))
		const firstReturn: { value?: any } = {}
		try {
			while (batchedEffects.size) {
				if (runEffects.length > options.maxEffectChain) {
					switch (options.maxEffectReaction) {
						case 'throw':
							throw new ReactiveError('[reactive] Max effect chain reached')
						case 'debug':
							// biome-ignore lint/suspicious/noDebugger: This is the whole point here
							debugger
							break
						case 'warn':
							options.warn('[reactive] Max effect chain reached')
							break
					}
				}
				const [root, effect] = batchedEffects.entries().next().value!
				runEffects.push(root)
				const rv = effect()
				if (!('value' in firstReturn)) firstReturn.value = rv
				batchedEffects.delete(root)
			}
			const cleanups = Array.from(batchCleanups)
			batchCleanups.clear()
			for (const cleanup of cleanups) cleanup()
			return firstReturn.value
		} finally {
			batchedEffects = undefined
			options.endChain()
		}
	}
}

/**
 * Decorator that makes methods atomic - batches all effects triggered within the method
 */
export const atomic = decorator({
	method(original) {
		return function (...args: any[]) {
			return batch(
				markWithRoot(() => original.apply(this, args), original),
				'immediate'
			)
		}
	},
	default<Args extends any[], Return>(
		original: (...args: Args) => Return
	): (...args: Args) => Return {
		return function (...args: Args) {
			return batch(
				markWithRoot(() => original.apply(this, args), original),
				'immediate'
			)
		}
	},
})

/**
 * Executes a function with a specific effect context
 * @param effect - The effect to use as context
 * @param fn - The function to execute
 * @param keepParent - Whether to keep the parent effect context
 * @returns The result of the function
 */
export function withEffect<T>(
	effect: ScopedCallback | undefined,
	fn: () => T,
	keepParent?: true
): T {
	if (getRoot(effect) === getRoot(activeEffect)) return fn()
	const oldActiveEffect = activeEffect
	const oldParentEffect = parentEffect
	activeEffect = effect
	if (!keepParent) parentEffect = effect
	try {
		return fn()
	} finally {
		activeEffect = oldActiveEffect
		parentEffect = oldParentEffect
	}
}

//#endregion

//#region deep watching

/**
 * Add a back-reference from child to parent
 */
function addBackReference(child: object, parent: object, prop: any) {
	let parents = objectParents.get(child)
	if (!parents) {
		parents = new Set()
		objectParents.set(child, parents)
	}
	parents.add({ parent, prop })
}

/**
 * Remove a back-reference from child to parent
 */
function removeBackReference(child: object, parent: object, prop: any) {
	const parents = objectParents.get(child)
	if (parents) {
		parents.delete({ parent, prop })
		if (parents.size === 0) {
			objectParents.delete(child)
		}
	}
}

/**
 * Check if an object needs back-references (has deep watchers or parents with deep watchers)
 */
function needsBackReferences(obj: object): boolean {
	return objectsWithDeepWatchers.has(obj) || hasParentWithDeepWatchers(obj)
}

/**
 * Check if an object has any parent with deep watchers
 */
function hasParentWithDeepWatchers(obj: object): boolean {
	const parents = objectParents.get(obj)
	if (!parents) return false

	for (const { parent } of parents) {
		if (objectsWithDeepWatchers.has(parent)) return true
		if (hasParentWithDeepWatchers(parent)) return true
	}
	return false
}

/**
 * Bubble up changes through the back-reference chain
 */
function bubbleUpChange(changedObject: object, evolution: Evolution) {
	const parents = objectParents.get(changedObject)
	if (!parents) return

	for (const { parent } of parents) {
		// Trigger deep watchers on parent
		const parentDeepWatchers = deepWatchers.get(parent)
		if (parentDeepWatchers) for (const watcher of parentDeepWatchers) batch(watcher)

		// Continue bubbling up
		bubbleUpChange(parent, evolution)
	}
}

/**
 * Tracks property changes and manages back-references for deep watching
 * @param obj - The object that changed
 * @param prop - The property that changed
 * @param oldVal - The old value
 * @param newValue - The new value
 */
export function track1(obj: object, prop: any, oldVal: any, newValue: any) {
	// Manage back-references if this object has deep watchers
	if (objectsWithDeepWatchers.has(obj)) {
		// Remove old back-references
		if (typeof oldVal === 'object' && oldVal !== null) {
			removeBackReference(oldVal, obj, prop)
		}

		// Add new back-references
		if (typeof newValue === 'object' && newValue !== null) {
			const reactiveValue = reactive(newValue)
			addBackReference(reactiveValue, obj, prop)
		}
	}
	return newValue
}

//#endregion

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
		if (unwrap(obj)[unreactiveProperties]?.has(prop)) return ReflectSet(obj, prop, value, receiver)
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

		const oldVal = Reflect.has(receiver, prop)
			? unwrap(ReflectGet(obj, prop, unwrap(receiver)))
			: absent
		track1(obj, prop, oldVal, newValue)

		if (oldVal !== newValue) {
			ReflectSet(obj, prop, newValue, receiver)

			touched1(obj, { type: oldVal !== absent ? 'set' : 'add', prop }, prop)
		}
		return true
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
/**
 * Always-reactive mixin that makes classes inherently reactive
 * Can be used as both a base class and a mixin function
 */
export const Reactive = mixin((base) => {
	class ReactiveMixin extends base {
		constructor(...args: any[]) {
			super(...args)
			// Only apply reactive transformation if the class is marked with @reactive
			// This allows the mixin to work properly with method inheritance
			// biome-ignore lint/correctness/noConstructorReturn: This is the whole point here
			return reactive(this)
		}
	}
	// Mark this as the Reactive mixin to distinguish it from ReactiveBase
	;(ReactiveMixin as any).__isReactiveMixin = true
	return ReactiveMixin
}, unwrap)
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

		// Check if the class extends the Reactive mixin (not ReactiveBase) by checking the prototype chain
		let current = original.prototype
		while (current && current !== Object.prototype) {
			// Check if this is the Reactive mixin specifically (not ReactiveBase)
			if (current.constructor && (current.constructor as any).__isReactiveMixin) {
				throw new Error(
					'@reactive decorator cannot be used with Reactive mixin. Reactive mixin already provides reactivity.'
				)
			}
			current = Object.getPrototypeOf(current)
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
/**
 * Executes a function without tracking dependencies
 * @param fn - The function to execute
 */
export function untracked<T>(fn: () => T): T {
	let rv: T
	withEffect(
		undefined,
		() => {
			rv = fn()
		} /*,
		true*/
	)
	return rv
}

// runEffect -> set<stop>
const effectChildren = new WeakMap<ScopedCallback, Set<ScopedCallback>>()
const fr = new FinalizationRegistry<() => void>((f) => f())

/**
 * @param fn - The effect function to run - provides the cleaner
 * @returns The cleanup function
 */
/**
 * Creates a reactive effect that automatically re-runs when dependencies change
 * @param fn - The effect function that provides dependencies and may return a cleanup function
 * @param args - Additional arguments that are forwarded to the effect function
 * @returns A cleanup function to stop the effect
 */
export function effect<Args extends any[]>(
	fn: (access: DependencyAccess, ...args: Args) => ScopedCallback | undefined | void,
	...args: Args
): ScopedCallback {
	let cleanup: (() => void) | null = null
	// capture the parent effect at creation time for ascend
	const parentForAscend = parentEffect
	const tracked = markWithRoot(<T>(cb: () => T) => withEffect(runEffect, cb), fn)
	const ascend = markWithRoot(
		<T>(cb: () => T) => withEffect(parentForAscend, cb),
		getRoot(parentForAscend)
	)
	let effectStopped = false
	let init = true

	function runEffect() {
		// The effect has been stopped after having been planned
		if (effectStopped) return
		// Clear previous dependencies
		cleanup?.()

		options.enter(getRoot(fn))
		let reactionCleanup: ScopedCallback | undefined
		try {
			reactionCleanup = withEffect(runEffect, () => fn({ tracked, ascend, init }, ...args)) as
				| undefined
				| ScopedCallback
		} finally {
			init = false
			options.leave(fn)
		}

		// Create cleanup function for next run
		cleanup = () => {
			cleanup = null
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
			// Invoke all child stops (recursive via subEffectCleanup calling its own mainCleanup)
			const children = effectChildren.get(runEffect)
			if (children) {
				for (const childCleanup of children) childCleanup()
				effectChildren.delete(runEffect)
			}
		}
	}
	// Mark the runEffect callback with the original function as its root
	markWithRoot(runEffect, fn)

	batch(runEffect, 'immediate')

	const stopEffect = (): void => {
		if (effectStopped) return
		effectStopped = true
		cleanup?.()
		fr.unregister(stopEffect)
	}

	const parent = parentEffect
	// Only ROOT effects are registered for GC cleanup
	if (!parent) {
		const callIfCollected = () => stopEffect()
		fr.register(callIfCollected, stopEffect, stopEffect)
		return callIfCollected
	}
	// Register this effect to be stopped when the parent effect is cleaned up
	let children = effectChildren.get(parent)
	if (!children) {
		children = new Set()
		effectChildren.set(parent, children)
	}
	const subEffectCleanup = (): void => {
		children.delete(subEffectCleanup)
		if (children.size === 0) {
			effectChildren.delete(parent)
		}
		// Execute this child effect cleanup (which triggers its own mainCleanup)
		stopEffect()
	}
	children.add(subEffectCleanup)
	return subEffectCleanup
}

/**
 * Mark an object as non-reactive. This object and all its properties will never be made reactive.
 * @param obj - The object to mark as non-reactive
 */
function nonReactive<T extends object[]>(...obj: T): T[0] {
	for (const o of obj) {
		try {
			Object.defineProperty(o, nonReactiveMark, {
				value: true,
				writable: false,
				enumerable: false,
				configurable: false,
			})
		} catch {}
		if (!(nonReactiveMark in (o as object))) nonReactiveObjects.add(o as object)
	}
	return obj[0]
}

/**
 * Set of functions that test if objects are immutable
 * Objects that pass these tests will not be made reactive
 */
export const immutables = new Set<(tested: any) => boolean>()

/**
 * Checks if an object is marked as non-reactive
 * @param obj - The object to check
 * @returns True if the object is non-reactive
 */
export function isNonReactive(obj: any): boolean {
	// Don't make primitives reactive
	if (obj === null || typeof obj !== 'object') return true

	// Check if the object itself is marked as non-reactive
	if (nonReactiveObjects.has(obj)) return true

	// Check if the object has the non-reactive symbol
	if (obj[nonReactiveMark]) return true

	// Check if the object is immutable
	if (Array.from(immutables).some((fn) => fn(obj))) return true

	return false
}

/**
 * Marks classes as non-reactive
 * @param cls - Classes to mark as non-reactive
 * @returns The first class (for chaining)
 */
export function nonReactiveClass<T extends (new (...args: any[]) => any)[]>(...cls: T): T[0] {
	for (const c of cls) if (c) (c.prototype as any)[nonReactiveMark] = true
	return cls[0]
}

nonReactiveClass(Date, RegExp, Error, Promise, Function)
if (typeof window !== 'undefined') nonReactive(window, document)
//if (typeof Element !== 'undefined') nonReactiveClass(Element, Node)

/**
 * Registers a native class to use a specialized reactive wrapper
 * @param originalClass - The original class to register
 * @param reactiveClass - The reactive wrapper class
 */
export function registerNativeReactivity(
	originalClass: new (...args: any[]) => any,
	reactiveClass: new (...args: any[]) => any
) {
	originalClass.prototype[nativeReactive] = reactiveClass
	nonReactiveClass(reactiveClass)
}

/**
 * Deep watch an object and all its nested properties
 * @param target - The object to watch deeply
 * @param callback - The callback to call when any nested property changes
 * @param options - Options for the deep watch
 * @returns A cleanup function to stop watching
 */
/**
 * Sets up deep watching for an object, tracking all nested property changes
 * @param target - The object to watch
 * @param callback - The callback to call when changes occur
 * @param options - Options for deep watching
 * @returns A cleanup function to stop deep watching
 */
export function deepWatch<T extends object>(
	target: T,
	callback: (value: T) => void,
	{ immediate = false } = {}
): (() => void) | undefined {
	if (target === null || target === undefined) return undefined
	if (typeof target !== 'object') throw new Error('Target of deep watching must be an object')
	// Create a wrapper callback that matches ScopedCallback signature
	const wrappedCallback: ScopedCallback = markWithRoot(() => callback(target), callback)

	// Use the existing effect system to register dependencies
	return effect(() => {
		// Mark the target object as having deep watchers
		objectsWithDeepWatchers.add(target)

		// Track which objects this effect is watching for cleanup
		let effectObjects = effectToDeepWatchedObjects.get(wrappedCallback)
		if (!effectObjects) {
			effectObjects = new Set()
			effectToDeepWatchedObjects.set(wrappedCallback, effectObjects)
		}
		effectObjects!.add(target)

		// Traverse the object graph and register dependencies
		// This will re-run every time the effect runs, ensuring we catch all changes
		const visited = new WeakSet()
		function traverseAndTrack(obj: any, depth = 0) {
			// Prevent infinite recursion and excessive depth
			if (visited.has(obj) || !isObject(obj) || depth > options.maxDeepWatchDepth) return
			// Do not traverse into unreactive objects
			if (isNonReactive(obj)) return
			visited.add(obj)

			// Mark this object as having deep watchers
			objectsWithDeepWatchers.add(obj)
			effectObjects!.add(obj)

			// Traverse all properties to register dependencies
			// unwrap to avoid kicking dependency
			for (const key in unwrap(obj)) {
				if (Object.hasOwn(obj, key)) {
					// Access the property to register dependency
					const value = (obj as any)[key]
					// Make the value reactive if it's an object
					const reactiveValue =
						typeof value === 'object' && value !== null ? reactive(value) : value
					traverseAndTrack(reactiveValue, depth + 1)
				}
			}

			// Also handle array indices and length
			// biome-ignore lint/suspicious/useIsArray: Check for both native arrays and reactive arrays
			if (Array.isArray(obj) || obj instanceof Array) {
				// Access array length to register dependency on length changes
				const length = obj.length

				// Access all current array elements to register dependencies
				for (let i = 0; i < length; i++) {
					// Access the array element to register dependency
					const value = obj[i]
					// Make the value reactive if it's an object
					const reactiveValue =
						typeof value === 'object' && value !== null ? reactive(value) : value
					traverseAndTrack(reactiveValue, depth + 1)
				}
			}
			// Handle Set values (deep watch values only, not keys since Sets don't have separate keys)
			else if (obj instanceof Set) {
				// Access all Set values to register dependencies
				for (const value of obj) {
					// Make the value reactive if it's an object
					const reactiveValue =
						typeof value === 'object' && value !== null ? reactive(value) : value
					traverseAndTrack(reactiveValue, depth + 1)
				}
			}
			// Handle Map values (deep watch values only, not keys)
			else if (obj instanceof Map) {
				// Access all Map values to register dependencies
				for (const [_key, value] of obj) {
					// Make the value reactive if it's an object
					const reactiveValue =
						typeof value === 'object' && value !== null ? reactive(value) : value
					traverseAndTrack(reactiveValue, depth + 1)
				}
			}
			// Note: WeakSet and WeakMap cannot be iterated, so we can't deep watch their contents
			// They will only trigger when the collection itself is replaced
		}

		// Traverse the target object to register all dependencies
		// This will register dependencies on all current properties and array elements
		traverseAndTrack(target)

		// Only call the callback if immediate is true or if it's not the first run
		if (immediate) callback(target)
		immediate = true

		// Return a cleanup function that properly removes deep watcher tracking
		return () => {
			// Get the objects this effect was watching
			const effectObjects = effectToDeepWatchedObjects.get(wrappedCallback)
			if (effectObjects) {
				// Remove deep watcher tracking from all objects this effect was watching
				for (const obj of effectObjects) {
					// Check if this object still has other deep watchers
					const watchers = deepWatchers.get(obj)
					if (watchers) {
						// Remove this effect's callback from the watchers
						watchers.delete(wrappedCallback)

						// If no more watchers, remove the object from deep watchers tracking
						if (watchers.size === 0) {
							deepWatchers.delete(obj)
							objectsWithDeepWatchers.delete(obj)
						}
					} else {
						// No watchers found, remove from deep watchers tracking
						objectsWithDeepWatchers.delete(obj)
					}
				}

				// Clean up the tracking data
				effectToDeepWatchedObjects.delete(wrappedCallback)
			}
		}
	})
}
