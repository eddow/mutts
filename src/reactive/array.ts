import { Indexable } from '../indexable'
import { touched } from './change'
import { makeReactiveEntriesIterator, makeReactiveIterator } from './non-reactive'
import { reactive } from './proxy'
import { unwrap } from './proxy-state'
import { dependant } from './tracking'
import { prototypeForwarding } from './types'

export const native = Symbol('native')
const isArray = Array.isArray
Array.isArray = ((value: any) =>
	isArray(value) ||
	// biome-ignore lint/suspicious/useIsArray: We are defining it
	(value instanceof Array &&
		prototypeForwarding in value &&
		Array.isArray(value[prototypeForwarding]))) as any
export class ReactiveBaseArray {
	declare readonly [native]: any[]

	// Safe array access with negative indices
	at(index: number): any {
		const actualIndex = index < 0 ? this[native].length + index : index
		dependant(this, actualIndex)
		if (actualIndex < 0 || actualIndex >= this[native].length) return undefined
		return reactive(this[native][actualIndex])
	}

	// Immutable versions of mutator methods
	toReversed(): any[] {
		dependant(this)
		return reactive(this[native].toReversed())
	}

	toSorted(compareFn?: (a: any, b: any) => number): any[] {
		dependant(this)
		return reactive(this[native].toSorted(compareFn))
	}

	toSpliced(start: number, deleteCount?: number, ...items: any[]): any[] {
		dependant(this)
		return deleteCount === undefined
			? this[native].toSpliced(start)
			: this[native].toSpliced(start, deleteCount, ...items)
	}

	with(index: number, value: any): any[] {
		dependant(this)
		return reactive(this[native].with(index, value))
	}

	// Iterator methods with reactivity tracking
	entries() {
		dependant(this)
		return makeReactiveEntriesIterator(this[native].entries())
	}

	keys() {
		dependant(this, 'length')
		return this[native].keys()
	}

	values() {
		dependant(this)
		return makeReactiveIterator(this[native].values())
	}

	[Symbol.iterator]() {
		dependant(this)
		const nativeIterator = this[native][Symbol.iterator]()
		return {
			next() {
				const result = nativeIterator.next()
				if (result.done) {
					return result
				}
				return { value: reactive(result.value), done: false }
			},
		}
	}

	indexOf(searchElement: any, fromIndex?: number): number {
		dependant(this)
		return this[native].indexOf(unwrap(searchElement), fromIndex)
	}

	lastIndexOf(searchElement: any, fromIndex?: number): number {
		dependant(this)
		return this[native].lastIndexOf(unwrap(searchElement), fromIndex)
	}

	includes(searchElement: any, fromIndex?: number): boolean {
		dependant(this)
		return this[native].includes(unwrap(searchElement), fromIndex)
	}

	find(predicate: (this: any, value: any, index: number, obj: any[]) => boolean, thisArg?: any): any
	find(searchElement: any, fromIndex?: number): any
	find(predicateOrElement: any, thisArg?: any): any {
		dependant(this)
		if (typeof predicateOrElement === 'function') {
			const predicate = predicateOrElement as (
				this: any,
				value: any,
				index: number,
				obj: any[]
			) => boolean
			return reactive(
				this[native].find(
					(value, index, array) => predicate.call(thisArg, reactive(value), index, array),
					thisArg
				)
			)
		}
		const fromIndex = typeof thisArg === 'number' ? thisArg : undefined
		const index = this[native].indexOf(unwrap(predicateOrElement), fromIndex)
		if (index === -1) return undefined
		return reactive(this[native][index])
	}

	findIndex(
		predicate: (this: any, value: any, index: number, obj: any[]) => boolean,
		thisArg?: any
	): number
	findIndex(searchElement: any, fromIndex?: number): number
	findIndex(predicateOrElement: any, thisArg?: any): number {
		dependant(this)
		if (typeof predicateOrElement === 'function') {
			const predicate = predicateOrElement as (
				this: any,
				value: any,
				index: number,
				obj: any[]
			) => boolean
			return this[native].findIndex(
				(value, index, array) => predicate.call(thisArg, reactive(value), index, array),
				thisArg
			)
		}
		const fromIndex = typeof thisArg === 'number' ? thisArg : undefined
		return this[native].indexOf(unwrap(predicateOrElement), fromIndex)
	}

	flat(): any[] {
		dependant(this)
		return reactive(this[native].flat())
	}

	flatMap(
		callbackfn: (this: any, value: any, index: number, array: any[]) => any[],
		thisArg?: any
	): any[] {
		dependant(this)
		return reactive(this[native].flatMap(callbackfn, thisArg))
	}

	filter(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): any[] {
		dependant(this)
		return reactive(
			this[native].filter((item, index, array) => callbackfn(reactive(item), index, array), thisArg)
		)
	}

	map(callbackfn: (value: any, index: number, array: any[]) => any, thisArg?: any): any[] {
		dependant(this)
		return reactive(
			this[native].map((item, index, array) => callbackfn(reactive(item), index, array), thisArg)
		)
	}

	reduce(
		callbackfn: (previousValue: any, currentValue: any, currentIndex: number, array: any[]) => any,
		initialValue?: any
	): any {
		dependant(this)
		const result =
			initialValue === undefined
				? this[native].reduce(callbackfn as any)
				: this[native].reduce(callbackfn as any, initialValue)
		return reactive(result)
	}

	reduceRight(
		callbackfn: (previousValue: any, currentValue: any, currentIndex: number, array: any[]) => any,
		initialValue?: any
	): any {
		dependant(this)
		const result =
			initialValue !== undefined
				? this[native].reduceRight(callbackfn as any, initialValue)
				: (this[native] as any).reduceRight(callbackfn as any)
		return reactive(result)
	}

	slice(start?: number, end?: number): any[] {
		for (const i of range(start || 0, end || this[native].length - 1)) dependant(this, i)
		return start === undefined
			? this[native].slice()
			: end === undefined
				? this[native].slice(start)
				: this[native].slice(start, end)
	}

	concat(...items: any[]): any[] {
		dependant(this)
		return reactive(this[native].concat(...items))
	}

	join(separator?: string): string {
		dependant(this)
		return this[native].join(separator as any)
	}

	forEach(callbackfn: (value: any, index: number, array: any[]) => void, thisArg?: any): void {
		dependant(this)
		this[native].forEach(callbackfn as any, thisArg)
	}

	// TODO: re-implement for fun dependencies? (eg - every only check the first ones until it find some),
	// no need to make it dependant on indexes after the found one
	every(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): boolean {
		dependant(this)
		return this[native].every(callbackfn as any, thisArg)
	}

	some(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): boolean {
		dependant(this)
		return this[native].some(callbackfn as any, thisArg)
	}
}
function* index(i: number, { length = true } = {}): IterableIterator<number | 'length'> {
	if (length) yield 'length'
	yield i
}

function* range(
	a: number,
	b: number,
	{ length = false } = {}
): IterableIterator<number | 'length'> {
	const start = Math.min(a, b)
	const end = Math.max(a, b)
	if (length) yield 'length'
	for (let i = start; i <= end; i++) yield i
}
/**
 * Reactive wrapper around JavaScript's Array class with full array method support
 * Tracks length changes, individual index operations, and collection-wide operations
 */
export class ReactiveArray extends Indexable(ReactiveBaseArray, {
	get(i: number): any {
		dependant(this, i)
		return reactive(this[native][i])
	},
	set(i: number, value: any) {
		const added = i >= this[native].length
		this[native][i] = value
		touched(this, { type: 'set', prop: i }, index(i, { length: added }))
	},
	getLength() {
		dependant(this, 'length')
		return this[native].length
	},
	setLength(value: number) {
		const oldLength = this[native].length
		try {
			this[native].length = value
		} finally {
			touched(this, { type: 'set', prop: 'length' }, range(oldLength, value, { length: true }))
		}
	},
}) {
	declare length: number
	constructor(original: any[]) {
		super()
		Object.defineProperties(this, {
			// We have to make it double, as [native] must be `unique symbol` - impossible through import
			[native]: { value: original },
			[prototypeForwarding]: { value: original },
		})
	}

	push(...items: any[]) {
		const oldLength = this[native].length
		try {
			return this[native].push(...items)
		} finally {
			touched(
				this,
				{ type: 'bunch', method: 'push' },
				range(oldLength, oldLength + items.length - 1, { length: true })
			)
		}
	}

	pop() {
		if (this[native].length === 0) return undefined
		try {
			return reactive(this[native].pop())
		} finally {
			touched(this, { type: 'bunch', method: 'pop' }, index(this[native].length))
		}
	}

	shift() {
		if (this[native].length === 0) return undefined
		try {
			return reactive(this[native].shift())
		} finally {
			touched(
				this,
				{ type: 'bunch', method: 'shift' },
				range(0, this[native].length + 1, { length: true })
			)
		}
	}

	unshift(...items: any[]) {
		try {
			return this[native].unshift(...items)
		} finally {
			touched(
				this,
				{ type: 'bunch', method: 'unshift' },
				range(0, this[native].length - items.length, { length: true })
			)
		}
	}

	splice(start: number, deleteCount?: number, ...items: any[]) {
		const oldLength = this[native].length
		if (deleteCount === undefined) deleteCount = oldLength - start
		try {
			if (deleteCount === undefined) return reactive(this[native].splice(start))
			return reactive(this[native].splice(start, deleteCount, ...items))
		} finally {
			touched(
				this,
				{ type: 'bunch', method: 'splice' },
				// TODO: edge cases
				deleteCount === items.length
					? range(start, start + deleteCount)
					: range(start, oldLength + Math.max(items.length - deleteCount, 0), {
							length: true,
						})
			)
		}
	}

	reverse() {
		try {
			return this[native].reverse()
		} finally {
			touched(this, { type: 'bunch', method: 'reverse' }, range(0, this[native].length - 1))
		}
	}

	sort(compareFn?: (a: any, b: any) => number) {
		compareFn = compareFn || ((a, b) => a.toString().localeCompare(b.toString()))
		try {
			return this[native].sort((a, b) => compareFn(reactive(a), reactive(b))) as any
		} finally {
			touched(this, { type: 'bunch', method: 'sort' }, range(0, this[native].length - 1))
		}
	}

	fill(value: any, start?: number, end?: number) {
		try {
			if (start === undefined) return this[native].fill(value) as any
			if (end === undefined) return this[native].fill(value, start) as any
			return this[native].fill(value, start, end) as any
		} finally {
			touched(this, { type: 'bunch', method: 'fill' }, range(0, this[native].length - 1))
		}
	}

	copyWithin(target: number, start: number, end?: number) {
		try {
			if (end === undefined) return this[native].copyWithin(target, start) as any
			return this[native].copyWithin(target, start, end) as any
		} finally {
			touched(
				this,
				{ type: 'bunch', method: 'copyWithin' },
				// TODO: calculate the range properly
				range(0, this[native].length - 1)
			)
		}
		// Touch all affected indices with a single allProps call
	}
}
