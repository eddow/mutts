import { getAt, Indexable, setAt } from '../indexable'
import { effect } from './effects'
import { cleanedBy, unreactive } from './interface'
import { reactive } from './proxy'
import { type DependencyFunction, prototypeForwarding, type ScopedCallback } from './types'
import { untracked } from './utilities'

type KeyFunction<T, K extends PropertyKey> = (item: T) => K

const KeyedArrayBase = Indexable<any>({
	get(this: any, index: number) {
		return this[getAt](index)
	},
	set(this: any, index: number, value: any) {
		this[setAt](index, value)
	},
	getLength(this: any) {
		return this.length
	},
	setLength(this: any, value: number) {
		this.length = value
	},
})

@unreactive
class KeyedArrayClass<T, K extends PropertyKey = PropertyKey> extends KeyedArrayBase {
	readonly #keyFn: KeyFunction<T, K>
	readonly #keys: K[]
	readonly #values: Map<K, T>
	readonly #usage = new Map<K, number>()
	readonly #valueInfo = new Map<T, { key: K; stop?: ScopedCallback }>()
	readonly #keyEffects = new Set<ScopedCallback>()
	readonly #ascend: DependencyFunction

	constructor(keyFn: KeyFunction<T, K>, initial?: Iterable<T>) {
		super()
		Object.defineProperties(this, {
			[prototypeForwarding]: { value: this.#keys },
		})
		let ascendGet: DependencyFunction | undefined
		effect(({ ascend }) => {
			ascendGet = ascend
		})
		this.#ascend = ascendGet!
		if (typeof keyFn !== 'function') throw new Error('KeyedArray requires a key function')
		this.#keyFn = keyFn
		this.#keys = reactive([] as K[])
		this.#values = reactive(new Map<K, T>())
		if (initial) this.push(...initial)
	}

	private ensureKey(value: T): K {
		let info = this.#valueInfo.get(value)
		if (info) return info.key
		info = { key: undefined as unknown as K }
		this.#valueInfo.set(value, info)
		this.#ascend(() => {
			const stop = effect(({ reaction }) => {
				const nextKey = this.#keyFn(value)
				this.assertValidKey(nextKey)
				const previousKey = info!.key
				if (reaction && previousKey !== undefined && !Object.is(nextKey, previousKey))
					this.#rekeyValue(value, previousKey, nextKey)
				info!.key = nextKey
			})
			info!.stop = stop
			this.#keyEffects.add(stop)
		})
		if (info.key === undefined)
			throw new Error('KeyedArray key function must return a property key')
		return info.key
	}

	private assertValidKey(key: unknown): asserts key is K {
		const type = typeof key
		if (type !== 'string' && type !== 'number' && type !== 'symbol')
			throw new Error('KeyedArray key function must return a property key')
	}

	private setKeyValue(key: K, value: T) {
		const existing = this.#values.get(key)
		if (existing !== undefined && existing !== value) this.cleanupValue(existing)
		this.#values.set(key, value)
	}

	private cleanupValue(value: T) {
		const info = this.#valueInfo.get(value)
		if (!info) return
		const stop = info.stop
		if (stop) {
			info.stop = undefined
			this.#keyEffects.delete(stop)
			stop()
		}
		this.#valueInfo.delete(value)
	}

	private disposeKeyEffects() {
		for (const value of Array.from(this.#valueInfo.keys())) this.cleanupValue(value)
		this.#keyEffects.clear()
	}

	#rekeyValue(value: T, oldKey: K, newKey: K) {
		if (Object.is(oldKey, newKey)) return
		const existingValue = this.#values.get(newKey)
		if (existingValue !== undefined && existingValue !== value)
			throw new Error(`KeyedArray key collision for key ${String(newKey)}`)
		const count = this.#usage.get(oldKey)
		if (!count) return
		const existingCount = this.#usage.get(newKey) ?? 0
		this.setKeyValue(newKey, value)
		for (let i = 0; i < this.#keys.length; i++)
			if (Object.is(this.#keys[i], oldKey)) this.#keys[i] = newKey
		this.#usage.set(newKey, existingCount + count)
		this.#usage.delete(oldKey)
		this.#values.delete(oldKey)
		const updatedInfo = this.#valueInfo.get(value)
		if (updatedInfo) updatedInfo.key = newKey
	}

	private incrementUsage(key: K) {
		const count = this.#usage.get(key) ?? 0
		this.#usage.set(key, count + 1)
	}

	private decrementUsage(key: K) {
		const count = this.#usage.get(key)
		if (!count) return
		if (count <= 1) {
			const value = this.#values.get(key)
			this.#usage.delete(key)
			this.#values.delete(key)
			if (value !== undefined) this.cleanupValue(value)
		} else {
			this.#usage.set(key, count - 1)
		}
	}

	private normalizeIndex(index: number, allowEnd = false): number {
		const length = this.length
		let resolved = index
		if (resolved < 0) resolved = Math.max(length + resolved, 0)
		if (resolved > length) {
			if (allowEnd) resolved = length
			else throw new RangeError('Index out of bounds')
		}
		if (!allowEnd && resolved === length) throw new RangeError('Index out of bounds')
		return resolved
	}

	private assignAt(index: number, key: K, value: T) {
		const oldKey = this.#keys[index]
		if (oldKey !== undefined && Object.is(oldKey, key)) {
			this.setKeyValue(key, value)
			return
		}
		if (oldKey !== undefined) this.decrementUsage(oldKey as K)
		this.#keys[index] = key
		this.incrementUsage(key)
		this.setKeyValue(key, value)
	}

	private insertKeyValue(index: number, key: K, value: T) {
		this.#keys.splice(index, 0, key)
		this.incrementUsage(key)
		this.setKeyValue(key, value)
	}

	private rebuildFrom(values: T[]) {
		this.disposeKeyEffects()
		this.#keys.splice(0, this.#keys.length)
		this.#usage.clear()
		this.#values.clear()
		for (const value of values) {
			const key = this.ensureKey(value)
			this.#keys.push(key)
			this.incrementUsage(key)
			this.#values.set(key, value)
		}
	}

	get length(): number {
		return this.#keys.length
	}

	set length(value: number) {
		if (value < 0) throw new RangeError('Invalid length')
		if (value >= this.length) {
			if (value === this.length) return
			throw new RangeError('Increasing length directly is not supported')
		}
		for (let i = this.length - 1; i >= value; i--) this.removeAt(i)
	}

	get keys(): ArrayIterator<number> {
		return this.#keys.keys()
	}

	get values(): IterableIterator<T> {
		return this[Symbol.iterator]()
	}

	[getAt](index: number): T | undefined {
		const key = this.#keys[index]
		return key === undefined ? undefined : this.#values.get(key)
	}

	[setAt](index: number, value: T): void {
		const key = this.ensureKey(value)
		if (index === this.length) {
			this.insertKeyValue(index, key, value)
			return
		}
		const normalized = this.normalizeIndex(index)
		this.assignAt(normalized, key, value)
	}

	push(...items: T[]): number {
		for (const item of items) {
			const key = this.ensureKey(item)
			this.insertKeyValue(this.length, key, item)
		}
		return this.length
	}

	pop(): T | undefined {
		if (!this.length) return undefined
		return this.removeAt(this.length - 1)
	}

	shift(): T | undefined {
		if (!this.length) return undefined
		return this.removeAt(0)
	}

	unshift(...items: T[]): number {
		let index = 0
		for (const item of items) {
			const key = this.ensureKey(item)
			this.insertKeyValue(index++, key, item)
		}
		return this.length
	}

	splice(start: number, deleteCount?: number, ...items: T[]): T[] {
		const normalizedStart = this.normalizeIndex(start, true)
		const maxDeletions = this.length - normalizedStart
		const actualDelete = Math.min(
			deleteCount === undefined ? maxDeletions : Math.max(deleteCount, 0),
			maxDeletions
		)
		const keysToInsert: K[] = []
		for (const item of items) keysToInsert.push(this.ensureKey(item))
		const removedKeys = this.#keys.splice(normalizedStart, actualDelete, ...keysToInsert)
		const removedValues: T[] = []
		for (const key of removedKeys) {
			if (key === undefined) continue
			const value = this.#values.get(key as K)
			this.decrementUsage(key as K)
			removedValues.push(value as T)
		}
		for (let i = 0; i < keysToInsert.length; i++) {
			const key = keysToInsert[i]
			const value = items[i]
			this.incrementUsage(key)
			this.setKeyValue(key, value)
		}
		return removedValues
	}

	clear(): void {
		this.#keys.length = 0
		this.#usage.clear()
		this.#values.clear()
		this.disposeKeyEffects()
	}

	get(key: K): T | undefined {
		return this.#values.get(key)
	}
	set(key: K, value: T): void {
		if (this.#values.has(key)) this.setKeyValue(key, value)
	}

	remove(key: K) {
		let index: number = this.indexOfKey(key)
		while (index !== -1) {
			this.removeAt(index)
			index = this.indexOfKey(key)
		}
	}

	public removeAt(index: number): T | undefined {
		const [key] = this.#keys.splice(index, 1)
		if (key === undefined) return undefined
		const value = this.#values.get(key as K)
		this.decrementUsage(key as K)
		return value
	}

	hasKey(key: K): boolean {
		return this.#usage.has(key)
	}

	indexOfKey(key: K): number {
		return this.#keys.indexOf(key)
	}

	update(...values: T[]): void {
		for (const value of values) {
			const key = this.ensureKey(value)
			if (this.#values.has(key)) this.setKeyValue(key, value)
		}
	}

	upsert(insert: (value: T) => void, ...values: T[]): void {
		for (const value of values) {
			const key = this.ensureKey(value)
			if (this.#values.has(key)) this.setKeyValue(key, value)
			else insert(value)
		}
	}

	entries(): IterableIterator<[K, T | undefined]> {
		const self = this
		function* iterator(): IterableIterator<[K, T | undefined]> {
			for (let i = 0; i < self.#keys.length; i++)
				yield [self.#keys[i], self.#values.get(self.#keys[i])]
		}
		return iterator()
	}

	[Symbol.iterator](): IterableIterator<T> {
		const self = this
		function* iterator(): IterableIterator<T> {
			for (const key of self.#keys) {
				const value = self.#values.get(key)
				if (value !== undefined) yield value
			}
		}
		return iterator()
	}

	toArray(): T[] {
		return Array.from(this, (value) => value)
	}

	toString(): string {
		return `[KeyedArray length=${this.length}]`
	}

	at(index: number): T | undefined {
		const resolved = index < 0 ? this.length + index : index
		if (resolved < 0 || resolved >= this.length) return undefined
		return this[getAt](resolved)
	}

	//#region mirror
	reverse(): this {
		const values = this.toArray().reverse()
		this.rebuildFrom(values)
		return this
	}

	sort(compareFn?: (a: T, b: T) => number): this {
		const values = this.toArray().sort(compareFn)
		this.rebuildFrom(values)
		return this
	}

	fill(value: T, start = 0, end = this.length): this {
		const values = this.toArray()
		values.fill(value, start, end)
		this.rebuildFrom(values)
		return this
	}

	copyWithin(target: number, start: number, end?: number): this {
		const values = this.toArray()
		values.copyWithin(target, start, end)
		this.rebuildFrom(values)
		return this
	}

	map<U>(callback: (value: T, index: number, array: T[]) => U, thisArg?: unknown): U[] {
		return this.toArray().map(callback, thisArg)
	}

	filter(callback: (value: T, index: number, array: T[]) => boolean, thisArg?: unknown): T[] {
		return this.toArray().filter(callback, thisArg)
	}

	reduce(...args: Parameters<Array<T>['reduce']>): ReturnType<Array<T>['reduce']> {
		return (this.toArray() as any).reduce(...args)
	}

	reduceRight(...args: Parameters<Array<T>['reduceRight']>): ReturnType<Array<T>['reduceRight']> {
		return (this.toArray() as any).reduceRight(...args)
	}

	forEach(callback: (value: T, index: number, array: T[]) => void, thisArg?: unknown): void {
		this.toArray().forEach(callback, thisArg)
	}

	some(callback: (value: T, index: number, array: T[]) => unknown, thisArg?: unknown): boolean {
		return this.toArray().some(callback, thisArg)
	}

	every(callback: (value: T, index: number, array: T[]) => unknown, thisArg?: unknown): boolean {
		return this.toArray().every(callback, thisArg)
	}

	find(
		callback: (value: T, index: number, array: T[]) => unknown,
		thisArg?: unknown
	): T | undefined {
		return this.toArray().find(callback, thisArg)
	}

	findIndex(callback: (value: T, index: number, array: T[]) => unknown, thisArg?: unknown): number {
		return this.toArray().findIndex(callback, thisArg)
	}

	includes(value: T, fromIndex?: number): boolean {
		return this.toArray().includes(value, fromIndex)
	}

	indexOf(value: T, fromIndex?: number): number {
		return this.toArray().indexOf(value, fromIndex)
	}

	lastIndexOf(value: T, fromIndex?: number): number {
		return this.toArray().lastIndexOf(value, fromIndex)
	}

	concat(...items: (T | ConcatArray<T>)[]): T[] {
		const values = this.toArray()
		return values.concat(
			...items.map((item) => (item instanceof KeyedArray ? item.toArray() : item))
		)
	}

	slice(start?: number, end?: number): T[] {
		return this.toArray().slice(start, end)
	}

	join(separator?: string): string {
		return this.toArray().join(separator)
	}

	flat(depth?: number): any[] {
		return (this.toArray() as any).flat(depth)
	}

	flatMap<U>(
		callback: (value: T, index: number, array: T[]) => U | readonly U[],
		thisArg?: unknown
	): U[] {
		return (this.toArray() as any).flatMap(callback, thisArg)
	}

	toLocaleString(locales?: string | string[], options?: Intl.NumberFormatOptions): string {
		return this.toArray().toLocaleString(locales as any, options)
	}

	toReversed(): T[] {
		const values = this.toArray()
		return values.toReversed ? (values as any).toReversed() : [...values].reverse()
	}

	toSorted(compareFn?: (a: T, b: T) => number): T[] {
		const values = this.toArray()
		return values.toSorted ? (values as any).toSorted(compareFn) : [...values].sort(compareFn)
	}

	with(index: number, value: T): T[] {
		const values = this.toArray()
		if ((values as any).with) return (values as any).with(index, value)
		const copy = [...values]
		let resolved = index
		if (resolved < 0) resolved = copy.length + resolved
		if (resolved < 0 || resolved >= copy.length)
			throw new RangeError('Index out of bounds in with() method')
		copy[resolved] = value
		return copy
	}
	//#endregion
}

export type KeyedArray<T, K extends PropertyKey = PropertyKey> = KeyedArrayClass<T, K> & T[]
export const KeyedArray = KeyedArrayClass as new <T, K extends PropertyKey = PropertyKey>(
	keyFn: KeyFunction<T, K>,
	initial?: Iterable<T>
) => KeyedArray<T, K>

export function keyedArray<T, K extends PropertyKey = PropertyKey>(
	keyFn: KeyFunction<T, K>,
	initial?: Iterable<T>
): KeyedArray<T, K> {
	return new KeyedArrayClass(keyFn, initial) as KeyedArray<T, K>
}

export function mapped<T, U>(
	inputs: T[],
	compute: (input: T, index: number, oldValue?: U) => U,
	resize?: (newLength: number, oldLength: number) => void
): U[] {
	const result = reactive([])
	const cleanups: ScopedCallback[] = []
	function input(index: number) {
		return effect(function computedIndexedMapInputEffect() {
			result[index] = compute(inputs[index], index, result[index])
		})
	}
	effect(function computedMapLengthEffect({ ascend }) {
		const length = inputs.length
		const resultLength = untracked(() => result.length)
		resize?.(length, resultLength)
		if (length < resultLength) {
			const toCleanup = cleanups.splice(length)
			for (const cleanup of toCleanup) cleanup()
			result.length = length
		} else if (length > resultLength)
			// the input effects will be registered as the call's children, so they will remain not cleaned with this effect on length
			ascend(function computedMapNewElements() {
				for (let i = resultLength; i < length; i++) cleanups.push(input(i))
			})
	})
	return cleanedBy(result, () => {
		for (const cleanup of cleanups) cleanup()
		cleanups.length = 0
	})
}
