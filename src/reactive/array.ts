import { FoolProof } from '../utils'
import { touched } from './change'
import { makeReactiveEntriesIterator, makeReactiveIterator } from './non-reactive'
import { reactive } from './proxy'
import { dependant } from './tracking'
import { keysOf, unwrap } from './types'

function* index(i: number, { length = true } = {}): IterableIterator<number | 'length'> {
	if (length) yield 'length'
	yield i
}
export abstract class Indexer extends Array {
	get(i: number): any {
		dependant(this, i)
		return reactive(this[i])
	}
	// Returns undefined intentionally: signals the proxy handler that notifications
	// were already dispatched via touched(), preventing double notification
	set(i: number, value: any) {
		const added = i >= this.length
		this[i] = value
		touched(this, { type: 'set', prop: i }, index(i, { length: added }))
	}
}
const indexLess = { get: FoolProof.get, set: FoolProof.set }
// Fast numeric-string check: first char is a digit (0-9)
function asIndex(prop: string): number {
	const c = prop.charCodeAt(0)
	if (c < 48 || c > 57) return -1 // not 0-9
	const n = +prop // coerce — faster than parseInt, handles "0", "12", etc.
	return n === (n | 0) && n >= 0 ? n : -1
}
Object.assign(FoolProof, {
	get(obj: any, prop: any, receiver: any) {
		if (Array.isArray(obj) && typeof prop === 'string') {
			const i = asIndex(prop)
			if (i >= 0) return Indexer.prototype.get.call(obj, i)
		}
		return indexLess.get(obj, prop, receiver)
	},
	set(obj: any, prop: any, value: any, receiver: any) {
		if (Array.isArray(obj) && typeof prop === 'string') {
			const i = asIndex(prop)
			if (i >= 0) return Indexer.prototype.set.call(obj, i, value)
		}
		return indexLess.set(obj, prop, value, receiver)
	},
})

export abstract class ReactiveArray extends Array {
	toJSON() {
		return this
	}
}
/**
 * This is a wrapper class for Array that adds reactive behavior.
 * It extends Array and overrides methods to add reactive behavior, while making sure that the internal representation is not reactive.
 */
export abstract class ReactiveArrayWrapper extends Array {
	at(index: number): any {
		return reactive(super.at(index))
	}

	concat(...items: any[]): any[] {
		return reactive(super.concat(...items.map(unwrap)))
	}

	entries(): any {
		dependant(this, keysOf)
		return makeReactiveEntriesIterator(super.entries())
	}

	every<S>(
		predicate: (value: any, index: number, array: any[]) => value is S,
		thisArg?: any
	): this is S[]
	every(predicate: (value: any, index: number, array: any[]) => unknown, thisArg?: any): boolean
	every(predicate: (value: any, index: number, array: any[]) => any, thisArg?: any): any {
		return super.every((v, i, a) => predicate.call(thisArg, reactive(v), i, a), thisArg)
	}

	fill(value: any, start?: number, end?: number): this {
		return super.fill(unwrap(value), start, end) as this
	}

	filter<S>(predicate: (value: any, index: number, array: any[]) => value is S, thisArg?: any): S[]
	filter(predicate: (value: any, index: number, array: any[]) => unknown, thisArg?: any): any[]
	filter(predicate: (value: any, index: number, array: any[]) => unknown, thisArg?: any): any {
		return reactive(super.filter((v, i, a) => predicate.call(thisArg, reactive(v), i, a), thisArg))
	}

	find<S>(
		predicate: (value: any, index: number, array: any[]) => value is S,
		thisArg?: any
	): S | undefined
	find(
		predicate: (value: any, index: number, array: any[]) => unknown,
		thisArg?: any
	): any | undefined
	find(predicate: (value: any, index: number, array: any[]) => unknown, thisArg?: any): any {
		return reactive(super.find((v, i, a) => predicate.call(thisArg, reactive(v), i, a), thisArg))
	}

	findIndex(
		predicate: (value: any, index: number, array: any[]) => unknown,
		thisArg?: any
	): number {
		return super.findIndex((v, i, a) => predicate.call(thisArg, reactive(v), i, a), thisArg)
	}

	findLast<S>(
		predicate: (value: any, index: number, array: any[]) => value is S,
		thisArg?: any
	): S | undefined
	findLast(
		predicate: (value: any, index: number, array: any[]) => unknown,
		thisArg?: any
	): any | undefined
	findLast(predicate: (value: any, index: number, array: any[]) => unknown, thisArg?: any): any {
		return reactive(
			super.findLast((v, i, a) => predicate.call(thisArg, reactive(v), i, a), thisArg)
		)
	}

	findLastIndex(
		predicate: (value: any, index: number, array: any[]) => unknown,
		thisArg?: any
	): number {
		return super.findLastIndex((v, i, a) => predicate.call(thisArg, reactive(v), i, a), thisArg)
	}

	flat(depth?: number): any[] {
		return reactive(super.flat(depth))
	}

	flatMap(callbackfn: (value: any, index: number, array: any[]) => any, thisArg?: any): any[] {
		return reactive(
			super.flatMap((v, i, a) => unwrap(callbackfn.call(thisArg, reactive(v), i, a)), thisArg)
		)
	}

	forEach(callbackfn: (value: any, index: number, array: any[]) => void, thisArg?: any): void {
		super.forEach((v, i, a) => callbackfn.call(thisArg, reactive(v), i, a), thisArg)
	}

	includes(searchElement: any, fromIndex?: number): boolean {
		return arguments.length > 1
			? super.includes(unwrap(searchElement), fromIndex)
			: super.includes(unwrap(searchElement))
	}

	indexOf(searchElement: any, fromIndex?: number): number {
		return arguments.length > 1
			? super.indexOf(unwrap(searchElement), fromIndex)
			: super.indexOf(unwrap(searchElement))
	}

	join(separator?: string): string {
		return super.join(separator)
	}

	keys(): any {
		dependant(this, 'length')
		return super.keys()
	}

	lastIndexOf(searchElement: any, fromIndex?: number): number {
		return arguments.length > 1
			? super.lastIndexOf(unwrap(searchElement), fromIndex)
			: super.lastIndexOf(unwrap(searchElement))
	}

	map<U>(callbackfn: (value: any, index: number, array: any[]) => U, thisArg?: any): U[] {
		return reactive(
			super.map((v, i, a) => unwrap(callbackfn.call(thisArg, reactive(v), i, a)), thisArg)
		)
	}

	pop(): any {
		return reactive(super.pop())
	}

	push(...items: any[]): number {
		return super.push(...items.map(unwrap))
	}

	reduce(
		callbackfn: (acc: any, value: any, index: number, array: any[]) => any,
		initialValue?: any
	): any {
		return reactive(
			arguments.length > 1
				? super.reduce((acc, v, i, a) => unwrap(callbackfn(acc, reactive(v), i, a)), initialValue)
				: super.reduce((acc, v, i, a) => unwrap(callbackfn(acc, reactive(v), i, a)))
		)
	}

	reduceRight(
		callbackfn: (acc: any, value: any, index: number, array: any[]) => any,
		initialValue?: any
	): any {
		return reactive(
			arguments.length > 1
				? super.reduceRight(
						(acc, v, i, a) => unwrap(callbackfn(acc, reactive(v), i, a)),
						initialValue
					)
				: super.reduceRight((acc, v, i, a) => unwrap(callbackfn(acc, reactive(v), i, a)))
		)
	}

	reverse(): any[] {
		return reactive(super.reverse())
	}

	shift(): any {
		return reactive(super.shift())
	}

	slice(start?: number, end?: number): any[] {
		return reactive(super.slice(start, end))
	}

	some<S>(
		predicate: (value: any, index: number, array: any[]) => value is S,
		thisArg?: any
	): this is S[]
	some(predicate: (value: any, index: number, array: any[]) => unknown, thisArg?: any): boolean
	some(predicate: (value: any, index: number, array: any[]) => any, thisArg?: any): any {
		return super.some((v, i, a) => predicate.call(thisArg, reactive(v), i, a), thisArg)
	}

	sort(compareFn?: (a: any, b: any) => number): this {
		const wrappedCompare = compareFn
			? (a: any, b: any) => compareFn(reactive(a), reactive(b))
			: undefined
		return super.sort(wrappedCompare) as this
	}

	splice(start: number, deleteCount?: number, ...items: any[]): any {
		if (arguments.length > 2)
			return reactive(super.splice(start, deleteCount!, ...items.map(unwrap)))
		if (arguments.length === 2) return reactive(super.splice(start, deleteCount!))
		if (arguments.length === 1) return reactive(super.splice(start))
		return reactive([])
	}

	unshift(...items: any[]): number {
		return super.unshift(...items.map(unwrap))
	}

	values(): any {
		dependant(this, keysOf)
		return makeReactiveIterator(super.values())
	}

	[Symbol.iterator](): any {
		dependant(this, keysOf)
		return makeReactiveIterator(super[Symbol.iterator]())
	}

	toReversed(): any[] {
		return reactive(super.toReversed())
	}

	toSorted(compareFn?: (a: any, b: any) => number): any[] {
		const wrappedCompare = compareFn
			? (a: any, b: any) => compareFn(reactive(a), reactive(b))
			: undefined
		return reactive(super.toSorted(wrappedCompare))
	}

	toSpliced(start: number, deleteCount?: number, ...items: any[]): any {
		if (arguments.length > 2)
			return reactive(super.toSpliced(start, deleteCount!, ...items.map(unwrap)))
		if (arguments.length === 2) return reactive(super.toSpliced(start, deleteCount!))
		if (arguments.length === 1) return reactive(super.toSpliced(start))
		return reactive([...this])
	}

	with(index: number, value: any): any[] {
		return reactive(super.with(index, unwrap(value)))
	}
}
