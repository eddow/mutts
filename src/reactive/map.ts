import { touched, dependant, unreactive } from "./core"

const allProps = Symbol("all-props")

export class ReactiveWeakMap<K extends object, V> extends WeakMap<K, V> {
	@unreactive
	private originalMap: WeakMap<K, V>

	constructor(originalMap: WeakMap<K, V>) {
		super() // Creates empty WeakMap for prototype chain only
		this.originalMap = originalMap
	}

	// Implement WeakMap interface methods with reactivity
	delete(key: K): boolean {
		const hadKey = this.originalMap.has(key)
		const result = this.originalMap.delete(key)

		if (hadKey) touched(this.originalMap, key)

		return result
	}

	get(key: K): V | undefined {
		dependant(this.originalMap, key)
		return this.originalMap.get(key)
	}

	has(key: K): boolean {
		dependant(this.originalMap, key)
		return this.originalMap.has(key)
	}

	set(key: K, value: V): this {
		this.originalMap.set(key, value)

		// Trigger effects for the specific key
		touched(this.originalMap, key)

		return this
	}

	[Symbol.toStringTag]: string = "ReactiveWeakMap"
}

export class ReactiveMap<K, V> extends Map<K, V> {
	@unreactive
	private originalMap: Map<K, V>

	constructor(originalMap: Map<K, V>) {
		super()
		this.originalMap = originalMap
	}

	// Implement Map interface methods with reactivity
	get size(): number {
		dependant(this, "size") // The ReactiveMap instance still goes through proxy
		return this.originalMap.size
	}

	clear(): void {
		const hadEntries = this.originalMap.size > 0
		this.originalMap.clear()

		if (hadEntries) {
			// Clear triggers all effects since all keys are affected
			touched(this, "size")
			touched(this, allProps)
		}
	}

	entries(): MapIterator<[K, V]> {
		dependant(this, allProps)
		return this.originalMap.entries()
	}

	forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
		dependant(this, allProps)
		this.originalMap.forEach(callbackfn, thisArg)
	}

	keys(): MapIterator<K> {
		dependant(this, allProps)
		return this.originalMap.keys()
	}

	values(): MapIterator<V> {
		dependant(this, allProps)
		return this.originalMap.values()
	}

	[Symbol.iterator](): MapIterator<[K, V]> {
		dependant(this, allProps)
		return this.originalMap[Symbol.iterator]()
	}

	[Symbol.toStringTag]: string = "Map"

	// Implement Map methods with reactivity
	delete(key: K): boolean {
		const hadKey = this.originalMap.has(key)
		const result = this.originalMap.delete(key)

		if (hadKey) {
			touched(this.originalMap, key)
			touched(this, "size")
			touched(this, allProps)
		}

		return result
	}

	get(key: K): V | undefined {
		dependant(this.originalMap, key)
		return this.originalMap.get(key)
	}

	has(key: K): boolean {
		dependant(this.originalMap, key)
		return this.originalMap.has(key)
	}

	set(key: K, value: V): this {
		const hadKey = this.originalMap.has(key)
		const oldValue = this.originalMap.get(key)
		this.originalMap.set(key, value)

		if (!hadKey || oldValue !== value) {
			touched(this.originalMap, key)
			touched(this, "size")
			touched(this, allProps)
		}

		return this
	}
}
