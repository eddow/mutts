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
 * When used in a computed property computation, it will register the callback to be called when the computed property is invalidated
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
	withEffect(undefined, () => {
		const stop = effect(
			markWithRoot((dep) => {
				const oldCI = computedInvalidations
				if (computedCache.has(key)) {
					// This should *not* be called in the cleanup chain, as its effects would be lost and cleaned-up
					for (const cb of invalidations) cb()
					invalidations = []
					computedCache.delete(key)
					touched1(computedCache, { type: 'set', prop: key }, key)
					stop()
				} else
					try {
						computedInvalidations = invalidations
						computedCache.set(key, getter(dep))
					} finally {
						computedInvalidations = oldCI
					}
			}, getter)
		)
	})
	return computedCache.get(key)
}

/**
 * Get the cached value of a computed function - cache is invalidated when the dependencies change
 */
export const computed = decorator({
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
})

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
