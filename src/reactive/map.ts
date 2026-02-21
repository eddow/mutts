import { contentRef } from '../utils'
import { touched, touched1 } from './change'
import { notifyPropertyChange } from './deep-touch'
import { batch } from './effects'
import { makeReactiveEntriesIterator, makeReactiveIterator } from './non-reactive'
import { reactive } from './proxy'
import { dependant } from './tracking'
import { keysOf } from './types'

/**
 * Reactive wrapper around JavaScript's WeakMap class
 * Only tracks individual key operations, no size tracking (WeakMap limitation)
 */
export abstract class ReactiveWeakMap<K extends object, V> extends WeakMap<K, V> {
	// Implement WeakMap interface methods with reactivity
	delete(key: K): boolean {
		const hadKey = this.has(key)
		const result = this.delete(key)

		if (hadKey) touched1(contentRef(this), { type: 'del', prop: key }, key)

		return result
	}

	get(key: K): V | undefined {
		dependant(contentRef(this), key)
		return reactive(this.get(key))
	}

	has(key: K): boolean {
		dependant(contentRef(this), key)
		return this.has(key)
	}

	set(key: K, value: V): this {
		const hadKey = this.has(key)
		const oldValue = this.get(key)
		const reactiveValue = reactive(value)
		this.set(key, reactiveValue)

		if (!hadKey || oldValue !== reactiveValue) {
			notifyPropertyChange(contentRef(this), key, oldValue, reactiveValue, hadKey)
		}

		return this
	}
}

/**
 * Reactive wrapper around JavaScript's Map class
 * Tracks size changes, individual key operations, and collection-wide operations
 */
export abstract class ReactiveMap<K, V> extends Map<K, V> {
	// Implement Map interface methods with reactivity
	get size(): number {
		dependant(this, 'size') // The ReactiveMap instance still goes through proxy
		return this.size
	}

	clear(): void {
		const hadEntries = this.size > 0
		this.clear()

		if (hadEntries) {
			const evolution = { type: 'bunch', method: 'clear' } as const
			// Clear triggers all effects since all keys are affected
			batch(() => {
				touched1(this, evolution, 'size')
				touched(contentRef(this), evolution)
			})
		}
	}

	entries(): Generator<[K, V]> {
		dependant(contentRef(this))
		return makeReactiveEntriesIterator(this.entries())
	}

	forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
		dependant(contentRef(this))
		this.forEach(callbackfn, thisArg)
	}

	keys(): MapIterator<K> {
		dependant(contentRef(this), keysOf)
		return this.keys()
	}

	values(): Generator<V> {
		dependant(contentRef(this))
		return makeReactiveIterator(this.values())
	}

	[Symbol.iterator](): MapIterator<[K, V]> {
		dependant(contentRef(this))
		const it: MapIterator<[K, V]> = Map.prototype[Symbol.iterator].call(this)
		const nativeNext = it.next.bind(it)
		it.next = () => {
			const result = nativeNext()
			if (result.done) return result
			const [key, value] = result.value
			return { value: [reactive(key), reactive(value)], done: false }
		}
		return it
	}

	// Implement Map methods with reactivity
	delete(key: K): boolean {
		const hadKey = this.has(key)
		const result = this.delete(key)

		if (hadKey) {
			const evolution = { type: 'del', prop: key } as const
			batch(() => {
				touched1(contentRef(this), evolution, key)
				touched1(this, evolution, 'size')
			})
		}

		return result
	}

	get(key: K): V | undefined {
		dependant(contentRef(this), key)
		return reactive(this.get(key))
	}

	has(key: K): boolean {
		dependant(contentRef(this), key)
		return this.has(key)
	}

	set(key: K, value: V): this {
		const hadKey = this.has(key)
		const oldValue = this.get(key)
		const reactiveValue = reactive(value)
		this.set(key, reactiveValue)

		if (!hadKey || oldValue !== reactiveValue) {
			batch(() => {
				notifyPropertyChange(contentRef(this), key, oldValue, reactiveValue, hadKey)
				// Also notify size change for Map (WeakMap doesn't track size)
				const evolution = { type: hadKey ? 'set' : 'add', prop: key } as const
				touched1(this, evolution, 'size')
			})
		}

		return this
	}
}
