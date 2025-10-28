import { decorator, GenericClassDecorator } from '../decorator'
import { renamed } from '../utils'
import {
	activeEffect,
	addBatchCleanup,
	type DependencyFunction,
	deepWatch,
	dependant,
	effect,
	getRoot,
	isNonReactive,
	ladder,
	markWithRoot,
	nonReactiveClass,
	nonReactiveMark,
	nonReactiveObjects,
	options,
	reactive,
	type ScopedCallback,
	touched1,
	unreactiveProperties,
	untracked,
	unwrap,
	withEffect,
} from './core'

//#region computed
let computedInvalidations: (() => void)[] | undefined
/**
 * Registers a callback to be called when a computed property is invalidated
 * @param cb - The callback to register
 * @param warn - Whether to warn if used outside of a computed property
 */
export function invalidateComputed(cb: () => void, warn = true) {
	if (computedInvalidations) computedInvalidations.push(cb)
	else if (warn) options.warn('Using `invalidateComputed` outside of a computed property')
}
type ComputedFunction<T> = (dep: DependencyFunction) => T
const computedCache = new WeakMap<ComputedFunction<any>, any>()
function computedFunction<T>(getter: ComputedFunction<T>): T {
	const key = getRoot(getter)
	let invalidations: (() => void)[] = []
	dependant(computedCache, key)
	if (computedCache.has(key)) return computedCache.get(key)
	let stopped = false
	const once = effect(
		markWithRoot((dep) => {
			if (stopped) return
			const oldCI = computedInvalidations
			if (computedCache.has(key)) {
				// This should *not* be called in the cleanup chain, as its effects would be lost and cleaned-up
				for (const cb of invalidations) cb()
				invalidations = []
				computedCache.delete(key)
				touched1(computedCache, { type: 'invalidate', prop: key }, key)
				once()
				stopped = true
			} else
				try {
					computedInvalidations = invalidations
					computedCache.set(key, getter(dep))
				} finally {
					computedInvalidations = oldCI
				}
		}, getter)
	)
	return computedCache.get(key)
}

/**
 * Decorator and function for creating computed properties that cache their values
 * Only recomputes when dependencies change
 */
export const computed = Object.assign(
	decorator({
		getter(original, propertyKey) {
			const computers = new WeakMap<any, () => any>()
			return function (this: any) {
				if (!computers.has(this)) {
					computers.set(
						this,
						renamed(
							() => original.call(this),
							`${String(this.constructor.name)}.${String(propertyKey)}`
						)
					)
				}
				return computedFunction(computers.get(this)!)
			}
		},
		default: computedFunction,
	}),
	{
		map: computedMap,
		memo: computedMapMemo,
	}
)

//#endregion

//#region watch

const unsetYet = Symbol('unset-yet')
/**
 * Options for the watch function
 */
export interface WatchOptions {
	/** Whether to call the callback immediately */
	immediate?: boolean
	/** Whether to watch nested properties */
	deep?: boolean
}

/**
 * Watches a computed value and calls a callback when it changes
 * @param value - Function that returns the value to watch
 * @param changed - Callback to call when the value changes
 * @param options - Watch options
 * @returns Cleanup function to stop watching
 */
export function watch<T>(
	value: (dep: DependencyFunction) => T,
	changed: (value: T, oldValue?: T) => void,
	options?: Omit<WatchOptions, 'deep'> & { deep?: false }
): ScopedCallback
/**
 * Watches a computed value with deep watching enabled
 * @param value - Function that returns the value to watch
 * @param changed - Callback to call when the value changes
 * @param options - Watch options with deep watching enabled
 * @returns Cleanup function to stop watching
 */
export function watch<T extends object | any[]>(
	value: (dep: DependencyFunction) => T,
	changed: (value: T, oldValue?: T) => void,
	options?: Omit<WatchOptions, 'deep'> & { deep: true }
): ScopedCallback
/**
 * Watches a reactive object directly
 * @param value - The reactive object to watch
 * @param changed - Callback to call when the object changes
 * @param options - Watch options
 * @returns Cleanup function to stop watching
 */
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
	const myParentEffect = activeEffect
	if (deep) return deepWatch(value, changed, { immediate })
	return effect(
		markWithRoot(function watchObjectEffect() {
			dependant(value)
			if (immediate)
				//untracked(() => changed(value))
				withEffect(myParentEffect, () => changed(value))
			immediate = true
		}, changed)
	)
}

function watchCallBack<T>(
	value: (dep: DependencyFunction) => T,
	changed: (value: T, oldValue?: T) => void,
	{ immediate = false, deep = false } = {}
): ScopedCallback {
	const myParentEffect = activeEffect
	let oldValue: T | typeof unsetYet = unsetYet
	let deepCleanup: ScopedCallback | undefined
	const cbCleanup = effect(
		markWithRoot(function watchCallBackEffect(dep) {
			const newValue = value(dep)
			if (oldValue !== newValue)
				withEffect(
					myParentEffect,
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
	obj = unwrap(obj)
	if (isNonReactive(obj)) return obj
	try {
		Object.defineProperty(obj as object, nonReactiveMark, {
			value: true,
			writable: false,
			enumerable: false,
			configurable: true,
		})
	} catch {}
	if (!(nonReactiveMark in (obj as object))) nonReactiveObjects.add(obj as object)
	for (const key in obj) deepNonReactive(obj[key])
	return obj
}
function unreactiveApplication<T extends object>(...args: (keyof T)[]): GenericClassDecorator<T>
function unreactiveApplication<T extends object>(obj: T): T
function unreactiveApplication<T extends object>(
	arg1: T | keyof T,
	...args: (keyof T)[]
): GenericClassDecorator<T> | T {
	return typeof arg1 === 'object'
		? deepNonReactive(arg1)
		: (((original) => {
				// Copy the parent's unreactive properties if they exist
				original.prototype[unreactiveProperties] = new Set<PropertyKey>(
					original.prototype[unreactiveProperties] || []
				)
				// Add all arguments (including the first one)
				original.prototype[unreactiveProperties].add(arg1)
				for (const arg of args) original.prototype[unreactiveProperties].add(arg)
				return original // Return the class
			}) as GenericClassDecorator<T>)
}
/**
 * Decorator that marks classes or properties as non-reactive
 * Prevents objects from being made reactive
 */
export const unreactive = decorator({
	class(original) {
		// Called without arguments, mark entire class as non-reactive
		nonReactiveClass(original)
	},
	default: unreactiveApplication,
})

//#endregion

import { profileInfo } from './core'

Object.assign(profileInfo, { computedCache })

export function cleanedBy<T extends object>(obj: T, cleanup: ScopedCallback) {
	return Object.defineProperty(obj, 'cleanup', {
		value: cleanup,
		writable: false,
		enumerable: false,
		configurable: true,
	}) as T & { cleanup: () => void }
}

//#region greedy caching

/**
 * Creates a derived value that automatically recomputes when dependencies change
 * Unlike computed, this always recomputes immediately when dependencies change
 * @param compute - Function that computes the derived value
 * @returns Object with value and cleanup function
 */
export function derived<T>(compute: (dep: DependencyFunction) => T): {
	value: T
	cleanup: ScopedCallback
} {
	const rv = { value: undefined }
	return cleanedBy(
		rv,
		untracked(() =>
			effect(
				markWithRoot(function derivedEffect(dep) {
					rv.value = compute(dep)
				}, compute)
			)
		)
	)
}

function computedMap<T, U>(
	inputs: T[],
	compute: (input: T, index: number, oldValue?: U) => U,
	resize?: (length: number) => void
): U[] {
	const result = reactive([])
	const cleanups: ScopedCallback[] = []
	function input(index: number) {
		return effect(function computedIndexedMapInputEffect() {
			result[index] = compute(inputs[index], index, result[index])
		})
	}
	ladder(function computedMapLengthEffect(ascend) {
		const length = inputs.length
		ascend(function computedMapResize() {
			resize?.(length)
			const resultLength = untracked(() => result.length)
			if (length < resultLength) {
				const toCleanup = cleanups.splice(length)
				for (const cleanup of toCleanup) cleanup()
				result.length = length
			} else if (length > resultLength)
				for (let i = resultLength; i < length; i++) cleanups.push(input(i))
		})
	})
	return result
}

type MemoEntry<O> = {
	value: O
	cleanup: ScopedCallback
}

@unreactive
export class Memoized<I, O> {
	constructor(private compute: (input: I) => O) {
		ladder((ascend) => {
			this.inEffect = ascend
		})
	}
	private inEffect: DependencyFunction
	private cache = new Map<I, MemoEntry<O>>()
	get(input: I): O {
		dependant(this, input)
		let cached: any
		if (this.cache.has(input)) {
			cached = this.cache.get(input)!
		} else {
			cached = {}
			cached.cleanup = this.inEffect(() =>
				effect(
					Object.defineProperties(
						() => {
							if ('value' in cached) {
								this.cache.delete(input)
								touched1(this, { type: 'invalidate', prop: input }, input)
							} else {
								cached.value = this.compute(input)
							}
						},
						{ name: { value: 'Memoize' } }
					)
				)
			)
			this.cache.set(input, cached)
		}
		return cached.value
	}

	reduceInputs(inputs: Set<I> | ((input: I) => boolean)) {
		for (const input of this.cache.keys()) {
			if (typeof inputs === 'function' ? !inputs(input) : !inputs.has(input)) {
				const entry = this.cache.get(input)!
				entry.cleanup()
				this.cache.delete(input)
			}
		}
	}
}

function computedMapMemo<I, O>(inputs: I[], compute: (input: I) => O): O[] {
	const memo = new Memoized(compute)
	function reduceKeys() {
		memo.reduceInputs(new Set(inputs))
	}
	return computedMap(
		inputs,
		(input) => {
			addBatchCleanup(reduceKeys)
			return memo.get(input)
		},
		() => addBatchCleanup(reduceKeys)
	)
}
