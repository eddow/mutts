import { decorator, type GenericClassDecorator } from '../decorator'
import { deepWatch } from './deep-watch'
import { effect } from './effects'
import { isNonReactive, nonReactiveClass, nonReactiveObjects } from './non-reactive-state'
import { unwrap } from './proxy-state'
import { markWithRoot } from './registry'
import { dependant } from './tracking'
import {
	type EffectAccess,
	type EffectCleanup,
	nonReactiveMark,
	stopped,
	unreactiveProperties,
} from './types'

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
	value: (dep: EffectAccess) => T,
	changed: (value: T, oldValue?: T) => void,
	options?: Omit<WatchOptions, 'deep'> & { deep?: false }
): EffectCleanup
/**
 * Watches a reactive value with deep watching enabled
 * @param value - Function that returns the value to watch
 * @param changed - Callback to call when the value changes
 * @param options - Watch options with deep watching enabled
 * @returns Cleanup function to stop watching
 */
export function watch<T extends object | any[]>(
	value: (dep: EffectAccess) => T,
	changed: (value: T, oldValue?: T) => void,
	options?: Omit<WatchOptions, 'deep'> & { deep: true }
): EffectCleanup
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
): EffectCleanup

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
): EffectCleanup {
	if (deep) return deepWatch(value, changed, { immediate })!
	return effect(function watchObjectEffect() {
		dependant(value)
		if (immediate) changed(value)
		immediate = true
	})
}

function watchCallBack<T>(
	value: (dep: EffectAccess) => T,
	changed: (value: T, oldValue?: T) => void,
	{ immediate = false, deep = false } = {}
): EffectCleanup {
	let oldValue: T | typeof unsetYet = unsetYet
	let deepCleanup: EffectCleanup | undefined
	const cbCleanup = effect(
		markWithRoot(function watchCallBackEffect(access) {
			const newValue = value(access)
			if (oldValue !== newValue)
				if (oldValue === unsetYet) {
					if (immediate) changed(newValue)
				} else changed(newValue, oldValue)
			oldValue = newValue
			if (deep) {
				if (deepCleanup) deepCleanup()
				deepCleanup = deepWatch(newValue as object, (value) => changed(value as T, value as T))
			}
		}, value)
	)
	return Object.defineProperties(
		() => {
			cbCleanup()
			if (deepCleanup) deepCleanup()
		},
		{
			[stopped]: { get: () => cbCleanup[stopped] },
		}
	) as EffectCleanup
}

//#endregion

//#region when

/**
 * Returns a promise that resolves when the predicate returns a truthy value.
 * The predicate is evaluated reactively — it re-runs whenever its dependencies change.
 * @param predicate - Reactive function that returns a value; resolves when truthy
 * @param timeout - Optional timeout in milliseconds — rejects if condition is not met within this duration
 * @returns Promise that resolves with the first truthy return value
 */
export function when<T>(predicate: (dep: EffectAccess) => T, timeout?: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let timer: ReturnType<typeof setTimeout> | undefined
		const stop = effect(function whenEffect(access) {
			try {
				const value = predicate(access)
				if (value) {
					if (timer !== undefined) clearTimeout(timer)
					timer = undefined
					queueMicrotask(() => stop())
					resolve(value)
				}
			} catch (error) {
				if (timer !== undefined) clearTimeout(timer)
				timer = undefined
				reject(error)
			}
		})
		if (timeout !== undefined) {
			timer = setTimeout(() => {
				stop()
				timer = undefined
				reject(new Error(`when: timed out after ${timeout}ms`))
			}, timeout)
		}
	})
}

//#endregion

//#region nonReactive

/**
 * Mark an object as non-reactive. This object and all its properties will never be made reactive.
 * @param obj - The object to mark as non-reactive
 */
function shallowNonReactive<T>(obj: T): T {
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
		? shallowNonReactive(arg1)
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
