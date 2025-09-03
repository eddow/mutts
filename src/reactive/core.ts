export type EffectFunction = () => void
export type UnwatchFunction = () => void

// Stack of active effects to handle nested effects
let activeEffect: EffectFunction | undefined
// Track effects per reactive object and property
const watchers = new WeakMap<object, Map<any, Set<EffectFunction>>>()
// Track which effects are watching which reactive objects for cleanup
const effectToReactiveObjects = new Map<EffectFunction, Set<object>>()
// Track currently executing effects to prevent re-execution
const plannedEffects = new Set<EffectFunction>()

// Track object -> proxy and proxy -> object relationships
const objectToProxy = new WeakMap<object, object>()
const proxyToObject = new WeakMap<object, object>()

// Track objects that should never be reactive
const nonReactiveObjects = new WeakSet<object>()
// Track native reactivity
const NativeReactive = Symbol("native-reactive")

// Symbol to mark individual objects as non-reactive
const NonReactive = Symbol("non-reactive")
// Symbol to mark class properties as non-reactive
const UnreactiveProperties = Symbol("unreactive-properties")

export class ReactiveError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "ReactiveError"
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
	enter: (effect: EffectFunction) => {},
	/**
	 * Debug purpose: called when an effect is left
	 * @param effect - The effect that is left
	 */
	leave: (effect: EffectFunction) => {},
	/**
	 * Debug purpose: called when an effect is chained
	 * @param caller - The effect that is calling the target
	 * @param target - The effect that is being triggered
	 */
	chain: (caller: EffectFunction, target: EffectFunction) => {},
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
} as const

/**
 * Mark an object as non-reactive. This object and all its properties will never be made reactive.
 * @param obj - The object to mark as non-reactive
 */
export function nonReactive<T extends object[]>(...obj: T): T[0] {
	for (const o of obj) nonReactiveObjects.add(o)
	return obj[0]
}

/**
 * Mark an object as non-reactive. This object and all its properties will never be made reactive.
 * @param obj - The object to mark as non-reactive
 */
export function deepNonReactive<T>(obj: T): T {
	if (isNonReactive(obj)) return obj
	nonReactiveObjects.add(obj as object)
	for (const key in obj) deepNonReactive(obj[key])
	return obj
}

/**
 * Mark a class as non-reactive. All instances of this class will automatically be non-reactive.
 * @param cls - The class constructor to mark as non-reactive
 */
export function nonReactiveClass<T extends (new (...args: any[]) => any)[]>(...cls: T): T[0] {
	for (const c of cls) if (c) (c.prototype as any)[NonReactive] = true
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

export function unreactive(target: any, desc?: PropertyKey | ClassFieldDecoratorContext) {
	if(desc !== undefined) {
		return target ?
			unreactiveLegacy(target, desc as string | symbol) :
			unreactiveStage3(desc as ClassFieldDecoratorContext)
	}
	if(typeof target === "function") return nonReactiveClass(target)
	return deepNonReactive(target)
}

function unreactiveLegacy(target: any, propertyKey: string | symbol) {
    // Initialize the unreactive properties set if it doesn't exist
    if (!target[UnreactiveProperties]) {
        target[UnreactiveProperties] = new Set<string | symbol>()
    }
    
    // Add this property to the unreactive set
    target[UnreactiveProperties].add(propertyKey)
}
function unreactiveStage3(context: ClassFieldDecoratorContext) {
	context.addInitializer(function(this: any) {
		// Initialize the unreactive properties set if it doesn't exist
		if (!this[UnreactiveProperties]) {
			this[UnreactiveProperties] = new Set<string | symbol>()
		}
		
		// Add this property to the unreactive set
		this[UnreactiveProperties].add(context.name)
	})
}

/**
 * Check if an object is marked as non-reactive (for testing purposes)
 * @param obj - The object to check
 * @returns true if the object is marked as non-reactive
 */
export function isNonReactive(obj: any): boolean {
	// Don't make primitives reactive
	if (obj === null || typeof obj !== "object") return true

	// Check if the object itself is marked as non-reactive
	if (nonReactiveObjects.has(obj)) return true

	// Check if the object has the non-reactive symbol
	if (obj[NonReactive]) return true

	return false
}

export function dependant(obj: any, prop: any) {
	if (activeEffect) {
		const objectWatchers = watchers.get(obj) || new Map<PropertyKey, Set<EffectFunction>>()
		const deps = objectWatchers.get(prop) || new Set<EffectFunction>()
		deps.add(activeEffect)
		objectWatchers.set(prop, deps)
		watchers.set(obj, objectWatchers)

		// Track which reactive objects this effect is watching
		const effectObjects = effectToReactiveObjects.get(activeEffect) || new Set<object>()
		effectObjects.add(obj)
		effectToReactiveObjects.set(activeEffect, effectObjects)
	}
}

function hasEffect(effect: EffectFunction) {
	plannedEffects.add(effect)
	let effectCount = 0
	if (!activeEffect) {
		try {
			while (plannedEffects.size) {
				if (effectCount > options.maxEffectChain)
					throw new ReactiveError("[reactive] Max effect chain reached")
				effectCount++
				const effect = plannedEffects.values().next().value!
				effect()
				plannedEffects.delete(effect)
			}
		} finally {
			plannedEffects.clear()
		}
	} else options?.chain(activeEffect, effect)
}

export function touched(obj: any, prop: any) {
	const objectWatchers = watchers.get(obj)
	if (objectWatchers) {
		const deps = objectWatchers.get(prop)
		if (deps) {
			const theseDeps = Array.from(deps)
			for (const effect of theseDeps) hasEffect(effect)
		}
	}
}

function retyped(prop: PropertyKey) {
	if (typeof prop !== "string") return prop
	const n = Number.parseFloat(prop as string)
	return isNaN(n) ? prop : n
}

const reactiveHandlers = {
	get(obj: any, prop: PropertyKey, receiver: any) {
		// Check if this property is marked as unreactive
		prop = retyped(prop)
		function get() {
			// For unreactive properties, bypass reactivity entirely
			if (!(prop in obj)) return undefined
			let browser = obj
			let pD = Object.getOwnPropertyDescriptor(browser, prop)
			while (!pD && browser !== Object.prototype) {
				browser = Object.getPrototypeOf(browser)
				pD = Object.getOwnPropertyDescriptor(browser, prop)
			}
			return pD?.get ? pD.get.call(receiver) : obj[prop]
		}
		if (obj[UnreactiveProperties]?.has(prop)) return get()
		// Only track own properties, not inherited methods or properties
		if (!options.instanceMembers || Object.hasOwn(receiver, prop)) dependant(obj, prop)
		if (!(prop in obj)) return undefined
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
		if (obj[UnreactiveProperties]?.has(prop)) {
			if (!set(value)) (obj as any)[prop] = value
			return true
		}
		
		const oldVal = (obj as any)[prop]
		const newValue = reactive(value)

		if (!set(newValue)) (obj as any)[prop] = newValue
		if (oldVal !== newValue) touched(obj, prop)
		return true
	},
	deleteProperty(obj: any, prop: PropertyKey): boolean {
		prop = retyped(prop)
		if(!Object.hasOwn(obj, prop)) return false
		delete (obj as any)[prop]
		touched(obj, prop)
		return true
	}
}

export function reactive<T extends Record<PropertyKey, any>>(target: T): T {
	// If target is already a proxy, return it
	if (proxyToObject.has(target) || isNonReactive(target)) return target as T

	// If we already have a proxy for this object, return it
	if (objectToProxy.has(target)) return objectToProxy.get(target) as T

	const proxied =  target[NativeReactive] && !(target instanceof target[NativeReactive]) ?
		new target[NativeReactive](target) :
		target

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

/**
 *
 * @param fn - The effect function to run
 * @param reaction - The effect-less function to run each time the effect is run
 * @returns The cleanup function
 */
export function effect(
	fn: EffectFunction,
	reaction?: () => UnwatchFunction | undefined,
): UnwatchFunction {
	// Prevent nested effects
	if (activeEffect) {
		throw new ReactiveError(
			"Nested effects are not allowed. Effects cannot be created inside other effects.",
		)
	}

	let cleanup: (() => void) | null = null

	function runEffect() {
		// Clear previous dependencies
		if (cleanup) {
			cleanup()
			cleanup = null
		}

		// Push this effect onto the active effects stack
		activeEffect = runEffect

		options.enter(fn)
		try {
			// Run the effect function
			fn()
		} finally {
			// Pop this effect from the active effects stack
			activeEffect = undefined
			options.leave(fn)
		}
		const reactionCleanup = reaction?.()

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

	// Run the effect immediately
	runEffect()

	return (): void => {
		if (cleanup) {
			cleanup()
			cleanup = null
		}
	}
}
/**
 * Mixin to have a class defining reactive objects
 * Note: creates a proxy per instance, not per prototype, so that instances can be `unwrap`-ed
 * @param target - The object to make reactive
 * @returns The reactive object
 */
export const Reactive = <Base extends new (...args: any[]) => any>(Base: Base = Object as any) =>
	class Reactive extends Base {
		constructor(...args: any[]) {
			super(...args)
			//biome-ignore lint/correctness/noConstructorReturn: This is the whole point of this mixin
			return reactive(this)
		}
	}

nonReactiveClass(Array, Date, RegExp, Error, Set, WeakSet, Promise, Function)
if (typeof window !== "undefined") nonReactive(window, document)
if (typeof Element !== "undefined") nonReactiveClass(Element, Node)

export function registerNativeReactivity(originalClass: new (...args: any[]) => any, reactiveClass: new (...args: any[]) => any) {
	originalClass.prototype[NativeReactive] = reactiveClass
}
