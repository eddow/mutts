import { dependant, prototypeForwarding, reactive, touched, touched1 } from './core'

const native = Symbol('native')

// TODO: [prototypeForwarding]

export class ReactiveWeakSet<T extends object> {
	declare readonly [native]: WeakSet<T>
	declare readonly content: symbol

	constructor(original: WeakSet<T>) {
		Object.defineProperties(this, {
			[native]: { value: original },
			[prototypeForwarding]: { value: original },
			content: { value: Symbol('content') },
			[Symbol.toStringTag]: { value: 'ReactiveWeakSet' },
		})
	}

	add(value: T): this {
		const had = this[native].has(value)
		this[native].add(value)
		if (!had) {
			// touch the specific value and the collection view
			touched1(this.content, { type: 'add', prop: value }, value)
			// no size/allProps for WeakSet
		}
		return this
	}

	delete(value: T): boolean {
		const had = this[native].has(value)
		const res = this[native].delete(value)
		if (had) touched1(this.content, { type: 'del', prop: value }, value)
		return res
	}

	has(value: T): boolean {
		dependant(this.content, value)
		return this[native].has(value)
	}
}

export class ReactiveSet<T> {
	declare readonly [native]: Set<T>
	declare readonly content: symbol
	constructor(original: Set<T>) {
		Object.defineProperties(this, {
			[native]: { value: original },
			[prototypeForwarding]: { value: original },
			content: { value: Symbol('content') },
			[Symbol.toStringTag]: { value: 'ReactiveSet' },
		})
	}

	get size(): number {
		// size depends on the wrapper instance, like Map counterpart
		dependant(this, 'size')
		return this[native].size
	}

	add(value: T): this {
		const had = this[native].has(value)
		const reactiveValue = reactive(value)
		this[native].add(reactiveValue)
		if (!had) {
			const evolution = { type: 'add', prop: reactiveValue } as const
			// touch for value-specific and aggregate dependencies
			touched1(this.content, evolution, reactiveValue)
			touched1(this, evolution, 'size')
		}
		return this
	}

	clear(): void {
		const hadEntries = this[native].size > 0
		this[native].clear()
		if (hadEntries) {
			const evolution = { type: 'bunch', method: 'clear' } as const
			touched1(this, evolution, 'size')
			touched(this.content, evolution)
		}
	}

	delete(value: T): boolean {
		const had = this[native].has(value)
		const res = this[native].delete(value)
		if (had) {
			const evolution = { type: 'del', prop: value } as const
			touched1(this.content, evolution, value)
			touched1(this, evolution, 'size')
		}
		return res
	}

	has(value: T): boolean {
		dependant(this.content, value)
		return this[native].has(value)
	}

	entries(): SetIterator<[T, T]> {
		dependant(this.content)
		return this[native].entries().map(([key, value]) => [reactive(key), reactive(value)])
	}

	forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: any): void {
		dependant(this.content)
		this[native].forEach(callbackfn, thisArg)
	}

	keys(): SetIterator<T> {
		dependant(this.content)
		return this[native].keys().map((key) => reactive(key))
	}

	values(): SetIterator<T> {
		dependant(this.content)
		return this[native].values().map((value) => reactive(value))
	}

	[Symbol.iterator](): Iterator<T> {
		dependant(this.content)
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
}
