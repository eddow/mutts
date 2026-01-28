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

export abstract class ReactiveArray extends Array {

	get [Symbol.toStringTag]() {
		return 'ReactiveArray'
	}
	// Safe array access with negative indices
	at(index: number): any {
		const actualIndex = index < 0 ? this.length + index : index
		dependant(this, actualIndex)
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
	entries() {
		dependant(this)
		return makeReactiveEntriesIterator(this.entries())
	}

	keys() {
		dependant(this, 'length')
		return this.keys()
	}

	values() {
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
		dependant(this)
		const unwrappedSearch = unwrap(searchElement)
		// Check both wrapped and unwrapped versions since array may contain either
		const index = this.indexOf(unwrappedSearch, fromIndex)
		if (index !== -1) return index
		// If not found with unwrapped, try with wrapped (in case array contains wrapped version)
		return this.indexOf(searchElement, fromIndex)
	}

	lastIndexOf(searchElement: any, fromIndex?: number): number {
		dependant(this)
		const unwrappedSearch = unwrap(searchElement)
		// Check both wrapped and unwrapped versions since array may contain either
		const index = this.lastIndexOf(unwrappedSearch, fromIndex)
		if (index !== -1) return index
		// If not found with unwrapped, try with wrapped (in case array contains wrapped version)
		return this.lastIndexOf(searchElement, fromIndex)
	}

	includes(searchElement: any, fromIndex?: number): boolean {
		dependant(this)
		const unwrappedSearch = unwrap(searchElement)
		// Check both wrapped and unwrapped versions since array may contain either
		return (
			this.includes(unwrappedSearch, fromIndex) ||
			this.includes(searchElement, fromIndex)
		)
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
				this.find(
					(value, index, array) => predicate.call(thisArg, reactive(value), index, array),
					thisArg
				)
			)
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
		dependant(this)
		if (typeof predicateOrElement === 'function') {
			const predicate = predicateOrElement as (
				this: any,
				value: any,
				index: number,
				obj: any[]
			) => boolean
			return this.findIndex(
				(value, index, array) => predicate.call(thisArg, reactive(value), index, array),
				thisArg
			)
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

	// TODO: re-implement for fun dependencies? (eg - every only check the first ones until it find some),
	// no need to make it dependant on indexes after the found one
	every<S extends any>(
		predicate: (value: any, index: number, array: any[]) => value is S,
		thisArg?: any
	): this is S[]
	every(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): boolean
	every(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): boolean {
		dependant(this)
		return this.every(
			(value, index, array) => callbackfn.call(thisArg, reactive(value), index, array),
			thisArg
		)
	}
	some(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): boolean {
		dependant(this)
		return this.some(
			(value, index, array) => callbackfn.call(thisArg, reactive(value), index, array),
			thisArg
		)
	}
	// Side-effectful
	push(...items: any[]) {
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

	pop() {
		if (this.length === 0) return undefined
		try {
			return reactive(this.pop())
		} finally {
			touched(this, { type: 'bunch', method: 'pop' }, index(this.length))
		}
	}

	shift() {
		if (this.length === 0) return undefined
		try {
			return reactive(this.shift())
		} finally {
			touched(
				this,
				{ type: 'bunch', method: 'shift' },
				range(0, this.length + 1, { length: true })
			)
		}
	}

	unshift(...items: any[]) {
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

	splice(start: number, deleteCount?: number, ...items: any[]) {
		const oldLength = this.length
		if (deleteCount === undefined) deleteCount = oldLength - start
		try {
			if (deleteCount === undefined) return reactive(this.splice(start))
			return reactive(this.splice(start, deleteCount, ...items))
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
			return this.reverse()
		} finally {
			touched(this, { type: 'bunch', method: 'reverse' }, range(0, this.length - 1))
		}
	}

	sort(compareFn?: (a: any, b: any) => number) {
		compareFn = compareFn || ((a, b) => a.toString().localeCompare(b.toString()))
		try {
			return this.sort((a, b) => compareFn(reactive(a), reactive(b))) as any
		} finally {
			touched(this, { type: 'bunch', method: 'sort' }, range(0, this.length - 1))
		}
	}

	fill(value: any, start?: number, end?: number) {
		try {
			if (start === undefined) return this.fill(value) as any
			if (end === undefined) return this.fill(value, start) as any
			return this.fill(value, start, end) as any
		} finally {
			touched(this, { type: 'bunch', method: 'fill' }, range(0, this.length - 1))
		}
	}

	copyWithin(target: number, start: number, end?: number) {
		try {
			if (end === undefined) return this.copyWithin(target, start) as any
			return this.copyWithin(target, start, end) as any
		} finally {
			touched(
				this,
				{ type: 'bunch', method: 'copyWithin' },
				// TODO: calculate the range properly
				range(0, this.length - 1)
			)
		}
		// Touch all affected indices with a single allProps call
	}
}
