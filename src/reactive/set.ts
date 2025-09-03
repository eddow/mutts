import { allProps, dependant, touched, unreactive } from './core'

// TODO: think - having added(ReactiveSet), removed(ReactiveSet) and changed(ReactiveSet) as a list of changes
const original = Symbol('original')
export class ReactiveWeakSet<T extends object> extends WeakSet<T> {
	@unreactive
	declare readonly [original]: WeakSet<T>

	constructor(originalSet: WeakSet<T>) {
		super()
		Object.defineProperty(this, original, {
			value: originalSet,
			enumerable: false,
			configurable: false,
		})
	}

	add(value: T): this {
		const had = this[original].has(value)
		this[original].add(value)
		if (!had) {
			// touch the specific value and the collection view
			touched(this[original], value, { type: 'add', prop: value })
			// no size/allProps for WeakSet
		}
		return this
	}

	delete(value: T): boolean {
		const had = this[original].has(value)
		const res = this[original].delete(value)
		if (had) touched(this[original], value, { type: 'del', prop: value })
		return res
	}

	has(value: T): boolean {
		dependant(this[original], value)
		return this[original].has(value)
	}

	[Symbol.toStringTag]: string = 'ReactiveWeakSet'
}

export class ReactiveSet<T> extends Set<T> {
	@unreactive
	declare readonly [original]: Set<T>

	constructor(originalSet: Set<T>) {
		super()
		Object.defineProperty(this, original, {
			value: originalSet,
			enumerable: false,
			configurable: false,
		})
	}

	get size(): number {
		// size depends on the wrapper instance, like Map counterpart
		dependant(this, 'size')
		return this[original].size
	}

	add(value: T): this {
		const had = this[original].has(value)
		this[original].add(value)
		if (!had) {
			const evolution = { type: 'add', prop: value } as const
			// touch for value-specific and aggregate dependencies
			touched(this[original], value, evolution)
			touched(this, 'size', evolution)
			touched(this[original], allProps, evolution)
		}
		return this
	}

	clear(): void {
		const hadEntries = this[original].size > 0
		this[original].clear()
		if (hadEntries) {
			const evolution = { type: 'clear' } as const
			touched(this, 'size', evolution)
			touched(this[original], allProps, evolution)
		}
	}

	delete(value: T): boolean {
		const had = this[original].has(value)
		const res = this[original].delete(value)
		if (had) {
			const evolution = { type: 'del', prop: value } as const
			touched(this[original], value, evolution)
			touched(this, 'size', evolution)
			touched(this[original], allProps, evolution)
		}
		return res
	}

	has(value: T): boolean {
		dependant(this[original], value)
		return this[original].has(value)
	}

	entries(): SetIterator<[T, T]> {
		dependant(this[original], allProps)
		return this[original].entries()
	}

	forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: any): void {
		dependant(this[original], allProps)
		this[original].forEach(callbackfn, thisArg)
	}

	keys(): SetIterator<T> {
		dependant(this[original], allProps)
		return this[original].keys()
	}

	values(): SetIterator<T> {
		dependant(this[original], allProps)
		return this[original].values()
	}

	[Symbol.iterator](): SetIterator<T> {
		dependant(this[original], allProps)
		return this[original][Symbol.iterator]()
	}

	[Symbol.toStringTag]: string = 'Set'
}
