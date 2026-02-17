import { arrayDiff } from '../diff'
import { flavored } from '../flavored'
import { FoolProof, tag } from '../utils'
import { touched, touched1 } from './change'
import { cleanedBy } from './effect-context'
import { effect, untracked } from './effects'
import { memoize } from './memoize'
import { isReactive, proxyToObject, reactive } from './proxy'
import {
	type CleanupReason,
	type cleanup,
	type EffectAccess,
	type EffectCleanup,
	type EffectCloser,
	type ScopedCallback,
	keysOf,
} from './types'

/**
 * Reactively attends to each entry of a collection or each key yielded by an
 * enumeration callback. For each key, an inner effect runs the callback. When a
 * key disappears, its inner effect is disposed. The callback may return a cleanup
 * (like a regular effect closer).
 *
 * Accepts arrays, records, Maps, Sets, or a raw `() => Iterable<Key>` callback.
 *
 * @example
 * ```typescript
 * // Record shorthand
 * attend(record, (key) => { console.log(key, record[key]) })
 *
 * // Array shorthand
 * attend(array, (index) => { console.log(index, array[index]) })
 *
 * // Raw enumeration callback
 * attend(() => Object.keys(record), (key) => { ... })
 * ```
 */
export function attend<T>(
	source: readonly T[],
	callback: (index: number) => EffectCloser | void
): ScopedCallback
export function attend<K, V>(
	source: Map<K, V>,
	callback: (key: K) => EffectCloser | void
): ScopedCallback
export function attend<T>(
	source: Set<T>,
	callback: (value: T) => EffectCloser | void
): ScopedCallback
export function attend<S extends Record<PropertyKey, any>>(
	source: S,
	callback: (key: keyof S & string) => EffectCloser | void
): ScopedCallback
export function attend<Key>(
	enumerate: () => Iterable<Key>,
	callback: (key: Key) => EffectCloser | void
): ScopedCallback
export function attend(source: any, callback: (key: any) => EffectCloser | void): ScopedCallback {
	const enumerate: () => Iterable<any> =
		typeof source === 'function'
			? source
			: Array.isArray(source)
				? () => Array.from({ length: source.length }, (_, i) => i)
				: source instanceof Map
					? () => source.keys()
					: source instanceof Set
						? () => source.values()
						: () => Object.keys(source)

	const keyEffects = new Map<any, ScopedCallback>()

	const outer = effect(({ ascend }) => {
		const keys = new Set<any>()
		for (const key of enumerate()) keys.add(key)

		for (const key of keys) {
			if (keyEffects.has(key)) continue
			keyEffects.set(
				key,
				ascend(() => effect(() => callback(key)))
			)
		}

		for (const key of Array.from(keyEffects.keys())) {
			if (!keys.has(key)) {
				keyEffects.get(key)!()
				keyEffects.delete(key)
			}
		}
	})

	return (reason?: CleanupReason) => {
		outer(reason)
		for (const stop of keyEffects.values()) stop(reason)
		keyEffects.clear()
	}
}

/**
 * Result of a reactive scan, which is a reactive array of accumulated values
 * with an attached cleanup function.
 */
export type ScanResult<Output> = readonly Output[] & { [cleanup]: ScopedCallback }

/**
 * Perform a reactive scan over an array of items.
 *
 * This implementation is highly optimized for performance and fine-grained reactivity:
 * - **Incremental Updates**: Changes to an item only trigger re-computation from that
 *   point onwards in the result chain.
 * - **Move Optimization**: If items are moved within the array, their accumulated
 *   values are reused as long as their predecessor remains the same.
 * - **Duplicate Support**: Correctly handles multiple occurrences of the same object
 *   instance using an internal occurrence tracking mechanism.
 * - **Memory Efficient**: Uses `WeakMap` for caching intermediates, which are
 *   automatically cleared when source items are garbage collected.
 *
 * @example
 * ```typescript
 * const source = reactive([{ val: 1 }, { val: 2 }, { val: 3 }])
 * const sum = scan(source, (acc, item) => acc + item.val, 0)
 *
 * expect([...sum]).toEqual([1, 3, 6])
 *
 * // Modifying an item only re-computes subsequent sums
 * source[1].val = 10
 * expect([...sum]).toEqual([1, 11, 14])
 * ```
 *
 * @param source The source array of objects (will be made reactive)
 * @param callback The accumulator function called with (accumulator, currentItem)
 * @param initialValue The starting value for the accumulation
 * @returns A reactive array of accumulated values, with a [cleanup] property to stop the tracking
 */
export function scan<Input extends object, Output>(
	source: readonly Input[],
	callback: (acc: Output, val: Input) => Output,
	initialValue: Output
): ScanResult<Output> {
	const observedSource = reactive(source)
	const rawResult: Output[] = []
	const result = reactive(rawResult)

	// Track effects for each index to dispose them when the array shrinks
	const indexEffects = new Map<number, EffectCleanup>()
	// Mapping from index to its current intermediate object
	const indexToIntermediate = reactive([] as Intermediate[])
	const intermediaries = new WeakMap<Input, Intermediate[]>()

	class Intermediate {
		public prev: Intermediate | undefined
		constructor(
			public val: Input,
			prev: Intermediate | undefined
		) {
			this.prev = prev
		}

		@memoize
		get acc(): Output {
			const prevAcc = this.prev ? this.prev.acc : initialValue
			return callback(prevAcc, this.val)
		}
	}

	function disposeIndex(index: number) {
		const stop = indexEffects.get(index)
		if (stop) {
			stop()
			indexEffects.delete(index)
			Reflect.deleteProperty(indexToIntermediate, index)
			Reflect.deleteProperty(result, index)
		}
	}

	const mainEffect = effect(function scanMainEffect({ ascend }) {
		const length = observedSource.length
		const occurrenceCount = new Map<Input, number>()
		let prev: Intermediate | undefined

		for (let i = 0; i < length; i++)
			if (i in observedSource) {
				const val = observedSource[i]

				if (
					!(
						val &&
						(typeof val === 'object' || typeof val === 'function' || typeof val === 'symbol')
					)
				) {
					throw new Error('scan: items must be objects (WeakKey) for intermediate caching')
				}

				const count = occurrenceCount.get(val) ?? 0
				occurrenceCount.set(val, count + 1)

				let list = intermediaries.get(val)
				if (!list) {
					list = []
					intermediaries.set(val, list)
				}

				let intermediate = list[count]
				if (!intermediate) {
					intermediate = reactive(new Intermediate(val, prev))
					list[count] = intermediate
				} else {
					// Update the link.
					if (untracked(() => intermediate.prev) !== prev) {
						intermediate.prev = prev
					}
				}

				// Update the reactive mapping for this index
				if (indexToIntermediate[i] !== intermediate) {
					indexToIntermediate[i] = intermediate
				}

				// If we don't have an effect for this index yet, create one
				if (!indexEffects.has(i)) {
					ascend(() => {
						const index = i
						const stop = effect(function scanIndexSyncEffect() {
							const inter = indexToIntermediate[index]
							if (inter) {
								const accValue = inter.acc
								result[index] = accValue
							}
						})
						indexEffects.set(index, stop)
					})
				}

				prev = intermediate
			}

		// Cleanup trailing indices
		for (const index of Array.from(indexEffects.keys())) {
			if (index >= length) disposeIndex(index)
		}

		// Ensure result length matches source length
		if (rawResult.length !== length) {
			FoolProof.set(result, 'length', length, result)
		}
	})

	return cleanedBy(result, ((reason?: CleanupReason) => {
		mainEffect(reason)
		for (const stop of indexEffects.values()) stop(reason)
		indexEffects.clear()
	}) as EffectCleanup) as ScanResult<Output>
}

/**
 * Lifts a callback that returns an array into a reactive array that automatically
 * synchronizes with the source array returned by the callback.
 *
 * The returned reactive array will update whenever the callback's dependencies change,
 * efficiently syncing only the elements that differ from the previous result.
 *
 * @example
 * ```typescript
 * const items = reactive([1, 2, 3])
 * const doubled = lift(() => items.map(x => x * 2))
 *
 * console.log([...doubled]) // [2, 4, 6]
 *
 * items.push(4)
 * console.log([...doubled]) // [2, 4, 6, 8]
 * ```
 *
 * @param cb Callback function that returns an array
 * @returns A reactive array synchronized with the callback's result, with a [cleanup] property to stop tracking
 */
export function lift<Output extends any[]>(
	cb: (access: EffectAccess) => Output
): Output & { [cleanup]: ScopedCallback }

/**
 * Lifts a callback that returns an object into a reactive object that automatically
 * synchronizes with the source object returned by the callback.
 *
 * The returned reactive object will update whenever the callback's dependencies change,
 * efficiently syncing only the properties that differ from the previous result using
 * Object.assign(). Properties that no longer exist in the source are automatically removed.
 *
 * @example
 * ```typescript
 * const user = reactive({ name: 'John', age: 30 })
 * const profile = lift(() => ({
 *   displayName: user.name.toUpperCase(),
 *   isAdult: user.age >= 18,
 *   description: `${user.name} is ${user.age} years old`
 * }))
 *
 * console.log(profile.displayName) // JOHN
 * console.log(profile.isAdult) // true
 *
 * user.name = 'Jane'
 * console.log(profile.displayName) // JANE
 * console.log(profile.description) // Jane is 30 years old
 * ```
 *
 * @param cb Callback function that returns an object
 * @returns A reactive object synchronized with the callback's result, with a [cleanup] property to stop tracking
 */
export function lift<Output extends object>(
	cb: (access: EffectAccess) => Output
): Output & { [cleanup]: ScopedCallback }
export function lift<Output extends any[] | object>(
	cb: (access: EffectAccess) => Output
): Output & { [cleanup]: ScopedCallback } {
	let result!: Output
	let rawResult!: Output
	const liftCleanup = effect.named('lift')((access) => {
		const source = cb(access) /*
		if (isReactive(source))
			throw new Error('lift callback must return a non-reactive value to be lifted')*/
		if (!source || typeof source !== 'object')
			throw new Error('lift callback must return an array or object')
		const sourceProto = Object.getPrototypeOf(source)
		if (!result) {
			rawResult = Array.isArray(source) ? [] : Object.create(sourceProto)
			result = reactive(rawResult)
		}
		if (sourceProto !== Object.getPrototypeOf(result))
			throw new Error('lift callback must return the same type as the previous result')

		if (Array.isArray(source)) {
			const res = result as unknown[]
			const patches = arrayDiff(res, source)
			for (let i = patches.length - 1; i >= 0; i--) {
				const { indexA, sliceA, sliceB } = patches[i]
				res.splice(indexA, sliceA.length, ...sliceB)
			}
		} else {
			for (const key of Object.keys(source)) {
				const had = key in rawResult
				const newDesc = Object.getOwnPropertyDescriptor(source, key)!
				if (had) {
					const oldDesc = Object.getOwnPropertyDescriptor(rawResult, key)
					const sameAccessor = oldDesc && newDesc.get && oldDesc.get === newDesc.get
					Object.defineProperty(rawResult, key, newDesc)
					if (
						!sameAccessor &&
						rawResult[key] !== (oldDesc ? (oldDesc.get ? oldDesc.get() : oldDesc.value) : undefined)
					)
						touched1(rawResult, { type: 'set', prop: key }, key)
				} else {
					Object.defineProperty(rawResult, key, newDesc)
					touched1(rawResult, { type: 'add', prop: key }, key)
				}
			}
			for (const key of Object.keys(rawResult))
				if (!(key in source)) {
					delete rawResult[key]
					touched1(rawResult, { type: 'del', prop: key }, key)
				}
		}
	})
	return cleanedBy(result, liftCleanup)
}

export const morph = flavored(
	function morph<I, O>(
		source: readonly I[] | (() => readonly I[]),
		fn: (arg: I) => O,
		options?: { pure?: boolean }
	) {
		if (typeof source !== 'function' && !isReactive(source) && options?.pure) return source.map(fn)
		const cache = [] as O[]
		let input: readonly I[] = []
		function* range(
			a: number,
			b: number,
		): IterableIterator<number> {
			const start = Math.min(a, b)
			const end = Math.max(a, b)
			for (let i = start; i < end; i++)yield i
		}
		const rv = reactive(
				cache,
				{
					get(cache, prop) {
						const n = typeof prop === 'string' ? Number(prop) : NaN
						if (isNaN(n)) return cache[prop]
						if (!(n in cache)) {
							if (options?.pure) cache[n] = fn(input[n])
							else {
								const stop = effect(() => {
									cache[n] = fn(input[n])
									return () => {
										delete cache[n]
										touched1(cache, { type: 'invalidate', prop: 'morph' }, n)
										stop({ type: 'stopped' })
									}
								})
							}
						}
						return cache[n]
					},
					has(cache, prop) {
						return Reflect.has(input, prop)
					}
				}
			)
		return cleanedBy(rv, effect.named('morph')(() => {
			const newInput = [...(typeof source === 'function' ? source() : source)]
			const evolution = { type: 'bunch', method: 'morph-input' } as const
			let madeAll = false
			for (const diff of arrayDiff(input, newInput)) {
				cache.splice(diff.indexA, diff.sliceA.length, ...new Array(diff.sliceB.length).fill(undefined))
				if(!madeAll) {
					if(diff.sliceA.length === diff.sliceB.length)
						touched(cache, evolution, range(diff.indexA, diff.indexA + diff.sliceA.length))
					else {
						touched(cache, evolution, range(diff.indexA, newInput.length))
						madeAll = true
					}
				}
				for(const i of range(diff.indexA, diff.indexA + diff.sliceB.length))
					delete cache[i]
			}
			if (input.length !== newInput.length) touched(cache, evolution, ['length', keysOf])
			input = newInput
		}))
	},
	{
		get pure() {
			return <I, O>(source: readonly I[] | (() => readonly I[]), fn: (arg: I) => O) =>
				this(source, fn, { pure: true })
		},
	}
)
