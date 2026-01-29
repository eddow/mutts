import { decorator, type GenericClassDecorator } from '../decorator'
import { deepWatch } from './deep-watch'
import { withEffect } from './effect-context'
import { effect, getActiveEffect, untracked } from './effects'
import { isNonReactive, nonReactiveClass, nonReactiveObjects } from './non-reactive-state'
import { unwrap } from './proxy-state'
import { markWithRoot } from './registry'
import { dependant } from './tracking'
import {
	type DependencyAccess,
	nonReactiveMark,
	type ScopedCallback,
	unreactiveProperties,
} from './types'

/**
 * Symbol for accessing the cleanup function on cleaned objects
 */
export const cleanup = Symbol('cleanup')

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
 * Watches a reactive value and calls a callback when it changes
 * @param value - Function that returns the value to watch
 * @param changed - Callback to call when the value changes
 * @param options - Watch options
 * @returns Cleanup function to stop watching
 */
export function watch<T>(
	value: (dep: DependencyAccess) => T,
	changed: (value: T, oldValue?: T) => void,
	options?: Omit<WatchOptions, 'deep'> & { deep?: false }
): ScopedCallback
/**
 * Watches a reactive value with deep watching enabled
 * @param value - Function that returns the value to watch
 * @param changed - Callback to call when the value changes
 * @param options - Watch options with deep watching enabled
 * @returns Cleanup function to stop watching
 */
export function watch<T extends object | any[]>(
	value: (dep: DependencyAccess) => T,
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
	value: any, //object | ((dep: DependencyAccess) => object),
	changed: (value?: object, oldValue?: object) => void,
	options: any = {}
) {
	return typeof value === 'function'
		? watchCallBack(value, changed, options)
		: typeof value === 'object' && value !== null
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
	const myParentEffect = getActiveEffect()
	if (deep) return deepWatch(value, changed, { immediate })!
	return effect(function watchObjectEffect() {
		dependant(value)
		if (immediate) withEffect(myParentEffect, () => changed(value))
		immediate = true
	})
}

function watchCallBack<T>(
	value: (dep: DependencyAccess) => T,
	changed: (value: T, oldValue?: T) => void,
	{ immediate = false, deep = false } = {}
): ScopedCallback {
	const myParentEffect = getActiveEffect()
	let oldValue: T | typeof unsetYet = unsetYet
	let deepCleanup: ScopedCallback | undefined
	const cbCleanup = effect(
		markWithRoot(function watchCallBackEffect(access) {
			const newValue = value(access)
			if (oldValue !== newValue)
				withEffect(myParentEffect, () => {
					if (oldValue === unsetYet) {
						if (immediate) changed(newValue)
					} else changed(newValue, oldValue)
					oldValue = newValue
					if (deep) {
						if (deepCleanup) deepCleanup()
						deepCleanup = deepWatch(newValue as object, (value) => changed(value as T, value as T))
					}
				})
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
	// Finally, not deep
	//for (const key in obj) deepNonReactive(obj[key])
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

export function cleanedBy<T extends object>(obj: T, cleanupFn: ScopedCallback) {
	return Object.defineProperty(obj, cleanup, {
		value: cleanupFn,
		writable: false,
		enumerable: false,
		configurable: true,
	}) as T & { [cleanup]: ScopedCallback }
}

//#region greedy caching

/**
 * Creates a derived value that automatically recomputes when dependencies change
 * @param compute - Function that computes the derived value
 * @returns Object with value and cleanup function
 */
export function derived<T>(compute: (dep: DependencyAccess) => T): {
	value: T
	[cleanup]: ScopedCallback
} {
	const rv = { value: undefined as unknown as T }
	return cleanedBy(
		rv,
		untracked(() =>
			effect(function derivedEffect(access) {
				rv.value = compute(access)
			})
		)
	)
}
