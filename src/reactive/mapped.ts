import { Indexable } from '../indexable'
import { native, ReactiveBaseArray } from './array'
import { touched, touched1 } from './change'
import { effect, untracked } from './effects'
import { cleanedBy } from './interface'
import { reactive } from './proxy'
import { dependant } from './tracking'
import { prototypeForwarding, type ScopedCallback } from './types'

// TODO: Lazy reactivity ?
export class ReadOnlyError extends Error { }
/**
 * Reactive wrapper around JavaScript's Array class with full array method support
 * Tracks length changes, individual index operations, and collection-wide operations
 */
class ReactiveReadOnlyArrayClass extends Indexable(ReactiveBaseArray, {
	get(i: number): any {
		dependant(this, i)
		return reactive(this[native][i])
	},
	set(i: number, _value: any) {
		throw new ReadOnlyError(`Setting index ${i} on a read-only array`)
	},
	getLength() {
		dependant(this, 'length')
		return this[native].length
	},
	setLength(value: number) {
		throw new ReadOnlyError(`Setting length to ${value} on a read-only array`)
	},
}) {
	constructor(original: any[]) {
		super()
		Object.defineProperties(this, {
			// We have to make it double, as [native] must be `unique symbol` - impossible through import
			[native]: { value: original },
			[prototypeForwarding]: { value: original },
		})
	}

	push(..._items: any[]) {
		throw new ReadOnlyError(`Pushing items to a read-only array`)
	}

	pop() {
		throw new ReadOnlyError(`Popping from a read-only array`)
	}

	shift() {
		throw new ReadOnlyError(`Shifting from a read-only array`)
	}

	unshift(..._items: any[]) {
		throw new ReadOnlyError(`Unshifting items to a read-only array`)
	}

	splice(_start: number, _deleteCount?: number, ..._items: any[]) {
		throw new ReadOnlyError(`Splice from a read-only array`)
	}

	reverse() {
		throw new ReadOnlyError(`Reversing a read-only array`)
	}

	sort(_compareFn?: (a: any, b: any) => number) {
		throw new ReadOnlyError(`Sorting a read-only array`)
	}

	fill(_value: any, _start?: number, _end?: number) {
		throw new ReadOnlyError(`Filling a read-only array`)
	}

	copyWithin(_target: number, _start: number, _end?: number) {
		throw new ReadOnlyError(`Copying within a read-only array`)
	}
}

export const ReactiveReadOnlyArray = reactive(ReactiveReadOnlyArrayClass)
export type ReactiveReadOnlyArray<T> = readonly T[]
export function mapped<T, U>(
	inputs: readonly T[],
	compute: (input: T, index: number, output: U[]) => U,
	resize?: (newLength: number, oldLength: number) => void
): readonly U[] {
	const result: U[] = []
	const resultReactive = new ReactiveReadOnlyArray(result)
	const cleanups: ScopedCallback[] = []
	function input(index: number) {
		return effect(function computedIndexedMapInputEffect() {
			result[index] = compute(inputs[index], index, resultReactive)
			touched1(resultReactive, { type: 'set', prop: index }, index)
		})
	}
	const cleanupLength = effect(function computedMapLengthEffect({ ascend }) {
		const length = inputs.length
		const resultLength = untracked(() => result.length)
		resize?.(length, resultLength)
		touched1(resultReactive, { type: 'set', prop: 'length' }, 'length')
		if (length < resultLength) {
			const toCleanup = cleanups.splice(length)
			for (const cleanup of toCleanup) cleanup()
			result.length = length
		} else if (length > resultLength)
			// the input effects will be registered as the call's children, so they will remain not cleaned with this effect on length
			ascend(function computedMapNewElements() {
				for (let i = resultLength; i < length; i++) cleanups.push(input(i))
			})
	})
	return cleanedBy(resultReactive, () => {
		for (const cleanup of cleanups) cleanup()
		cleanups.length = 0
		cleanupLength()
	})
}

export function reduced<T, U, R extends object = any>(
	inputs: readonly T[],
	compute: (input: T, factor: R) => readonly U[]
): readonly U[] {
	const result: U[] = []
	const resultReactive = new ReactiveReadOnlyArray(result)
	const cleanupFactor = effect(function computedReducedFactorEffect() {
		const factor: R = {} as R
		result.length = 0
		for (const input of inputs) result.push(...compute(input, factor))
		touched(resultReactive, { type: 'invalidate', prop: 'reduced' })
	})
	return cleanedBy(resultReactive, cleanupFactor)
}
