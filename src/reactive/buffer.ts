import { arrayDiff } from '../diff'
import { flavored } from '../flavored'
import { FoolProof } from '../utils'
import type { FunctionWrapper } from '../zone'
import { touched, touched1 } from './change'
import { cleanedBy } from './effect-context'
import { effect, untracked } from './effects'
import { memoize } from './memoize'
import { reactive } from './proxy'
import { markWithRoot } from './registry'
import {
	type CleanupReason,
	cleanup,
	type EffectAccess,
	type EffectCleanup,
	type EffectCloser,
	isReactive,
	keysOf,
	type ScopedCallback,
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
	const liftCleanup = effect.named('lift')(
		markWithRoot((access) => {
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
							rawResult[key] !==
								(oldDesc ? (oldDesc.get ? oldDesc.get() : oldDesc.value) : undefined)
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
		}, cb)
	)
	return cleanedBy(result, liftCleanup)
}
function* flat<T>(...subs: Iterable<T>[]) {
	for (const sub of subs) for (const i of sub) yield i
}
/**
 * Options for `morph` and its variants.
 *
 * @property pure - When `true`, the mapping function is assumed pure (no reactive reads inside `fn`).
 *   Per-item effects are skipped and items are computed eagerly. When a predicate `(i) => boolean`,
 *   purity is evaluated per item — pure items skip the effect wrapper, non-pure items get their own.
 */
export type MorphOptions<I> = { pure?: boolean | ((i: I) => boolean) }

/**
 * Reactively maps an array source through `fn`, producing a lazy reactive output array.
 *
 * Each source item gets its own isolated effect (via `root()`) so that changes to one item
 * only recompute that item's projection. Structural changes (push, splice, reorder) are detected
 * via `arrayDiff` and surgically applied to the output cache.
 *
 * The source can be a reactive array or a function returning an array. When a function is provided,
 * the function is re-evaluated inside an effect whenever its dependencies change.
 *
 * Output elements are computed lazily — accessing `result[i]` triggers computation if not yet cached.
 *
 * @param source - A reactive array or a function returning an array
 * @param fn - Mapping function applied to each element
 * @param options - Optional purity hints to skip per-item effects
 * @returns A readonly reactive array with a `[cleanup]` method to dispose all effects
 */
export function morphArray<I, O>(
	source: readonly I[] | (() => readonly I[]),
	fn: (arg: I) => O,
	options?: MorphOptions<I>
): readonly O[] & { [cleanup]: ScopedCallback } {
	if (typeof source !== 'function' && !isReactive(source) && options?.pure === true) {
		return source.map(fn) as any
	}

	let track!: FunctionWrapper
	const itemEffects = new Map<any, { stop: ScopedCallback; index: { value: number } }>()
	const cache = [] as O[]
	let input: readonly I[] = []

	function stopItem(key: any) {
		const entry = itemEffects.get(key)
		if (entry) {
			entry.stop({ type: 'stopped' })
			itemEffects.delete(key)
		}
	}

	function computeItem(key: number, input: I) {
		const isPure =
			options?.pure === true || (typeof options?.pure === 'function' && options.pure(input))
		if (isPure) {
			track(() => {
				cache[key] = fn(input)
			})
		} else {
			const indexRef = { value: key }
			let stop!: ScopedCallback
			track(() => {
				stop = effect(() => {
					cache[indexRef.value] = fn(input)
					return (reason) => {
						delete cache[indexRef.value]
						touched1(cache, { type: 'invalidate', prop: 'morph' }, String(key))
						stop({ type: 'invalidate', cause: reason })
					}
				})
			})
			itemEffects.set(key, { stop, index: indexRef })
		}
	}

	const proxy = reactive(cache, {
		get(cache, prop) {
			const n = typeof prop === 'string' ? Number(prop) : NaN
			if (isNaN(n)) return cache[prop]
			if (!(n in cache)) computeItem(n, input[n])
			return cache[n]
		},
		has(_cache, prop) {
			return Reflect.has(input, prop)
		},
	})

	const stopMain = effect.named('morph:array')(({ ascend }) => {
		track = ascend
		const newInput = [...(typeof source === 'function' ? source() : source)]
		const diffs = arrayDiff(input, newInput).toSorted((a, b) => b.indexA - a.indexA)

		if (diffs.length > 0) {
			for (const diff of diffs) {
				// Stop items in removed range
				for (let i = diff.indexA; i < diff.indexA + diff.sliceA.length; i++) stopItem(i)

				// Shift existing itemEffects in the Map to match the new indices
				const shift = diff.sliceB.length - diff.sliceA.length
				if (shift !== 0) {
					// We need to move entries in the Map.
					const entries = Array.from(itemEffects.entries()).sort((a, b) => a[0] - b[0])
					// Remove entries that will be shifted
					for (const [idx, entry] of entries) {
						if (idx >= diff.indexA + diff.sliceA.length) {
							itemEffects.delete(idx)
						}
					}
					// Re-add them with shifted indices
					for (const [idx, entry] of entries) {
						if (idx >= diff.indexA + diff.sliceA.length) {
							const newIdx = idx + shift
							entry.index.value = newIdx
							itemEffects.set(newIdx, entry)
						}
					}
				}

				// Splice the cache
				cache.splice(
					diff.indexA,
					diff.sliceA.length,
					...new Array(diff.sliceB.length).fill(undefined)
				)

				// Make holes for lazy computation
				for (let i = diff.indexA; i < diff.indexA + diff.sliceB.length; i++) delete cache[i]
			}

			const invalidates = new Set<PropertyKey>([keysOf])
			if (input.length !== newInput.length) invalidates.add('length')
			for (const diff of diffs) {
				const max = Math.max(diff.sliceA.length, diff.sliceB.length)
				for (let i = 0; i < max; i++) invalidates.add(String(diff.indexA + i))
			}
			touched(cache, { type: 'bunch', method: 'morph-input' }, invalidates)
		}

		input = newInput
	})

	return cleanedBy(proxy, (reason) => {
		stopMain(reason)
		for (const entry of itemEffects.values()) entry.stop(reason)
		itemEffects.clear()
	})
}

/**
 * Reactively maps a `Map` source through `fn`, producing a reactive output Map.
 *
 * Each key gets its own isolated effect so that value changes for one key only recompute
 * that key's projection. Key additions and removals are tracked via `keysOf` dependency.
 *
 * @param source - A reactive Map
 * @param fn - Mapping function applied to each value
 * @param options - Optional purity hints to skip per-key effects
 * @returns A reactive Map with a `[cleanup]` method to dispose all effects
 */
export function morphMap<K, V, O>(
	source: Map<K, V>,
	fn: (arg: V) => O,
	options?: MorphOptions<V>
): Map<K, O> & { [cleanup]: ScopedCallback } {
	if (!isReactive(source) && options?.pure === true) {
		const res = new Map<K, O>()
		for (const [k, v] of source) res.set(k, fn(v))
		return res as any
	}

	let track!: FunctionWrapper
	const itemEffects = new Map<any, ScopedCallback>()
	const cache = new Map<K, O>()
	Object.defineProperty(cache, 'constructor', { value: Object, enumerable: false })
	let input = new Map<K, V>()

	function stopItem(key: any) {
		const stop = itemEffects.get(key)
		if (stop) {
			stop({ type: 'stopped' })
			itemEffects.delete(key)
		}
	}

	function computeItem(key: any, input: any) {
		const isPure =
			options?.pure === true || (typeof options?.pure === 'function' && options.pure(input))
		if (isPure) {
			cache.set(
				key,
				track(() => fn(input))
			)
		} else {
			const stop = track(() =>
				effect(() => {
					cache.set(key, fn(input))
					return (reason) => {
						cache.delete(key)
						touched1(cache, { type: 'invalidate', prop: 'morph' }, String(key))
						stop({ type: 'invalidate', cause: reason })
					}
				})
			)
			itemEffects.set(key, stop)
		}
	}

	const proxy = reactive(cache, {
		get(cache, prop) {
			if (prop === 'get')
				return (key: any) => {
					if (!cache.has(key) && source.has(key)) computeItem(key, source.get(key))
					return cache.get(key)
				}
			if (prop === 'has')
				return (key: any) => {
					return source.has(key)
				}
			if (prop === 'keys')
				return () => {
					return source.keys()
				}
			if (prop === 'values')
				return function* () {
					for (const key of source.keys()) {
						yield proxy.get(key)
					}
				}
			if (prop === 'entries')
				return function* () {
					for (const key of source.keys()) {
						yield [key, proxy.get(key)]
					}
				}
			if (prop === Symbol.iterator)
				return function* () {
					for (const key of source.keys()) {
						yield [key, proxy.get(key)]
					}
				}
			return (cache as any)[prop]
		},
	}) as any

	const stopMain = effect.named('morph:map')(({ ascend }) => {
		track = ascend
		const newInput = new Map(source)
		const keys = new Set(newInput.keys())
		for (const key of itemEffects.keys()) {
			if (!keys.has(key)) stopItem(key)
			else if (cache.has(key) && newInput.get(key) !== input.get(key)) {
				stopItem(key)
			}
		}
		touched(cache, { type: 'bunch', method: 'morph-input' }, [keysOf])
		input = newInput
	})

	return cleanedBy(proxy, (reason) => {
		stopMain(reason)
		for (const stop of itemEffects.values()) stop(reason)
		itemEffects.clear()
	})
}

/**
 * Reactively maps a record/object source through `fn`, producing a reactive output record.
 *
 * Each key gets its own isolated effect so that value changes for one key only recompute
 * that key's projection. Key additions and removals are tracked automatically.
 *
 * @param source - A reactive record
 * @param fn - Mapping function applied to each value
 * @param options - Optional purity hints to skip per-key effects
 * @returns A reactive record with a `[cleanup]` method to dispose all effects
 */
export function morphRecord<S extends Record<PropertyKey, any>, O>(
	source: S,
	fn: (arg: S[keyof S]) => O,
	options?: MorphOptions<S[keyof S]>
): { [K in keyof S]: O } & { [cleanup]: ScopedCallback } {
	if (!isReactive(source) && options?.pure === true) {
		const res = {} as any
		for (const k of Object.keys(source)) res[k] = fn(source[k])
		return res
	}

	let track!: FunctionWrapper
	const itemEffects = new Map<any, ScopedCallback>()
	const cache = {} as any
	let input = {} as any

	function stopItem(key: any) {
		const stop = itemEffects.get(key)
		if (stop) {
			stop({ type: 'stopped' })
			itemEffects.delete(key)
		}
	}

	function computeItem(key: any, input: any) {
		const isPure =
			options?.pure === true || (typeof options?.pure === 'function' && options.pure(input))
		if (isPure) {
			cache[key] = track(() => fn(input))
		} else {
			const stop = track(() =>
				effect(() => {
					cache[key] = fn(input)
					return (reason) => {
						delete cache[key]
						touched1(cache, { type: 'invalidate', prop: 'morph' }, String(key))
						stop({ type: 'invalidate', cause: reason })
					}
				})
			)
			itemEffects.set(key, stop)
		}
	}

	const proxy = reactive(cache, {
		get(cache, prop) {
			if (!(prop in cache) && prop in source) computeItem(prop, source[prop])
			return cache[prop]
		},
		has(_cache, prop) {
			return prop in source
		},
	})

	const stopMain = effect.named('morph:record')(({ ascend }) => {
		track = ascend
		const newInput = { ...source }
		const keys = new Set<any>(Object.keys(newInput))
		for (const key of itemEffects.keys()) {
			if (!keys.has(key)) stopItem(key)
			else if (key in cache && newInput[key] !== input[key]) {
				stopItem(key)
			}
		}
		touched(cache, { type: 'bunch', method: 'morph-input' }, [keysOf])
		input = newInput
	})

	return cleanedBy(proxy, (reason) => {
		stopMain(reason)
		for (const stop of itemEffects.values()) stop(reason)
		itemEffects.clear()
	})
}

/**
 * Unified reactive collection mapper. Dispatches to `morphArray`, `morphMap`, or `morphRecord`
 * based on the source type. Access `morph.pure(source, fn)` for the `{ pure: true }` shorthand.
 *
 * @see morphArray
 * @see morphMap
 * @see morphRecord
 */
export type Morph = {
	<I, O>(
		source: readonly I[] | (() => readonly I[]),
		fn: (arg: I) => O,
		options?: MorphOptions<I>
	): readonly O[] & { [cleanup]: ScopedCallback }

	<K, V, O>(
		source: Map<K, V>,
		fn: (arg: V) => O,
		options?: MorphOptions<V>
	): Map<K, O> & { [cleanup]: ScopedCallback }

	<S extends Record<PropertyKey, any>, O>(
		source: S,
		fn: (arg: S[keyof S]) => O,
		options?: MorphOptions<S[keyof S]>
	): { [K in keyof S]: O } & { [cleanup]: ScopedCallback }

	pure: Morph
}

/**
 * Reactively maps a collection (array, Map, or record) through a per-entry function.
 *
 * Each entry in the source gets its own reactive context — when only one entry's dependencies
 * change, only that entry's projection recomputes. Structural changes (additions, removals,
 * reorders) are detected via diffing and applied surgically.
 *
 * Use `morph.pure(source, fn)` when `fn` has no reactive reads (skips per-item effects).
 *
 * @example
 * ```ts
 * const users = reactive([{ name: 'John' }, { name: 'Jane' }])
 * const names = morph(users, u => u.name.toUpperCase())
 * // names[0] = 'JOHN', names[1] = 'JANE'
 * // Changing users[0].name only recomputes names[0]
 * ```
 */
export const morph = flavored(
	function morph(source: any, fn: any, options?: any): any {
		if (Array.isArray(source) || typeof source === 'function')
			return morphArray(source, fn, options)
		if (source instanceof Map) return morphMap(source, fn, options)
		return morphRecord(source, fn, options)
	},
	{
		get pure() {
			return (source: any, fn: any, _opt) => this(source, fn, { pure: true })
		},
	}
) as Morph
