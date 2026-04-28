import { arrayDiff } from '../diff'
import { type Captioned, captioned, flavored } from '../flavored'
import { tag } from '../utils'
import type { GetterWrapper } from '../zone'
import { getState, touched, touched1 } from './change'
import { chainExternalReason, getActiveEffect, link } from './effect-context'
import { effect } from './effects'
import { reactive } from './proxy'
import { getEffectNode, markWithRoot } from './registry'
import { dependant } from './tracking'
import {
	type CleanupReason,
	type EffectAccess,
	type EffectCloser,
	isReactive,
	keysOf,
	options,
	type ScopedCallback,
	type State,
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
export interface Attend
	extends Captioned<
		(
			source: any,
			callback: (key: any, access: EffectAccess) => EffectCloser | void
		) => ScopedCallback
	> {
	<T>(
		source: readonly T[],
		callback: (index: number, access: EffectAccess) => EffectCloser | void
	): ScopedCallback
	<K, V>(
		source: Map<K, V>,
		callback: (key: K, access: EffectAccess) => EffectCloser | void
	): ScopedCallback
	<T>(
		source: Set<T>,
		callback: (value: T, access: EffectAccess) => EffectCloser | void
	): ScopedCallback
	<S extends object>(
		source: S,
		callback: (key: keyof S & string, access: EffectAccess) => EffectCloser | void
	): ScopedCallback
	<Key>(
		enumerate: () => Iterable<Key>,
		callback: (key: Key, access: EffectAccess) => EffectCloser | void
	): ScopedCallback
}

export const attend: Attend = captioned(
	function attend(
		source: any,
		callback: (key: any, access: EffectAccess) => EffectCloser | void
	): ScopedCallback {
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
		const callbackLabel = callback.name ? callback.name : ''

		const outer = effect`attend`(({ ascend }) => {
			const keys = new Set<any>()
			for (const key of enumerate()) keys.add(key)

			for (const key of keys) {
				if (keyEffects.has(key)) continue
				const indexRef = { value: key }
				keyEffects.set(
					key,
					ascend(() =>
						effect`attend${callbackLabel ? `:${callbackLabel}` : ''}:${key}`((access) =>
							callback(indexRef.value, access)
						)
					)
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
	},
	{
		name: 'attend',
		callbackIndex: 1,
		warn: (message) => options.warn(`[reactive] ${message}`),
	}
) as Attend

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
export interface Lift {
	<Output extends any[]>(cb: (access: EffectAccess) => Output): Output
	<Output extends object>(cb: (access: EffectAccess) => Output): Output
	(strings: TemplateStringsArray, ...values: readonly unknown[]): Lift
}

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
export const lift: Lift = captioned(
	function lift<Output extends any[] | object>(cb: (access: EffectAccess) => Output): Output {
		let result!: Output
		let rawResult!: Output
		const resultName = `lift:${cb.name || 'anonymous'}`
		const liftCleanup = effect`lift:${cb.name}`(
			markWithRoot((access) => {
				const source = cb(access)
				if (!source || typeof source !== 'object')
					throw new Error('lift callback must return an array or object')
				const sourceProto = Object.getPrototypeOf(source)
				if (!result) {
					rawResult = tag(resultName, Array.isArray(source) ? [] : Object.create(sourceProto))
					result = reactive(rawResult)
				}
				if (sourceProto !== Object.getPrototypeOf(result))
					throw new Error('lift callback must return the same type as the previous result')

				if (Array.isArray(source)) {
					const res = result as unknown[]
					for (const { indexA, sliceA, sliceB } of arrayDiff(res, source).sort(
						(a, b) => a.indexA - b.indexA
					))
						res.splice(indexA, sliceA.length, ...sliceB)
				} else {
					const recordResult = rawResult as Record<string, unknown>
					for (const key of Object.keys(source)) {
						const had = key in rawResult
						const newDesc = Object.getOwnPropertyDescriptor(source, key)!
						if (had) {
							const oldDesc = Object.getOwnPropertyDescriptor(rawResult, key)
							const sameAccessor = oldDesc && newDesc.get && oldDesc.get === newDesc.get
							Object.defineProperty(rawResult, key, newDesc)
							if (
								!sameAccessor &&
								recordResult[key] !==
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
							delete recordResult[key]
							touched1(rawResult, { type: 'del', prop: key }, key)
						}
				}
			}, cb)
		)
		return link(result, liftCleanup)
	},
	{
		name: 'lift',
		warn: (message) => options.warn(`[reactive] ${message}`),
	}
) as Lift

/**
 * Position object provided to array morph callbacks.
 *
 * @property index - Current index of the item in the source array. The object is stable
 *   per item and its `index` updates reactively when the item moves due to shifts/reorders.
 */
export type MorphPosition = {
	index: number
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
	fn: (arg: I, position: MorphPosition, access?: EffectAccess) => O,
	options?: MorphOptions<I>
): readonly O[] {
	if (typeof source !== 'function' && !isReactive(source) && options?.pure === true) {
		return source.map((i) => fn(i, { index: 0 })) as any
	}

	let track!: GetterWrapper
	const itemEffects = new Map<any, { stop: ScopedCallback; position: MorphPosition }>()
	const cache = tag(`morph:${fn.name || 'anonymous'}`, [] as O[])
	let input: readonly I[] = []

	function currentCleanupReason() {
		const activeEffect = getActiveEffect()
		if (!activeEffect) return undefined
		const node = getEffectNode(activeEffect)
		return node.currentReason
	}

	function stopEntry(entry: { stop: ScopedCallback; position: MorphPosition }) {
		entry.stop(chainExternalReason({ type: 'stopped', chain: currentCleanupReason() }))
	}

	function stopItem(key: any) {
		const entry = itemEffects.get(key)
		if (entry) {
			stopEntry(entry)
			itemEffects.delete(key)
		}
	}

	function computeItem(key: number, input: I) {
		const isPure =
			options?.pure === true || (typeof options?.pure === 'function' && options.pure(input))
		if (isPure) {
			track(() => {
				cache[key] = fn(input, { index: key })
			})
		} else {
			const position = reactive({ index: key } as MorphPosition)
			const stop = track(() =>
				effect.opaque`morph:${fn.name}:${key}`((access) => {
					if (access.reaction) {
						delete cache[position.index]
						touched1(cache, { type: 'invalidate', prop: 'morph' }, String(key))
						const activeEffect = getActiveEffect()
						let chain: CleanupReason | undefined
						if (activeEffect) {
							const node = getEffectNode(activeEffect)
							chain = node.currentReason
						}
						stop?.({
							type: 'invalidate',
							cause: chainExternalReason(
								!access.reaction || access.reaction === true
									? { type: 'stopped', chain }
									: access.reaction
							)!,
							chain: chainExternalReason(chain),
						})
					} else cache[position.index] = fn(input, position, access)
				})
			)
			itemEffects.set(key, { stop, position })
		}
	}

	const proxy = reactive(cache, {
		get(cache, prop) {
			const n = typeof prop === 'string' ? Number(prop) : NaN
			if (Number.isNaN(n)) return cache[prop]
			if (!(n in cache)) computeItem(n, input[n])
			return cache[n]
		},
		has(_cache, prop) {
			return Reflect.has(input, prop)
		},
	})

	const stopMain = effect`morph:${fn.name}`(({ ascend }) => {
		track = ascend
		const newInput = [...(typeof source === 'function' ? source() : source)]
		const diffs = arrayDiff(input, newInput).toSorted((a, b) => b.indexA - a.indexA)

		if (diffs.length > 0) {
			const reusable = new Map<
				I,
				Array<{ index: number; entry: { stop: ScopedCallback; position: MorphPosition } }>
			>()
			for (const [index, entry] of itemEffects) {
				const value = input[index]
				const entries = reusable.get(value)
				if (entries) entries.push({ index, entry })
				else reusable.set(value, [{ index, entry }])
			}

			const nextEffects = new Map<any, { stop: ScopedCallback; position: MorphPosition }>()
			const reused = new Set<number>()
			const nextCache = new Map<number, O>()

			for (let index = 0; index < newInput.length; index++) {
				const entries = reusable.get(newInput[index])
				const reusedEntry = entries?.shift()
				if (!reusedEntry) continue

				const { index: previousIndex, entry } = reusedEntry
				reused.add(previousIndex)
				nextEffects.set(index, entry)
				if (entry.position.index !== index) entry.position.index = index
				else if (Object.hasOwn(cache, previousIndex)) nextCache.set(index, cache[previousIndex])
			}

			for (const [index, entry] of itemEffects) {
				if (!reused.has(index)) stopEntry(entry)
			}
			itemEffects.clear()
			for (const [index, entry] of nextEffects) itemEffects.set(index, entry)

			const previousLength = cache.length
			cache.length = newInput.length
			for (let i = 0; i < Math.max(previousLength, newInput.length); i++) delete cache[i]
			for (const [index, value] of nextCache) cache[index] = value

			const eagerIndices = new Set<number>()
			for (const diff of diffs) {
				const max = Math.max(diff.sliceA.length, diff.sliceB.length)
				for (let i = 0; i < max; i++) eagerIndices.add(diff.indexA + i)
			}
			for (const index of eagerIndices) {
				if (index < 0 || index >= newInput.length || Object.hasOwn(cache, index)) continue
				const value = newInput[index]
				const isPure =
					options?.pure === true || (typeof options?.pure === 'function' && options.pure(value))
				if (isPure) continue
				stopItem(index)
				computeItem(index, value)
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

	return link(proxy, (reason) => {
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
	fn: (arg: V, key: K, access?: EffectAccess) => O,
	options?: MorphOptions<V>
): Map<K, O> {
	if (!isReactive(source) && options?.pure === true) {
		const res = new Map<K, O>()
		for (const [k, v] of source) res.set(k, fn(v, k))
		return res as any
	}

	let track!: GetterWrapper
	const itemEffects = new Map<any, ScopedCallback>()
	const cache = tag(`morph:${fn.name || 'anonymous'}`, new Map<K, O>())
	Object.defineProperty(cache, 'constructor', { value: Object, enumerable: false })

	function stopItem(key: any) {
		const stop = itemEffects.get(key)
		if (stop) {
			const activeEffect = getActiveEffect()
			let chain: CleanupReason | undefined
			if (activeEffect) {
				const node = getEffectNode(activeEffect)
				chain = node.currentReason
			}
			stop({ type: 'stopped', chain })
			itemEffects.delete(key)
		}
	}

	function computeItem(key: any, val: any) {
		const isPure =
			options?.pure === true || (typeof options?.pure === 'function' && options.pure(val))
		if (isPure) {
			cache.set(
				key,
				track(() => fn(val, key))
			)
		} else {
			const stop = track(() =>
				effect.opaque`morph:${fn.name}:${key}`((access) => {
					const next = source.get(key)
					if (next === undefined && !source.has(key)) return
					cache.set(key, fn(next as V, key, access))
					return (reason) => {
						cache.delete(key)
						touched1(cache, { type: 'invalidate', prop: 'morph' }, String(key))
						const activeEffect = getActiveEffect()
						let chain: CleanupReason | undefined
						if (activeEffect) {
							const node = getEffectNode(activeEffect)
							chain = node.currentReason
						}
						stop?.({
							type: 'invalidate',
							cause: chainExternalReason(reason ?? { type: 'stopped', chain })!,
							chain: chainExternalReason(chain),
						})
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

	let stateSnapshot: State = getState(source)
	const stopMain = effect`morph:${fn.name}`(({ ascend }) => {
		track = ascend
		dependant(source, keysOf)
		while ('evolution' in stateSnapshot) {
			const { evolution } = stateSnapshot
			stateSnapshot = stateSnapshot.next
			if (evolution.type === 'add') {
				touched1(cache, evolution, evolution.prop)
			} else if (evolution.type === 'del') {
				stopItem(evolution.prop)
				cache.delete(evolution.prop)
				touched1(cache, evolution, evolution.prop)
			}
		}
	})

	return link(proxy, (reason) => {
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
	fn: (arg: S[keyof S], key: keyof S, access?: EffectAccess) => O,
	options?: MorphOptions<S[keyof S]>
): { [K in keyof S]: O } {
	if (!isReactive(source) && options?.pure === true) {
		const res = {} as any
		for (const k of Object.keys(source)) res[k] = fn(source[k], k)
		return res
	}

	let track!: GetterWrapper
	const itemEffects = new Map<any, ScopedCallback>()
	const cache = {} as any

	function stopItem(key: any) {
		const stop = itemEffects.get(key)
		if (stop) {
			const activeEffect = getActiveEffect()
			let chain: CleanupReason | undefined
			if (activeEffect) {
				const node = getEffectNode(activeEffect)
				chain = node.currentReason
			}
			stop({ type: 'stopped', chain })
			itemEffects.delete(key)
		}
	}

	function computeItem(key: any, val: any) {
		const isPure =
			options?.pure === true || (typeof options?.pure === 'function' && options.pure(val))
		if (isPure) {
			cache[key] = track(() => fn(val, key))
		} else {
			const stop = track(() =>
				effect.opaque`morph:${fn.name}:${key}`((access) => {
					cache[key] = fn(source[key], key, access)
					return (reason) => {
						delete cache[key]
						touched1(cache, { type: 'invalidate', prop: 'morph' }, String(key))
						const activeEffect = getActiveEffect()
						let chain: CleanupReason | undefined
						if (activeEffect) {
							const node = getEffectNode(activeEffect)
							chain = node.currentReason
						}
						stop?.({
							type: 'invalidate',
							cause: chainExternalReason(reason ?? { type: 'stopped', chain })!,
							chain: chainExternalReason(chain),
						})
					}
				})
			)
			itemEffects.set(key, stop)
		}
	}
	function get(prop: PropertyKey) {
		if (!(prop in cache) && prop in source) computeItem(prop, source[prop])
		return cache[prop]
	}
	const proxy = reactive(cache, {
		get(_, prop) {
			return get(prop)
		},
		has(_, prop) {
			return prop in source
		},
		ownKeys() {
			return Reflect.ownKeys(source)
		},
		getOwnPropertyDescriptor(_cache, prop) {
			if (prop in source) return { configurable: true, enumerable: true, get: () => get(prop) }
		},
	})

	let stateSnapshot: State = getState(source)
	const stopMain = effect`morph:${fn.name}`(({ ascend }) => {
		track = ascend
		// Track only structural changes on source
		dependant(source, keysOf)
		while ('evolution' in stateSnapshot) {
			const { evolution } = stateSnapshot
			stateSnapshot = stateSnapshot.next
			if (evolution.type === 'add') {
				touched1(cache, evolution, evolution.prop)
			} else if (evolution.type === 'del') {
				stopItem(evolution.prop)
				delete cache[evolution.prop]
				touched1(cache, evolution, evolution.prop)
			}
		}
	})

	return link(proxy, (reason) => {
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
		fn: (arg: I, position: MorphPosition, access?: EffectAccess) => O,
		options?: MorphOptions<I>
	): readonly O[]

	<K, V, O>(
		source: Map<K, V>,
		fn: (arg: V, key: K, access?: EffectAccess) => O,
		options?: MorphOptions<V>
	): Map<K, O>

	<S extends Record<PropertyKey, any>, O>(
		source: S,
		fn: (arg: S[keyof S], key: keyof S, access?: EffectAccess) => O,
		options?: MorphOptions<S[keyof S]>
	): { [K in keyof S]: O }

	(strings: TemplateStringsArray, ...values: readonly unknown[]): Morph
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
export const morph = captioned(
	flavored(
		function morph(source: any, fn: any, options?: any): any {
			if (Array.isArray(source) || typeof source === 'function')
				return morphArray(source, fn, options)
			if (source instanceof Map) return morphMap(source, fn, options)
			return morphRecord(source, fn, options)
		},
		{
			get pure() {
				return (source: any, fn: any, _opt: unknown) => this(source, fn, { pure: true })
			},
		}
	),
	{
		name: 'morph',
		callbackIndex: 1,
		warn: (message) => options.warn(`[reactive] ${message}`),
	}
) as Morph
