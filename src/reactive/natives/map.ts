import {
	dependant,
	makeReactiveEntriesIterator,
	makeReactiveIterator,
	prototypeForwarding,
	reactive,
	touched,
	touched1,
} from '../core'

const native = Symbol('native')

/**
 * Reactive wrapper around JavaScript's WeakMap class
 * Only tracks individual key operations, no size tracking (WeakMap limitation)
 */
export class ReactiveWeakMap<K extends object, V> {
	declare readonly [native]: WeakMap<K, V>
	declare readonly content: symbol
	constructor(original: WeakMap<K, V>) {
		Object.defineProperties(this, {
			[native]: { value: original },
			[prototypeForwarding]: { value: original },
			content: { value: Symbol('content') },
			[Symbol.toStringTag]: { value: 'ReactiveWeakMap' },
		})
	}

	// Implement WeakMap interface methods with reactivity
	delete(key: K): boolean {
		const hadKey = this[native].has(key)
		const result = this[native].delete(key)

		if (hadKey) touched1(this.content, { type: 'del', prop: key }, key)

		return result
	}

	get(key: K): V | undefined {
		dependant(this.content, key)
		return reactive(this[native].get(key))
	}

	has(key: K): boolean {
		dependant(this.content, key)
		return this[native].has(key)
	}

	set(key: K, value: V): this {
		// Trigger effects for the specific key
		touched1(this.content, { type: this[native].has(key) ? 'set' : 'add', prop: key }, key)
		this[native].set(key, value)

		return this
	}
}

/**
 * Reactive wrapper around JavaScript's Map class
 * Tracks size changes, individual key operations, and collection-wide operations
 */
export class ReactiveMap<K, V> {
	declare readonly [native]: Map<K, V>
	declare readonly content: symbol

	constructor(original: Map<K, V>) {
		Object.defineProperties(this, {
			[native]: { value: original },
			[prototypeForwarding]: { value: original },
			content: { value: Symbol('content') },
			[Symbol.toStringTag]: { value: 'ReactiveMap' },
		})
	}

	// Implement Map interface methods with reactivity
	get size(): number {
		dependant(this, 'size') // The ReactiveMap instance still goes through proxy
		return this[native].size
	}

	clear(): void {
		const hadEntries = this[native].size > 0
		this[native].clear()

		if (hadEntries) {
			const evolution = { type: 'bunch', method: 'clear' } as const
			// Clear triggers all effects since all keys are affected
			touched1(this, evolution, 'size')
			touched(this.content, evolution)
		}
	}

	entries(): Generator<[K, V]> {
		dependant(this.content)
		return makeReactiveEntriesIterator(this[native].entries())
	}

	forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
		dependant(this.content)
		this[native].forEach(callbackfn, thisArg)
	}

	keys(): MapIterator<K> {
		dependant(this.content)
		return this[native].keys()
	}

	values(): Generator<V> {
		dependant(this.content)
		return makeReactiveIterator(this[native].values())
	}

	[Symbol.iterator](): Iterator<[K, V]> {
		dependant(this.content)
		const nativeIterator = this[native][Symbol.iterator]()
		return {
			next() {
				const result = nativeIterator.next()
				if (result.done) {
					return result
				}
				return {
					value: [result.value[0], reactive(result.value[1])],
					done: false,
				}
			},
		}
	}

	// Implement Map methods with reactivity
	delete(key: K): boolean {
		const hadKey = this[native].has(key)
		const result = this[native].delete(key)

		if (hadKey) {
			const evolution = { type: 'del', prop: key } as const
			touched1(this.content, evolution, key)
			touched1(this, evolution, 'size')
		}

		return result
	}

	get(key: K): V | undefined {
		dependant(this.content, key)
		return reactive(this[native].get(key))
	}

	has(key: K): boolean {
		dependant(this.content, key)
		return this[native].has(key)
	}

	set(key: K, value: V): this {
		const hadKey = this[native].has(key)
		const oldValue = this[native].get(key)
		const reactiveValue = reactive(value)
		this[native].set(key, reactiveValue)

		if (!hadKey || oldValue !== reactiveValue) {
			const evolution = { type: hadKey ? 'set' : 'add', prop: key } as const
			touched1(this.content, evolution, key)
			touched1(this, evolution, 'size')
		}

		return this
	}
}
