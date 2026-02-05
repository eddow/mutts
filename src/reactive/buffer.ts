import { cleanedBy } from '.'
import { FoolProof } from '../utils'
import { effect, untracked } from './effects'
import { memoize } from './memoize'
import { reactive } from './proxy'
import type { cleanup, EffectAccess, EffectCleanup, ScopedCallback } from './types'

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
	const result = reactive([] as Output[])
	
	// Track effects for each index to dispose them when the array shrinks
	const indexEffects = new Map<number, EffectCleanup>()
	// Mapping from index to its current intermediate object
	const indexToIntermediate = reactive([] as Intermediate[])
	const intermediaries = new WeakMap<Input, Intermediate[]>()

	class Intermediate {
		public prev: Intermediate | undefined
		constructor(public val: Input, prev: Intermediate | undefined) {
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
			untracked(() => {
				Reflect.deleteProperty(indexToIntermediate as any, index)
				Reflect.deleteProperty(result as any, index)
			})
		}
	}

	const mainEffect = effect(function scanMainEffect({ ascend }) {
		const length = observedSource.length
		const occurrenceCount = new Map<Input, number>()
		let prev: Intermediate | undefined = undefined

		for (let i = 0; i < length; i++) {
			const val = FoolProof.get(observedSource as any, i, observedSource) as Input
			
			if (!(val && (typeof val === 'object' || typeof val === 'function' || typeof val === 'symbol'))) {
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
							untracked(() => {
								result[index] = accValue
							})
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
		untracked(() => {
			if (result.length !== length) {
				FoolProof.set(result as any, 'length', length, result)
			}
		})
	})

	return cleanedBy(result, (() => {
		mainEffect()
		for (const stop of indexEffects.values()) stop()
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
export function lift<Output>(cb: (access: EffectAccess) => Output[]): Output[] & { [cleanup]: ScopedCallback } {
	const result = reactive([] as Output[])
	return cleanedBy(result, effect((access) => {
		const source = cb(access)
		if (result.length !== source.length) result.length = source.length
		for (let i = 0; i < source.length; i++)
			if (result[i] !== source[i]) result[i] = source[i]
	}))
}