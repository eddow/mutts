// biome-ignore-all lint/suspicious/noConfusingVoidType: Type 'void' is not assignable to type 'ScopedCallback | undefined'.
// Argument of type '() => void' is not assignable to parameter of type '(dep: DependencyFunction) => ScopedCallback | undefined'.

import { Indexable } from '../indexable'

export type DependencyFunction = <T>(cb: () => T) => T
// TODO: proper async management, read when fn returns a promise and let the effect as "running",
//  either to cancel the running one or to avoid running 2 in "parallel" and debounce the second one

// TODO Auto add cleanup to `parent` effect cleanup ? + case for watch and warning on no parent + no return
// Idea: on GC of effect, call it

// TODO: watch on callback + watch-return-value ?

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

// Deep watching data structures
// Track which objects contain which other objects (back-references)
const objectParents = new WeakMap<object, Set<{ parent: object; prop: PropertyKey }>>()

// Track which objects have deep watchers
const objectsWithDeepWatchers = new WeakSet<object>()

// Track deep watchers per object
const deepWatchers = new WeakMap<object, Set<ScopedCallback>>()

// Track which effects are doing deep watching
const effectToDeepWatchedObjects = new WeakMap<ScopedCallback, Set<object>>()

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
	touched(obj, evolution, [prop])
}

export function touched(obj: any, evolution: Evolution, props?: Iterable<any>) {
	obj = unwrap(obj)
	addState(obj, evolution)
	const objectWatchers = watchers.get(obj)
	if (objectWatchers) {
		if (props) raiseDeps(objectWatchers, [allProps], props)
		else raiseDeps(objectWatchers, objectWatchers.keys())
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
	// TODO: avoid depending on property get?
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
// Parent effect used for lifecycle/cleanup relationships (can diverge later)
let parentEffect: ScopedCallback | undefined

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

export function withEffect<T>(effect: ScopedCallback | undefined, fn: () => T, keepParent?: true): T {
	if (getRoot(effect) === getRoot(activeEffect)) return fn()
	const oldActiveEffect = activeEffect
	const oldParentEffect = parentEffect
	activeEffect = effect
	if(!keepParent) parentEffect = effect
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
		if (parentDeepWatchers) {
			for (const watcher of parentDeepWatchers) {
				hasEffect(watcher)
			}
		}

		// Continue bubbling up
		bubbleUpChange(parent, evolution)
	}
}

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
}

//#endregion

const reactiveHandlers = {
	[Symbol.toStringTag]: 'MutTs Reactive',
	get(obj: any, prop: PropertyKey, receiver: any) {
		if(prop === nonReactiveMark) return false
		// Check if this property is marked as unreactive
		if (obj[unreactiveProperties]?.has(prop) || typeof prop === 'symbol')
			return Reflect.get(obj, prop, receiver)
		const absent = !(prop in obj)
		// Depend if...
		if (!options.instanceMembers || Object.hasOwn(receiver, prop) || absent) dependant(obj, prop)

		const value = Reflect.get(obj, prop, receiver)
		if (typeof value === 'object' && value !== null) {
			const reactiveValue = reactive(value)

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
		if (obj[unreactiveProperties]?.has(prop))
			return Reflect.set(obj, prop, value, receiver)
		// Really specific case for when Array is forwarder, in order to let it manage the reactivity
		const isArrayCase =
			prototypeForwarding in obj &&
			obj[prototypeForwarding] instanceof Array &&
			(!Number.isNaN(Number(prop)) || prop === 'length')
		const newValue = unwrap(value)

		if (isArrayCase) {
			;(obj as any)[prop] = newValue
			return true
		}

		const oldVal = (obj as any)[prop]
		const oldPresent = prop in obj
		track1(obj, prop, oldVal, newValue)

		if (oldVal !== newValue) {
			Reflect.set(obj, prop, newValue, receiver)
			// try to find a "generic" way to express that
			touched1(obj, { type: oldPresent ? 'set' : 'add', prop }, prop)
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
} as const

const reactiveClasses = new WeakSet<Function>()
export class ReactiveBase {
	constructor() {
		return reactiveClasses.has(new.target) ? reactive(this) : this
	}
}

export function reactive<T>(anyTarget: T): T {
	if (typeof anyTarget === 'function') {
		if(anyTarget.prototype instanceof ReactiveBase) {
			reactiveClasses.add(anyTarget)
			return anyTarget
		}
		//@ts-expect-error - anyTarget is a constructor function
		class Reactive extends anyTarget {
			constructor(...args: any[]) {
				super(...args)
				if(new.target !== Reactive && !reactiveClasses.has(new.target))
					console.warn(
						`${(anyTarget as any).name} has been inherited by ${this.constructor.name} that is not reactive.
@reactive decorator must be applied to the leaf class OR classes have to extend ReactiveBase.`
					)
				return reactive(this)
			}
		}
		Object.defineProperty(Reactive, 'name', { value: `Reactive<${anyTarget.name}>` })
		return Reactive as any
	}
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
	// Return the original object
	return (proxyToObject.get(proxy as any) as T) ?? proxy
}

export function isReactive(obj: any): boolean {
	return proxyToObject.has(obj)
}
export function untracked(fn: () => ScopedCallback | undefined | void) {
	withEffect(undefined, fn, true)
}

// runEffect -> set<cleanup>
const effectChildren = new WeakMap<ScopedCallback, Set<ScopedCallback>>()
const fr = new FinalizationRegistry<() => void>((f) => f())

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
		const reactionCleanup = withEffect(effectStopped ? undefined : runEffect, () =>
			fn(dep, ...args)
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
	if (!batchedEffects) {
		hasEffect(runEffect)
	} else {
		const oldBatchedEffects = batchedEffects
		try {
			// Simulate a hasEffect who batches, but do not execute the batch, give it back to the parent batch,
			// Only the immediate effect has to be executed, the sub-effects will be executed by the parent batch
			batchedEffects = new Map([[fn, runEffect]])
			runEffect()
			batchedEffects.delete(fn)
			for (const [root, effect] of batchedEffects!) oldBatchedEffects.set(root, effect)
		} finally {
			batchedEffects = oldBatchedEffects
		}
	}

	const mainCleanup = (): void => {
		effectStopped = true
		if (cleanup) {
			cleanup()
			cleanup = null
		}
		// Invoke all child cleanups (recursive via subEffectCleanup calling its own mainCleanup)
		const children = effectChildren.get(runEffect)
		if (children) {
			for (const childCleanup of children) childCleanup()
			effectChildren.delete(runEffect)
		}
		
		fr.unregister(mainCleanup)
	}

 	// Only ROOT effects are registered for GC cleanup
	if (!parentEffect) {
		const callIfCollected = () => mainCleanup()
		fr.register(callIfCollected, mainCleanup, callIfCollected)
		return callIfCollected
	}
// TODO: parentEffect = last non-undefined activeEffect
	// Register this effect to be cleaned up with the parent effect
	let children = effectChildren.get(parentEffect)
	if(!children) {
		children = new Set()
		effectChildren.set(parentEffect, children)
	}
	const parent = parentEffect
	const subEffectCleanup = (): void => {
		children.delete(subEffectCleanup)
		if(children.size === 0) {
			effectChildren.delete(parent)
		}
		// Execute this child effect cleanup (which triggers its own mainCleanup)
		mainCleanup()
	}
	children.add(subEffectCleanup)
	return subEffectCleanup
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

/**
 * Deep watch an object and all its nested properties
 * @param target - The object to watch deeply
 * @param callback - The callback to call when any nested property changes
 * @param options - Options for the deep watch
 * @returns A cleanup function to stop watching
 */
export function deepWatch<T extends object>(
	target: T,
	callback: (value: T) => void,
	options: { immediate?: boolean } = {}
): () => void {
	let hasRun = false
	if(typeof target !== 'object' || target === null)
		throw new Error('Target of deep watching must be an object')
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
			if (visited.has(obj) || !isObject(obj) || depth > 100) return
			// Do not traverse into unreactive objects
			if (isNonReactive(obj)) return
			visited.add(obj)

			// Mark this object as having deep watchers
			objectsWithDeepWatchers.add(obj)
			effectObjects!.add(obj)

			// Traverse all properties to register dependencies
			for (const key in obj) {
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
				for (const [key, value] of obj) {
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
		if (options.immediate || hasRun) {
			callback(target)
		}
		hasRun = true

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

/**
 * Check if an object is an object (not null, not primitive)
 */
function isObject(obj: any): obj is object {
	return obj !== null && typeof obj === 'object'
}

;(globalThis as any).mutts = {
	deepWatchers,
	watchers,
}
