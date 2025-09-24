import {
	type DependencyFunction,
	deepWatch,
	dependant,
	effect,
	getRoot,
	isNonReactive,
	markWithRoot,
	nonReactiveClass,
	nonReactiveObjects,
	type ScopedCallback,
	touched1,
	unreactiveProperties,
	untracked,
	withEffect,
} from './core'

//#region computed
type ComputedFunction<T> = (dep: DependencyFunction) => T
const computedCache = new WeakMap<ComputedFunction<any>, any>()
function computedFunction<T>(getter: ComputedFunction<T>): T {
	const key = getRoot(getter)
	dependant(computedCache, key)
	if (computedCache.has(key)) return computedCache.get(key)
	withEffect(undefined, () => {
		const stop = effect(
			markWithRoot((dep) => {
				if (computedCache.has(key)) {
					computedCache.delete(key)
					touched1(computedCache, { type: 'set', prop: key }, key)
					stop()
				}
				computedCache.set(key, getter(dep))
			}, getter)
		)
	})
	return computedCache.get(key)
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
	spec?: PropertyKey | ClassAccessorDecoratorContext,
	descriptor?: PropertyDescriptor
) {
	return descriptor
		? computedLegacy(target, spec as string | symbol, descriptor)
		: spec !== undefined
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
function computedLegacy(
	_target: any,
	_propertyKey: string | symbol,
	descriptor: PropertyDescriptor
) {
	const original = descriptor.get
	if (original)
		return {
			get(this: any) {
				return computedFunction(() => original.call(this))
			},
			set: descriptor.set,
		}
}

//#endregion

//#region watch

const unsetYet = Symbol('unset-yet')
export interface WatchOptions {
	immediate?: boolean
	deep?: boolean
}
export function watch<T>(
	value: (dep: DependencyFunction) => T,
	changed: (value: T, oldValue?: T) => void,
	options?: Omit<WatchOptions, 'deep'> & { deep?: false }
): ScopedCallback
export function watch<T extends object | any[]>(
	value: (dep: DependencyFunction) => T,
	changed: (value: T, oldValue?: T) => void,
	options?: Omit<WatchOptions, 'deep'> & { deep: true }
): ScopedCallback
export function watch<T extends object | any[]>(
	value: T,
	changed: (value: T) => void,
	options?: WatchOptions
): ScopedCallback

export function watch(
	value: any, //object | ((dep: DependencyFunction) => object),
	changed: (value?: object, oldValue?: object) => void,
	options: any = {}
) {
	return typeof value === 'function'
		? watchCallBack(value, changed, options)
		: typeof value === 'object'
			? watchObject(value, changed, options)
			: (() => {
					throw new Error('watch: value must be a function or an object')
				})()
}

function watchObject(
	value: object,
	changed: (value: object) => void,
	{ immediate = false, deep = false } = {}
): ScopedCallback {
	if (deep) return deepWatch(value, changed, { immediate })
	return effect(
		markWithRoot(() => {
			dependant(value)
			if (immediate) untracked(() => changed(value))
			immediate = true
		}, changed)
	)
}

function watchCallBack<T>(
	value: (dep: DependencyFunction) => T,
	changed: (value: T, oldValue?: T) => void,
	{ immediate = false, deep = false } = {}
): ScopedCallback {
	let oldValue: T | typeof unsetYet = unsetYet
	let deepCleanup: ScopedCallback | undefined
	const cbCleanup = effect(
		markWithRoot((dep) => {
			const newValue = value(dep)
			if (oldValue !== newValue)
				untracked(
					markWithRoot(() => {
						if (oldValue === unsetYet) {
							if (immediate) changed(newValue)
						} else changed(newValue, oldValue)
						oldValue = newValue
						if (deep) {
							if (deepCleanup) deepCleanup()
							deepCleanup = deepWatch(
								newValue as object,
								markWithRoot((value) => changed(value as T, value as T), changed)
							)
						}
					}, changed)
				)
		}, value)
	)
	return () => {
		cbCleanup()
		if (deepCleanup) deepCleanup()
	}
}

//#endregion

//#region nonReactive

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

export function unreactive(target: any, spec?: PropertyKey | ClassFieldDecoratorContext) {
	return typeof spec === 'object'
		? unreactiveStage3(spec as ClassFieldDecoratorContext)
		: spec !== undefined
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

//#endregion
