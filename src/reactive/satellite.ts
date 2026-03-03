import { decorator, type GenericClassDecorator } from '../decorator'
import { flavored, flavorOptions } from '../flavored'
import type { FunctionWrapper } from '../zone'
import { deepWatch } from './deep-watch'
import { effectAggregator, effectHistory, getActiveEffect, link } from './effect-context'
import { effect, root, untracked } from './effects'
import { addUnreactiveProps, isNonReactive } from './non-reactive'
import { reactive } from './proxy'
import { markWithRoot } from './registry'
import { dependant } from './tracking'
import {
	type EffectAccess,
	type EffectCleanup,
	type ScopedCallback,
	unreactiveProperties,
	unwrap,
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
 */
export interface Watch {
	<T>(
		value: (dep: EffectAccess) => T,
		changed: (value: T, oldValue?: T) => void,
		options?: Omit<WatchOptions, 'deep'> & { deep?: false }
	): EffectCleanup
	/**
	 * Watches a reactive value with deep watching enabled
	 */
	<T extends object | any[]>(
		value: (dep: EffectAccess) => T,
		changed: (value: T, oldValue?: T) => void,
		options?: Omit<WatchOptions, 'deep'> & { deep: true }
	): EffectCleanup
	/**
	 * Watches a reactive object directly
	 */
	<T extends object | any[]>(
		value: T,
		changed: (value: T) => void,
		options?: WatchOptions
	): EffectCleanup

	/** Deep watch flavor */
	get deep(): Watch
	/** Immediate watch flavor */
	get immediate(): Watch
}

export const watch = flavored(
	function watch(
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
	},
	{
		get deep() {
			return flavorOptions(this, { deep: true })
		},
		get immediate() {
			return flavorOptions(this, { immediate: true })
		},
	}
) as Watch

function watchObject(
	value: object,
	changed: (value: object) => void,
	{ immediate = false, deep = false } = {}
): EffectCleanup {
	if (deep) return deepWatch(value, changed, { immediate })!
	return effect.named('watch:object')(() => {
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
	const cbCleanup = effect.named('watch:callback')(
		markWithRoot((access) => {
			const newValue = value(access)
			if (oldValue !== newValue) {
				const old = oldValue
				if (old === unsetYet) {
					if (immediate) untracked(() => changed(newValue))
				} else untracked(() => changed(newValue, old as T))
			}
			oldValue = newValue
			if (deep) {
				if (deepCleanup) deepCleanup()
				deepCleanup = deepWatch(newValue as object, (value) => changed(value as T, value as T))
			}
		}, value)
	)
	return (() => {
		cbCleanup()
		if (deepCleanup) deepCleanup()
	}) as EffectCleanup
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
		const stop = effect.named('watch:when')((access) => {
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
	;(obj as any)[unreactiveProperties] = true
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
				const parentMarker = (original.prototype as any)[unreactiveProperties]
				// If parent is fully unreactive, child is too
				if (parentMarker === true) {
					;(original.prototype as any)[unreactiveProperties] = true
				} else {
					const set = new Set<PropertyKey>(parentMarker || [])
					// Add all arguments (including the first one)
					set.add(arg1)
					for (const arg of args) set.add(arg)
					addUnreactiveProps(original.prototype, set)
				}
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
		;(original.prototype as any)[unreactiveProperties] = true
	},
	default: unreactiveApplication,
})

//#endregion

//#region resource

export function lazyInit<T extends object>(resource: T, load: ScopedCallback) {/* TODO: architecture - when ?
	let ascender: FunctionWrapper
	effect(({ ascend }) => {
		ascender = ascend
	})*/
	let fresh = true
	let anchor: any
	return new Proxy(resource, {
		[Symbol.toStringTag]: 'LazyInit',
		get(target, prop) {
			if (fresh) {
				//ascender(load)
				anchor = root(load)
				fresh = false
			}
			return target[prop]
		},
	} as ProxyHandler<T>)
}

export interface Resource<T> {
	value: T | undefined
	loading: boolean
	error: any
	latest: T | undefined
	reload(): void
	promise: Promise<void>
}

/**
 * Creates a reactive resource that automatically tracks async state.
 * @param fetcher - Async function that returns the value. Reactive dependencies are tracked.
 * @param options - Resource options (initialValue)
 * @returns Reactive Resource object with value, loading, error, latest properties
 */
export function resource<T>(
	fetcher: (access: EffectAccess) => Promise<T> | T,
	options: { initialValue?: T } = {}
): Resource<T> {
	const resource: Partial<Resource<T>> = reactive({
		value: options.initialValue,
		loading: true,
		error: undefined as any,
		latest: options.initialValue,
		reload() {
			reloadSignal.value++
		},
	})

	const reloadSignal = reactive({ value: 0 })
	let counter = 0

	return lazyInit(resource as Resource<T>, () => {
		link(
			resource,
			effect.named('watch:resource')((access) => {
				// Track reload signal to enable manual reloading
				void reloadSignal.value

				const id = ++counter
				resource.loading = true
				resource.error = undefined

				try {
					const result = fetcher(access)

					if (result instanceof Promise) {
						resource.promise = result.then(() => {})
						result.then(
							(val) => {
								if (id === counter) {
									resource.value = val
									resource.latest = val
									resource.loading = false
								}
							},
							(err) => {
								if (id === counter) {
									resource.error = err
									resource.loading = false
								}
							}
						)
					} else {
						resource.promise = Promise.resolve()
						resource.value = result
						resource.latest = result
						resource.loading = false
					}
				} catch (err) {
					resource.promise = Promise.reject(err)
					resource.error = err
					resource.loading = false
				}
			})
		)
	})
}

//#endregion
