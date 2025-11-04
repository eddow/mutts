/**
 * Symbol for defining custom getter logic for numeric index access
 */
export const getAt = Symbol('getAt')
/**
 * Symbol for defining custom setter logic for numeric index access
 */
export const setAt = Symbol('setAt')

interface IndexingAt<Items = any> {
	[getAt](index: number): Items
}

interface Accessor<T, Items> {
	get(this: T, index: number): Items
	set?(this: T, index: number, value: Items): void
	getLength?(this: T): number
	setLength?(this: T, value: number): void
}

abstract class AbstractGetAt<Items = any> {
	abstract [getAt](index: number): Items
}

/**
 * Creates an indexable class with a base class and accessor object
 * @param base - The base class to extend
 * @param accessor - Object containing get/set methods for numeric index access
 * @returns A class that supports numeric index access
 */
export function Indexable<Items, Base extends abstract new (...args: any[]) => any>(
	base: Base,
	accessor: Accessor<InstanceType<Base>, Items>
): new (
	...args: ConstructorParameters<Base>
) => InstanceType<Base> & { [x: number]: Items }

/**
 * Creates an indexable class with only an accessor object (no base class)
 * @param accessor - Object containing get/set methods for numeric index access
 * @returns A class that supports numeric index access
 */
export function Indexable<Items>(accessor: Accessor<any, Items>): new () => { [x: number]: Items }

/**
 * Creates an indexable class with a base class that has [getAt] method
 * @param base - The base class that implements [getAt] method
 * @returns A class that supports numeric index access using the base class's [getAt] method
 */
export function Indexable<Base extends new (...args: any[]) => IndexingAt>(
	base: Base
): new (
	...args: ConstructorParameters<Base>
) => InstanceType<Base> & { [x: number]: AtReturnType<InstanceType<Base>> }

/**
 * Creates an abstract indexable base class
 * @returns An abstract class that supports numeric index access
 */
export function Indexable<Items>(): abstract new (
	...args: any[]
) => AbstractGetAt & { [x: number]: Items }

export function Indexable<Items, Base extends abstract new (...args: any[]) => any>(
	base?: Base | Accessor<Base, Items>,
	accessor?: Accessor<Base, Items>
) {
	if (base && typeof base !== 'function') {
		accessor = base as Accessor<Base, Items>
		base = undefined
	}
	if (!base) {
		//@ts-expect-error
		base = class {} as Base
	}
	if (!accessor) {
		accessor = {
			get(this: any, index: number) {
				if (typeof this[getAt] !== 'function') {
					throw new Error('Indexable class must have an [getAt] method')
				}
				return this[getAt](index)
			},
			set(this: any, index: number, value: Items) {
				if (typeof this[setAt] !== 'function') {
					throw new Error('Indexable class has read-only numeric index access')
				}
				this[setAt](index, value)
			},
		}
	}

	abstract class Indexable extends (base as Base) {
		[x: number]: Items
	}

	Object.setPrototypeOf(
		Indexable.prototype,
		new Proxy((base as Base).prototype, {
			//@ts-expect-error
			[Symbol.toStringTag]: 'MutTs Indexable',
			get(target, prop, receiver) {
				if (prop in target) {
					const getter = Object.getOwnPropertyDescriptor(target, prop)?.get
					return getter ? getter.call(receiver) : target[prop]
				}
				if (typeof prop === 'string') {
					if (prop === 'length' && accessor.getLength) return accessor.getLength.call(receiver)
					const numProp = Number(prop)
					if (!Number.isNaN(numProp)) {
						return accessor.get!.call(receiver, numProp) as Items
					}
				}
				return undefined
			},
			set(target, prop, value, receiver) {
				if (prop in target) {
					const setter = Object.getOwnPropertyDescriptor(target, prop)?.set
					if (setter) setter.call(receiver, value)
					else target[prop] = value
					return true
				}
				if (typeof prop === 'string') {
					if (prop === 'length' && accessor.setLength) {
						accessor.setLength.call(receiver, value)
						return true
					}
					const numProp = Number(prop)
					if (!Number.isNaN(numProp)) {
						if (!accessor.set) {
							throw new Error('Indexable class has read-only numeric index access')
						}
						accessor.set!.call(receiver, numProp, value)
						return true
					}
				}
				Object.defineProperty(receiver, prop, {
					value,
					writable: true,
					enumerable: true,
					configurable: true,
				})
				return true
			},
		})
	)
	return Indexable
}

type AtReturnType<T> = T extends { [getAt](index: number): infer R } ? R : never

/**
 * Symbol for accessing the forwarded array in ArrayReadForward
 */
export const forwardArray = Symbol('forwardArray')

/**
 * A read-only array forwarder that implements all reading/iterating methods of Array
 * but does not implement modification methods.
 *
 * The constructor takes a callback that returns an array, and all methods forward
 * their behavior to the result of that callback.
 */
export class ArrayReadForward<T> {
	protected get [forwardArray](): readonly T[] {
		throw new Error('ArrayReadForward is not implemented')
	}

	/**
	 * Get the length of the array
	 */
	get length(): number {
		return this[forwardArray].length
	}

	/**
	 * Get an element at a specific index
	 */
	[index: number]: T | undefined

	/**
	 * Iterator protocol support
	 */
	[Symbol.iterator](): Iterator<T> {
		return this[forwardArray][Symbol.iterator]()
	}

	// Reading/Iterating methods

	/**
	 * Creates a new array with the results of calling a provided function on every element
	 */
	map<U>(callbackfn: (value: T, index: number, array: readonly T[]) => U, thisArg?: any): U[] {
		return this[forwardArray].map(callbackfn, thisArg)
	}

	/**
	 * Creates a new array with all elements that pass the test implemented by the provided function
	 */
	filter<S extends T>(
		predicate: (value: T, index: number, array: readonly T[]) => value is S,
		thisArg?: any
	): S[]
	filter(predicate: (value: T, index: number, array: readonly T[]) => unknown, thisArg?: any): T[]
	filter(predicate: (value: T, index: number, array: readonly T[]) => unknown, thisArg?: any): T[] {
		return this[forwardArray].filter(predicate, thisArg)
	}

	/**
	 * Executes a reducer function on each element of the array, resulting in a single output value
	 */
	reduce(
		callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: readonly T[]) => T
	): T
	reduce(
		callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: readonly T[]) => T,
		initialValue: T
	): T
	reduce<U>(
		callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: readonly T[]) => U,
		initialValue: U
	): U
	reduce(
		callbackfn: (
			previousValue: any,
			currentValue: T,
			currentIndex: number,
			array: readonly T[]
		) => any,
		initialValue?: any
	): any {
		return initialValue !== undefined
			? this[forwardArray].reduce(callbackfn, initialValue)
			: this[forwardArray].reduce(callbackfn)
	}

	/**
	 * Executes a reducer function on each element of the array (right-to-left), resulting in a single output value
	 */
	reduceRight(
		callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: readonly T[]) => T
	): T
	reduceRight(
		callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: readonly T[]) => T,
		initialValue: T
	): T
	reduceRight<U>(
		callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: readonly T[]) => U,
		initialValue: U
	): U
	reduceRight(
		callbackfn: (
			previousValue: any,
			currentValue: T,
			currentIndex: number,
			array: readonly T[]
		) => any,
		initialValue?: any
	): any {
		return initialValue !== undefined
			? this[forwardArray].reduceRight(callbackfn, initialValue)
			: this[forwardArray].reduceRight(callbackfn)
	}

	/**
	 * Executes a provided function once for each array element
	 */
	forEach(callbackfn: (value: T, index: number, array: readonly T[]) => void, thisArg?: any): void {
		this[forwardArray].forEach(callbackfn, thisArg)
	}

	/**
	 * Returns the value of the first element in the array that satisfies the provided testing function
	 */
	find<S extends T>(
		predicate: (value: T, index: number, array: readonly T[]) => value is S,
		thisArg?: any
	): S | undefined
	find(
		predicate: (value: T, index: number, array: readonly T[]) => unknown,
		thisArg?: any
	): T | undefined
	find(
		predicate: (value: T, index: number, array: readonly T[]) => unknown,
		thisArg?: any
	): T | undefined {
		return this[forwardArray].find(predicate, thisArg)
	}

	/**
	 * Returns the index of the first element in the array that satisfies the provided testing function
	 */
	findIndex(
		predicate: (value: T, index: number, array: readonly T[]) => unknown,
		thisArg?: any
	): number {
		return this[forwardArray].findIndex(predicate, thisArg)
	}

	/**
	 * Returns the value of the last element in the array that satisfies the provided testing function
	 */
	findLast<S extends T>(
		predicate: (value: T, index: number, array: readonly T[]) => value is S,
		thisArg?: any
	): S | undefined
	findLast(
		predicate: (value: T, index: number, array: readonly T[]) => unknown,
		thisArg?: any
	): T | undefined
	findLast(
		predicate: (value: T, index: number, array: readonly T[]) => unknown,
		thisArg?: any
	): T | undefined {
		return this[forwardArray].findLast(predicate, thisArg)
	}

	/**
	 * Returns the index of the last element in the array that satisfies the provided testing function
	 */
	findLastIndex(
		predicate: (value: T, index: number, array: readonly T[]) => unknown,
		thisArg?: any
	): number {
		return this[forwardArray].findLastIndex(predicate, thisArg)
	}

	/**
	 * Determines whether an array includes a certain value among its entries
	 */
	includes(searchElement: T, fromIndex?: number): boolean {
		return this[forwardArray].includes(searchElement, fromIndex)
	}

	/**
	 * Returns the first index at which a given element can be found in the array
	 */
	indexOf(searchElement: T, fromIndex?: number): number {
		return this[forwardArray].indexOf(searchElement, fromIndex)
	}

	/**
	 * Returns the last index at which a given element can be found in the array
	 */
	lastIndexOf(searchElement: T, fromIndex?: number): number {
		return this[forwardArray].lastIndexOf(searchElement, fromIndex)
	}

	/**
	 * Returns a shallow copy of a portion of an array into a new array object
	 */
	slice(start?: number, end?: number): T[] {
		return this[forwardArray].slice(start, end)
	}

	/**
	 * Returns a new array comprised of this array joined with other array(s) and/or value(s)
	 */
	concat(...items: ConcatArray<T>[]): T[]
	concat(...items: (T | ConcatArray<T>)[]): T[]
	concat(...items: (T | ConcatArray<T>)[]): T[] {
		return this[forwardArray].concat(...items)
	}

	/**
	 * Tests whether all elements in the array pass the test implemented by the provided function
	 */
	every(
		predicate: (value: T, index: number, array: readonly T[]) => unknown,
		thisArg?: any
	): boolean {
		return this[forwardArray].every(predicate, thisArg)
	}

	/**
	 * Tests whether at least one element in the array passes the test implemented by the provided function
	 */
	some(
		predicate: (value: T, index: number, array: readonly T[]) => unknown,
		thisArg?: any
	): boolean {
		return this[forwardArray].some(predicate, thisArg)
	}

	/**
	 * Joins all elements of an array into a string
	 */
	join(separator?: string): string {
		return this[forwardArray].join(separator)
	}

	/**
	 * Returns a new array iterator that contains the keys for each index in the array
	 */
	keys(): IterableIterator<number> {
		return this[forwardArray].keys()
	}

	/**
	 * Returns a new array iterator that contains the values for each index in the array
	 */
	values(): IterableIterator<T> {
		return this[forwardArray].values()
	}

	/**
	 * Returns a new array iterator that contains the key/value pairs for each index in the array
	 */
	entries(): IterableIterator<[number, T]> {
		return this[forwardArray].entries()
	}

	/**
	 * Returns a string representation of the array
	 */
	toString(): string {
		return this[forwardArray].toString()
	}

	/**
	 * Returns a localized string representing the array
	 */
	toLocaleString(
		locales?: string | string[],
		options?: Intl.NumberFormatOptions | Intl.DateTimeFormatOptions
	): string {
		return this[forwardArray].toLocaleString(locales, options)
	}

	/**
	 * Returns the element at the specified index, or undefined if the index is out of bounds
	 */
	at(index: number): T | undefined {
		return this[forwardArray].at(index)
	}

	/**
	 * Returns a new array with all sub-array elements concatenated into it recursively up to the specified depth
	 */
	flat(depth?: number): T[] {
		return this[forwardArray].flat(depth) as T[]
	}

	/**
	 * Returns a new array formed by applying a given callback function to each element of the array,
	 * and then flattening the result by one level
	 */
	flatMap<U, This = undefined>(
		callback: (this: This, value: T, index: number, array: readonly T[]) => U | ReadonlyArray<U>,
		thisArg?: This
	): U[] {
		return this[forwardArray].flatMap(callback as any, thisArg)
	}

	/**
	 * Returns a new array with elements in reversed order (ES2023)
	 */
	toReversed(): T[] {
		return this[forwardArray].toReversed?.() ?? [...this[forwardArray]].reverse()
	}

	/**
	 * Returns a new array with elements sorted (ES2023)
	 */
	toSorted(compareFn?: ((a: T, b: T) => number) | undefined): T[] {
		return this[forwardArray].toSorted?.(compareFn) ?? [...this[forwardArray]].sort(compareFn)
	}

	/**
	 * Returns a new array with some elements removed and/or replaced at a given index (ES2023)
	 */
	toSpliced(start: number, deleteCount?: number, ...items: T[]): T[] {
		if (this[forwardArray].toSpliced) {
			return this[forwardArray].toSpliced(start, deleteCount, ...items)
		}
		const arr = [...this[forwardArray]]
		arr.splice(start, deleteCount ?? arr.length - start, ...items)
		return arr
	}

	/**
	 * Returns a new array with the element at the given index replaced with the given value (ES2023)
	 */
	with(index: number, value: T): T[] {
		if (this[forwardArray].with) {
			return this[forwardArray].with(index, value)
		}
		const arr = [...this[forwardArray]]
		arr[index] = value
		return arr
	}
	get [Symbol.unscopables]() {
		return this[forwardArray][Symbol.unscopables]
	}
}
