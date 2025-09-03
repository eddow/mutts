import { allProps, dependant, touched, unreactive } from './core'

const original = Symbol('original')
export class ReactiveWeakMap<K extends object, V> extends WeakMap<K, V> {
	@unreactive
	declare readonly [original]: WeakMap<K, V>

	constructor(originalMap: WeakMap<K, V>) {
		super() // Creates empty WeakMap for prototype chain only
		Object.defineProperty(this, original, {
			value: originalMap,
			enumerable: false,
			configurable: false,
		})
	}

	// Implement WeakMap interface methods with reactivity
	delete(key: K): boolean {
		const hadKey = this[original].has(key)
		const result = this[original].delete(key)

		if (hadKey) touched(this[original], key, { type: 'del', prop: key })

		return result
	}

	get(key: K): V | undefined {
		dependant(this[original], key)
		return this[original].get(key)
	}

	has(key: K): boolean {
		dependant(this[original], key)
		return this[original].has(key)
	}

	set(key: K, value: V): this {
		// Trigger effects for the specific key
		touched(this[original], key, { type: this[original].has(key) ? 'set' : 'add', prop: key })
		this[original].set(key, value)

		return this
	}

	[Symbol.toStringTag]: string = 'ReactiveWeakMap'
}

export class ReactiveMap<K, V> extends Map<K, V> {
	@unreactive
	declare readonly [original]: Map<K, V>

	constructor(originalMap: Map<K, V>) {
		super()
		Object.defineProperty(this, original, {
			value: originalMap,
			enumerable: false,
			configurable: false,
		})
	}

	// Implement Map interface methods with reactivity
	get size(): number {
		dependant(this, 'size') // The ReactiveMap instance still goes through proxy
		return this[original].size
	}

	clear(): void {
		const hadEntries = this[original].size > 0
		this[original].clear()

		if (hadEntries) {
			const evolution = { type: 'clear' } as const
			// Clear triggers all effects since all keys are affected
			touched(this, 'size', evolution)
			touched(this[original], allProps, evolution)
		}
	}

	entries(): MapIterator<[K, V]> {
		dependant(this[original], allProps)
		return this[original].entries()
	}

	forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
		dependant(this[original], allProps)
		this[original].forEach(callbackfn, thisArg)
	}

	keys(): MapIterator<K> {
		dependant(this[original], allProps)
		return this[original].keys()
	}

	values(): MapIterator<V> {
		dependant(this[original], allProps)
		return this[original].values()
	}

	[Symbol.iterator](): MapIterator<[K, V]> {
		dependant(this[original], allProps)
		return this[original][Symbol.iterator]()
	}

	[Symbol.toStringTag]: string = 'Map'

	// Implement Map methods with reactivity
	delete(key: K): boolean {
		const hadKey = this[original].has(key)
		const result = this[original].delete(key)

		if (hadKey) {
			const evolution = { type: 'del', prop: key } as const
			touched(this[original], key, evolution)
			touched(this, 'size', evolution)
			touched(this[original], allProps, evolution)
		}

		return result
	}

	get(key: K): V | undefined {
		dependant(this[original], key)
		return this[original].get(key)
	}

	has(key: K): boolean {
		dependant(this[original], key)
		return this[original].has(key)
	}

	set(key: K, value: V): this {
		const hadKey = this[original].has(key)
		const oldValue = this[original].get(key)
		this[original].set(key, value)

		if (!hadKey || oldValue !== value) {
			const evolution = { type: hadKey ? 'set' : 'add', prop: key } as const
			touched(this[original], key, evolution)
			touched(this, 'size', evolution)
			touched(this[original], allProps, evolution)
		}

		return this
	}
}
