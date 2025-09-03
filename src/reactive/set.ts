import { dependant, touched, unreactive } from "./core"

const allProps = Symbol("all-props")
// TODO: think - having added(ReactiveSet), removed(ReactiveSet) and changed(ReactiveSet) as a list of changes
export class ReactiveWeakSet<T extends object> extends WeakSet<T> {
	@unreactive
	private originalSet: WeakSet<T>

	constructor(originalSet: WeakSet<T>) {
		super()
		this.originalSet = originalSet
	}

	add(value: T): this {
		const had = this.originalSet.has(value)
		this.originalSet.add(value)
		if (!had) {
			// touch the specific value and the collection view
			touched(this.originalSet, value)
			// no size/allProps for WeakSet
		}
		return this
	}

	delete(value: T): boolean {
		const had = this.originalSet.has(value)
		const res = this.originalSet.delete(value)
		if (had) touched(this.originalSet, value)
		return res
	}

	has(value: T): boolean {
		dependant(this.originalSet, value)
		return this.originalSet.has(value)
	}

	[Symbol.toStringTag]: string = "ReactiveWeakSet"
}

export class ReactiveSet<T> extends Set<T> {
	@unreactive
	private originalSet: Set<T>

	constructor(originalSet: Set<T>) {
		super()
		this.originalSet = originalSet
	}

	get size(): number {
		// size depends on the wrapper instance, like Map counterpart
		dependant(this, "size")
		return this.originalSet.size
	}

	add(value: T): this {
		const had = this.originalSet.has(value)
		this.originalSet.add(value)
		if (!had) {
			// touch for value-specific and aggregate dependencies
			touched(this.originalSet, value)
			touched(this, "size")
			touched(this, allProps)
		}
		return this
	}

	clear(): void {
		const hadEntries = this.originalSet.size > 0
		this.originalSet.clear()
		if (hadEntries) {
			touched(this, "size")
			touched(this, allProps)
		}
	}

	delete(value: T): boolean {
		const had = this.originalSet.has(value)
		const res = this.originalSet.delete(value)
		if (had) {
			touched(this.originalSet, value)
			touched(this, "size")
			touched(this, allProps)
		}
		return res
	}

	has(value: T): boolean {
		dependant(this.originalSet, value)
		return this.originalSet.has(value)
	}

	entries(): SetIterator<[T, T]> {
		dependant(this, allProps)
		return this.originalSet.entries()
	}

	forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: any): void {
		dependant(this, allProps)
		this.originalSet.forEach(callbackfn, thisArg)
	}

	keys(): SetIterator<T> {
		dependant(this, allProps)
		return this.originalSet.keys()
	}

	values(): SetIterator<T> {
		dependant(this, allProps)
		return this.originalSet.values()
	}

	[Symbol.iterator](): SetIterator<T> {
		dependant(this, allProps)
		return this.originalSet[Symbol.iterator]()
	}

	[Symbol.toStringTag]: string = "Set"
}
