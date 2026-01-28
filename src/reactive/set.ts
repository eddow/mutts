import { touched, touched1 } from './change'
import { makeReactiveEntriesIterator, makeReactiveIterator } from './non-reactive'
import { reactive } from './proxy'
import { dependant } from './tracking'
import { bunch } from './utils'

const native = Symbol('native')

/**
 * Reactive wrapper around JavaScript's WeakSet class
 * Only tracks individual value operations, no size tracking (WeakSet limitation)
 */
export abstract class ReactiveWeakSet<T extends object> extends WeakSet<T> {
	get [Symbol.toStringTag]() {
		return 'ReactiveWeakSet'
	}
	add(value: T): this {
		const had = this.has(value)
		this.add(value)
		if (!had) {
			// touch the specific value and the collection view
			touched1(bunch(this), { type: 'add', prop: value }, value)
			// no size/allProps for WeakSet
		}
		return this
	}

	delete(value: T): boolean {
		const had = this.has(value)
		const res = this.delete(value)
		if (had) touched1(bunch(this), { type: 'del', prop: value }, value)
		return res
	}

	has(value: T): boolean {
		dependant(bunch(this), value)
		return this.has(value)
	}
}

/**
 * Reactive wrapper around JavaScript's Set class
 * Tracks size changes, individual value operations, and collection-wide operations
 */
export abstract class ReactiveSet<T> extends Set<T> {
	get [Symbol.toStringTag]() {
		return 'ReactiveSet'
	}

	get size(): number {
		// size depends on the wrapper instance, like Map counterpart
		dependant(this, 'size')
		return this.size
	}

	add(value: T): this {
		const had = this.has(value)
		const reactiveValue = reactive(value)
		this.add(reactiveValue)
		if (!had) {
			const evolution = { type: 'add', prop: reactiveValue } as const
			// touch for value-specific and aggregate dependencies
			touched1(bunch(this), evolution, reactiveValue)
			touched1(this, evolution, 'size')
		}
		return this
	}

	clear(): void {
		const hadEntries = this.size > 0
		this.clear()
		if (hadEntries) {
			const evolution = { type: 'bunch', method: 'clear' } as const
			touched1(this, evolution, 'size')
			touched(bunch(this), evolution)
		}
	}

	delete(value: T): boolean {
		const had = this.has(value)
		const res = this.delete(value)
		if (had) {
			const evolution = { type: 'del', prop: value } as const
			touched1(bunch(this), evolution, value)
			touched1(this, evolution, 'size')
		}
		return res
	}

	has(value: T): boolean {
		dependant(bunch(this), value)
		return this.has(value)
	}

	entries(): Generator<[T, T]> {
		dependant(bunch(this))
		return makeReactiveEntriesIterator(this.entries())
	}

	forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: any): void {
		dependant(bunch(this))
		this.forEach(callbackfn, thisArg)
	}

	keys(): Generator<T> {
		dependant(bunch(this))
		return makeReactiveIterator(this.keys())
	}

	values(): Generator<T> {
		dependant(bunch(this))
		return makeReactiveIterator(this.values())
	}

	[Symbol.iterator](): SetIterator<T> {
		dependant(bunch(this))
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
		}
	}
}
