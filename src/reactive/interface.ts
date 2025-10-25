import { decorator, GenericClassDecorator } from '../decorator'
import { renamed } from '../utils'
import {
	type DependencyFunction,
	deepWatch,
	dependant,
	effect,
	getRoot,
	isNonReactive,
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
		default<T>(getter: ComputedFunction<T>): T {
			return computedFunction(getter)
		},
	}),
	{
		values: computedMapValues,
		//filter: computedFilter,
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

function cleanedBy<T extends object>(obj: T, cleanup: ScopedCallback) {
	Object.defineProperty(obj, 'cleanup', {
		value: cleanup,
		writable: false,
		enumerable: false,
		configurable: true,
	})
	return obj as T & { cleanup: () => void }
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
		effect(
			markWithRoot((dep) => {
				rv.value = compute(dep)
			}, compute)
		)
	)
}

export const usualKeys = new Set<PropertyKey>(['key'])

export type ComputedMapInput<T> = {
	value: T
	readonly index: number
	readonly array: T[]
}

function computedMapValues<T, U>(
	inputs: T[],
	compute: (input: ComputedMapInput<T>, oldValue?: U) => U
): U[] & { cleanup: () => void } {
	const result = reactive([])
	function input(index: number) {
		const input = Object.defineProperties(
			{},
			{
				value: {
					get() {
						return inputs[index]
					},
					set(value) {
						inputs[index] = value
					},
				},
				index: {
					value: index,
				},
				array: {
					value: inputs,
				},
			}
		) as ComputedMapInput<T>
		return effect(() => {
			result[index] = compute(input, result[index])
		})
	}
	const cleanups: ScopedCallback[] = []
	const cleanup = watch(
		() => inputs.length,
		(length) => {
			if (length <= result.length) {
				const toCleanup = cleanups.splice(length)
				for (const cleanup of toCleanup) cleanup()
				result.length = length
			} else for (let i = result.length; i < length; i++) cleanups.push(input(i))
		},
		{ immediate: true }
	)
	return cleanedBy(result, () => {
		cleanup()
		for (const cleanup of cleanups) cleanup()
	})
}
/*

const generatedObjectKeys = new WeakMap<object, symbol>()
function computedMap<T, U>(
	input: T[],
	compute: (input: T, oldValue?: U) => U,
	key?: (input: T, index: number) => string | number | symbol
): U[] & { cleanup: () => void } {
	key ??= (input: T, index: number) => {
		if (!input || (typeof input !== 'object' && typeof input !== 'function')) return index
		for (const key of usualKeys) if (key in input) return String(input[key])
		if (generatedObjectKeys.has(input)) return generatedObjectKeys.get(input)!
		const key = Symbol(`generated-key:${String(input)}`)
		generatedObjectKeys.set(input, key)
		return key
	}
	type CacheEntry = { value: U; item: T; cleanup: ScopedCallback }
	const cache = new Map<PropertyKey, CacheEntry>()
	const result = reactive([])
	return cleanedBy(
		result,
		effect(() => {
			const keys = input.map(key)
			const keySet = new Set<PropertyKey>(keys)
			for (const [k, v] of cache.entries())
				if (!keySet.has(k)) {
					v.cleanup()
					cache.delete(k)
				}
			result.length = 0
			const cleanups: ScopedCallback[] = []
			for (const [i, k] of keys.entries())
				((k, i) => {
					const item = input[i]
					let c: CacheEntry
					if (cache.has(k)) {
						c = cache.get(k)
						c.item = item
					} else {
						c = reactive({ item }) as CacheEntry
						cache.set(
							k,
							cleanedBy(
								c,
								effect(() => {
									c.value = compute(c.item)
								})
							)
						)
					}
					cleanups.push(
						effect(() => {
							result[i] = c.value
						})
					)
				})(k, i)
			return () => {
				while (cleanups.length) cleanups.pop()!()
			}
		})
	)
}

function computedFilter<Input>(input: Input[], predicate: (input: Input) => boolean): Input[] {
	const rv: Input[] = reactive([])
	const stop = effect(() => {
		const mapped = computedMap(input, (item) => Boolean(predicate(item)))
		const cleanup = watch(
			mapped,
			function computedFilterRedo(mapped) {
				rv.length = 0
				for (let i = 0; i < mapped.length; i++) if (mapped[i]) rv.push(input[i])
			},
			{ immediate: true }
		)
		return () => {
			mapped.cleanup()
			cleanup()
		}
	})
	return cleanedBy(rv, stop)
}
*/
//#endregion
