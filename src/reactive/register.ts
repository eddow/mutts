import { ArrayReadForward, forwardArray, getAt, Indexable, setAt } from '../indexable'
import { effect } from './effects'
import { unreactive } from './interface'
import { reactive } from './proxy'
import { type DependencyFunction, prototypeForwarding, type ScopedCallback } from './types'

// TODO: use register in a real-world crud situation, have "events" for add, delete, update

type KeyFunction<T, K extends PropertyKey> = (item: T) => K

// Helper to work around TypeScript limitation: base class expressions cannot reference class type parameters
function getRegisterBase<T>() {
	class RegisterBase extends Indexable(ArrayReadForward, {
		get(this: any, index: number) {
			return this[getAt](index)
		},
		set(this: any, index: number, value: T) {
			this[setAt](index, value)
		},
		getLength(this: any) {
			return this.length
		},
		setLength(this: any, value: number) {
			this.length = value
		},
	}) {
		toArray(): T[] {
			return Array.from(this)
		}
	}
	return RegisterBase as new () => ArrayReadForward<T> & {
		[x: number]: T
		toArray(): T[]
	}
}
interface RegisterInstance<T> extends ArrayReadForward<T> {
	[index: number]: T
}

@unreactive
class RegisterClass<T, K extends PropertyKey = PropertyKey>
	extends getRegisterBase<any>()
	implements RegisterInstance<T>
{
	protected get [forwardArray](): readonly T[] {
		return this.toArray()
	}
	readonly #keyFn: KeyFunction<T, K>
	readonly #keys: K[]
	readonly #values: Map<K, T>
	readonly #usage = new Map<K, number>()
	readonly #valueInfo = new Map<T, { key: K; stop?: ScopedCallback }>()
	readonly #keyEffects = new Set<ScopedCallback>()
	readonly #ascend: DependencyFunction

	constructor(keyFn: KeyFunction<T, K>, initial?: Iterable<T>) {
		super()
		/* Moved below initialization */
		let ascendGet: DependencyFunction | undefined
		effect(({ ascend }) => {
			ascendGet = ascend
		})
		this.#ascend = ascendGet!
		if (typeof keyFn !== 'function') throw new Error('Register requires a key function')
		this.#keyFn = keyFn
		this.#keys = reactive([] as K[])
		this.#values = reactive(new Map<K, T>())
		Object.defineProperties(this, {
			[prototypeForwarding]: { value: this.#keys },
		})
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
		if (info.key === undefined) throw new Error('Register key function must return a property key')
		return info.key
	}

	private assertValidKey(key: unknown): asserts key is K {
		const type = typeof key
		if (type !== 'string' && type !== 'number' && type !== 'symbol')
			throw new Error('Register key function must return a property key')
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
			throw new Error(`Register key collision for key ${String(newKey)}`)
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

	/**
	 * Keep only the items for which the predicate returns true.
	 * Items for which the predicate returns false are removed.
	 *
	 * The predicate is evaluated once per distinct key; duplicate keys
	 * will follow the same keep/remove decision.
	 */
	public keep(predicate: (value: T) => boolean): void {
		const decisions = new Map<K, boolean>()
		for (const [index, key] of this.#keys.entries()) {
			if (decisions.has(key)) {
				if (!decisions.get(key)) this.removeAt(index)
				continue
			}
			const value = this.#values.get(key)
			const shouldKeep = predicate(value as T)
			decisions.set(key, shouldKeep)
			if (!shouldKeep) this.removeAt(index)
		}
	}

	hasKey(key: K): boolean {
		return this.#usage.has(key)
	}

	indexOfKey(key: K): number {
		return this.#keys.indexOf(key)
	}

	mapKeys(): IterableIterator<K> {
		return this.#values.keys()
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

	entries(): IterableIterator<[number, T]> {
		const self = this
		function* iterator(): IterableIterator<[number, T]> {
			for (let i = 0; i < self.#keys.length; i++) {
				const val = self.#values.get(self.#keys[i])
				if (val !== undefined) yield [i, val]
			}
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

	toString(): string {
		return `[Register length=${this.length}]`
	}

	at(index: number): T | undefined {
		const resolved = index < 0 ? this.length + index : index
		if (resolved < 0 || resolved >= this.length) return undefined
		return this[getAt](resolved)
	}
	reverse(): this {
		this.#keys.reverse()
		return this
	}
	sort(compareFn?: ((a: T, b: T) => number) | undefined): this {
		const fwdCompareFn = compareFn
			? (a: K, b: K) => compareFn(this.#values.get(a) as T, this.#values.get(b) as T)
			: undefined
		this.#keys.sort(fwdCompareFn)
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
}

export type Register<T, K extends PropertyKey = PropertyKey> = RegisterClass<T, K> & T[]
export const Register = RegisterClass as new <T, K extends PropertyKey = PropertyKey>(
	keyFn: KeyFunction<T, K>,
	initial?: Iterable<T>
) => Register<T, K>

export function register<T, K extends PropertyKey = PropertyKey>(
	keyFn: KeyFunction<T, K>,
	initial?: Iterable<T>
): Register<T, K> {
	return new RegisterClass(keyFn, initial) as Register<T, K>
}
