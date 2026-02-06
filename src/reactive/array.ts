import { FoolProof } from '../utils'
import { touched } from './change'
import { makeReactiveEntriesIterator, makeReactiveIterator } from './non-reactive'
import { reactive } from './proxy'
import { unwrap } from './proxy-state'
import { dependant } from './tracking'

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
export abstract class Indexer extends Array {
	get(i: number): any {
		dependant(this, i)
		return reactive(this[i])
	}
	set(i: number, value: any) {
		const added = i >= this.length
		this[i] = value
		touched(this, { type: 'set', prop: i }, index(i, { length: added }))
	}
	getLength() {
		dependant(this, 'length')
		return this.length
	}
	setLength(value: number) {
		const oldLength = this.length
		try {
			this.length = value
		} finally {
			touched(this, { type: 'set', prop: 'length' }, range(oldLength, value, { length: true }))
		}
	}
}
const indexLess = { get: FoolProof.get, set: FoolProof.set }
Object.assign(FoolProof, {
	get(obj: any, prop: any, receiver: any) {
		if (obj instanceof Array && typeof prop === 'string') {
			if (prop === 'length') return Indexer.prototype.getLength.call(obj)
			const index = parseInt(prop)
			if (!Number.isNaN(index)) return Indexer.prototype.get.call(obj, index)
		}
		return indexLess.get(obj, prop, receiver)
	},
	set(obj: any, prop: any, value: any, receiver: any) {
		if (obj instanceof Array && typeof prop === 'string') {
			if (prop === 'length') return Indexer.prototype.setLength.call(obj, value)
			const index = parseInt(prop)
			if (!Number.isNaN(index)) return Indexer.prototype.set.call(obj, index, value)
		}
		return indexLess.set(obj, prop, value, receiver)
	},
})

export abstract class ReactiveArray extends Array {
	toJSON() {
		return this
	}
	get [Symbol.toStringTag]() {
		return 'ReactiveArray'
	}
	// Safe array access with negative indices
	at(index: number): any {
		const actualIndex = index < 0 ? this.length + index : index
		dependant(this, actualIndex)
		if (index < 0) dependant(this, 'length')
		if (actualIndex < 0 || actualIndex >= this.length) return undefined
		return reactive(this[actualIndex])
	}

	// Immutable versions of mutator methods
	toReversed(): any[] {
		dependant(this)
		return reactive(this.toReversed())
	}

	toSorted(compareFn?: (a: any, b: any) => number): any[] {
		dependant(this)
		return reactive(this.toSorted(compareFn))
	}

	toSpliced(start: number, deleteCount?: number, ...items: any[]): any[] {
		dependant(this)
		return deleteCount === undefined
			? this.toSpliced(start)
			: this.toSpliced(start, deleteCount, ...items)
	}

	with(index: number, value: any): any[] {
		dependant(this)
		return reactive(this.with(index, value))
	}

	// Iterator methods with reactivity tracking
	entries(): any {
		dependant(this)
		return makeReactiveEntriesIterator(this.entries())
	}

	keys(): any {
		dependant(this, 'length')
		return this.keys()
	}

	values(): any {
		dependant(this)
		return makeReactiveIterator(this.values())
	}

	[Symbol.iterator](): ArrayIterator<any> {
		dependant(this)
		const nativeIterator = this[Symbol.iterator]()
		return {
			next() {
				const result = nativeIterator.next()
				if (result.done) {
					return result
				}
				return { value: reactive(result.value), done: false }
			},
			[Symbol.iterator]() {
				return this
			},
			[Symbol.dispose]() {},
		} as any
	}

	indexOf(searchElement: any, fromIndex?: number): number {
		const length = this.length
		let i = fromIndex === undefined ? 0 : fromIndex
		if (i < 0) i = Math.max(length + i, 0)

		const unwrappedSearch = unwrap(searchElement)

		for (; i < length; i++) {
			dependant(this, i)
			const item = this[i]
			if (item === searchElement || item === unwrappedSearch || unwrap(item) === unwrappedSearch) {
				return i
			}
		}

		dependant(this, 'length')
		return -1
	}

	lastIndexOf(searchElement: any, fromIndex?: number): number {
		const length = this.length
		let i = fromIndex === undefined ? length - 1 : fromIndex
		if (i >= length) i = length - 1
		if (i < 0) i = Math.max(length + i, -1) // -1 ensures loop condition i >= 0 works correctly

		const unwrappedSearch = unwrap(searchElement)

		for (; i >= 0; i--) {
			dependant(this, i)
			const item = this[i]
			if (item === searchElement || item === unwrappedSearch || unwrap(item) === unwrappedSearch) {
				return i
			}
		}

		// If we scanned the whole relevant part and didn't find it, we depend on length
		// (because adding elements might shift indices or add the element)
		// Actually for lastIndexOf, if we start from end, length dependency is implicit in the start index calculation?
		// But if we return -1, it means we didn't find it.
		// If we push an element, should lastIndexOf update?
		// Yes, if the new element is the one we are looking for.
		dependant(this, 'length')
		return -1
	}

	includes(searchElement: any, fromIndex?: number): boolean {
		return this.indexOf(searchElement, fromIndex) !== -1
	}

	find(predicate: (this: any, value: any, index: number, obj: any[]) => boolean, thisArg?: any): any
	find(searchElement: any, fromIndex?: number): any
	find(predicateOrElement: any, thisArg?: any): any {
		if (typeof predicateOrElement === 'function') {
			const predicate = predicateOrElement as (
				this: any,
				value: any,
				index: number,
				obj: any[]
			) => boolean
			const length = this.length

			for (let i = 0; i < length; i++) {
				dependant(this, i)
				const val = reactive(this[i])
				if (predicate.call(thisArg, val, i, this)) {
					return val
				}
			}

			dependant(this, 'length')
			return undefined
		}
		const fromIndex = typeof thisArg === 'number' ? thisArg : undefined
		const index = this.indexOf(predicateOrElement, fromIndex)
		if (index === -1) return undefined
		return reactive(this[index])
	}

	findIndex(
		predicate: (this: any, value: any, index: number, obj: any[]) => boolean,
		thisArg?: any
	): number
	findIndex(searchElement: any, fromIndex?: number): number
	findIndex(predicateOrElement: any, thisArg?: any): number {
		if (typeof predicateOrElement === 'function') {
			const predicate = predicateOrElement as (
				this: any,
				value: any,
				index: number,
				obj: any[]
			) => boolean
			const length = this.length

			for (let i = 0; i < length; i++) {
				dependant(this, i)
				const val = reactive(this[i])
				if (predicate.call(thisArg, val, i, this)) {
					return i
				}
			}

			dependant(this, 'length')
			return -1
		}
		const fromIndex = typeof thisArg === 'number' ? thisArg : undefined
		return this.indexOf(predicateOrElement, fromIndex)
	}

	flat(depth?: number): any[] {
		dependant(this)
		return reactive(depth === undefined ? this.flat() : this.flat(depth))
	}

	flatMap(
		callbackfn: (this: any, value: any, index: number, array: any[]) => any[],
		thisArg?: any
	): any[] {
		dependant(this)
		return reactive(
			this.flatMap(
				(item, index, array) => callbackfn.call(thisArg, reactive(item), index, array),
				thisArg
			)
		)
	}

	filter(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): any[] {
		dependant(this)
		return reactive(
			this.filter((item, index, array) => callbackfn(reactive(item), index, array), thisArg)
		)
	}

	map(callbackfn: (value: any, index: number, array: any[]) => any, thisArg?: any): any[] {
		dependant(this)
		return reactive(
			this.map((item, index, array) => callbackfn(reactive(item), index, array), thisArg)
		)
	}

	reduce(
		callbackfn: (previousValue: any, currentValue: any, currentIndex: number, array: any[]) => any,
		initialValue?: any
	): any {
		dependant(this)
		const result =
			initialValue === undefined
				? this.reduce(callbackfn as any)
				: this.reduce(callbackfn as any, initialValue)
		return reactive(result)
	}

	reduceRight(
		callbackfn: (previousValue: any, currentValue: any, currentIndex: number, array: any[]) => any,
		initialValue?: any
	): any {
		dependant(this)
		const result =
			initialValue !== undefined
				? this.reduceRight(callbackfn as any, initialValue)
				: (this as any).reduceRight(callbackfn as any)
		return reactive(result)
	}

	slice(start?: number, end?: number): any[] {
		for (const i of range(start || 0, end || this.length - 1)) dependant(this, i)
		return start === undefined
			? this.slice()
			: end === undefined
				? this.slice(start)
				: this.slice(start, end)
	}

	concat(...items: any[]): any[] {
		dependant(this)
		return reactive(this.concat(...items))
	}

	join(separator?: string): string {
		dependant(this)
		return this.join(separator as any)
	}

	forEach(callbackfn: (value: any, index: number, array: any[]) => void, thisArg?: any): void {
		dependant(this)
		this.forEach((value, index, array) => {
			callbackfn.call(thisArg, reactive(value), index, array)
		})
	}

	// no need to make it dependant on indexes after the found one
	every<S>(
		predicate: (value: any, index: number, array: any[]) => value is S,
		thisArg?: any
	): this is S[]
	every(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): boolean
	every(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): boolean {
		const length = this.length

		for (let i = 0; i < length; i++) {
			dependant(this, i)
			if (!callbackfn.call(thisArg, reactive(this[i]), i, this)) {
				return false
			}
		}

		dependant(this, 'length')
		return true
	}

	some(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): boolean {
		const length = this.length

		for (let i = 0; i < length; i++) {
			dependant(this, i)
			if (callbackfn.call(thisArg, reactive(this[i]), i, this)) {
				return true
			}
		}

		dependant(this, 'length')
		return false
	}
	// Side-effectful
	push(...items: any[]): number {
		const oldLength = this.length
		try {
			return this.push(...items)
		} finally {
			touched(
				this,
				{ type: 'bunch', method: 'push' },
				range(oldLength, oldLength + items.length - 1, { length: true })
			)
		}
	}

	pop(): any {
		if (this.length === 0) return undefined
		try {
			return reactive(this.pop())
		} finally {
			touched(this, { type: 'bunch', method: 'pop' }, index(this.length))
		}
	}

	shift(): any {
		if (this.length === 0) return undefined
		try {
			return reactive(this.shift())
		} finally {
			touched(this, { type: 'bunch', method: 'shift' }, range(0, this.length + 1, { length: true }))
		}
	}

	unshift(...items: any[]): number {
		try {
			return this.unshift(...items)
		} finally {
			touched(
				this,
				{ type: 'bunch', method: 'unshift' },
				range(0, this.length - items.length, { length: true })
			)
		}
	}

	splice(start: number, deleteCount?: number, ...items: any[]): any[] {
		const oldLength = this.length

		// Normalize start index
		let actualStart = start
		if (actualStart < 0) actualStart = Math.max(oldLength + actualStart, 0)
		else actualStart = Math.min(actualStart, oldLength)

		// Normalize deleteCount
		let actualDeleteCount = deleteCount
		if (actualDeleteCount === undefined) {
			actualDeleteCount = oldLength - actualStart
		} else {
			actualDeleteCount = Math.max(0, Math.min(actualDeleteCount, oldLength - actualStart))
		}

		try {
			if (deleteCount === undefined) return reactive(this.splice(start))
			return reactive(this.splice(start, deleteCount, ...items))
		} finally {
			touched(
				this,
				{ type: 'bunch', method: 'splice' },
				actualDeleteCount === items.length
					? range(actualStart, actualStart + actualDeleteCount - 1)
					: range(actualStart, oldLength + Math.max(items.length - actualDeleteCount, 0), {
							length: true,
						})
			)
		}
	}

	reverse(): any[] {
		try {
			return this.reverse()
		} finally {
			touched(this, { type: 'bunch', method: 'reverse' }, range(0, this.length - 1))
		}
	}

	sort(compareFn?: (a: any, b: any) => number): this {
		compareFn = compareFn || ((a, b) => a.toString().localeCompare(b.toString()))
		try {
			return this.sort((a, b) => compareFn(reactive(a), reactive(b))) as any
		} finally {
			touched(this, { type: 'bunch', method: 'sort' }, range(0, this.length - 1))
		}
	}

	fill(value: any, start?: number, end?: number): this {
		const len = this.length
		let k = start === undefined ? 0 : start
		if (k < 0) k = Math.max(len + k, 0)
		else k = Math.min(k, len)

		let final = end === undefined ? len : end
		if (final < 0) final = Math.max(len + final, 0)
		else final = Math.min(final, len)

		try {
			if (start === undefined) return this.fill(value) as any
			if (end === undefined) return this.fill(value, start) as any
			return this.fill(value, start, end) as any
		} finally {
			if (final > k) {
				touched(this, { type: 'bunch', method: 'fill' }, range(k, final - 1))
			}
		}
	}

	copyWithin(target: number, start: number, end?: number): this {
		try {
			if (end === undefined) return this.copyWithin(target, start) as any
			return this.copyWithin(target, start, end) as any
		} finally {
			const len = this.length

			let to = target
			if (to < 0) to = Math.max(len + to, 0)
			else if (to >= len) to = len

			let from = start
			if (from < 0) from = Math.max(len + from, 0)
			else if (from >= len) from = len

			let final = end === undefined ? len : end
			if (final < 0) final = Math.max(len + final, 0)
			else if (final >= len) final = len

			const count = Math.min(final - from, len - to)

			if (count > 0) {
				touched(this, { type: 'bunch', method: 'copyWithin' }, range(to, to + count - 1))
			}
		}
	}
}
