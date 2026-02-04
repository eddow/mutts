import type { FunctionWrapper } from '../zone'
import { ArrayReadForward, forwardArray, getAt, Indexable, setAt } from '../indexable'
import { effect } from './effects'
import { Eventful } from '../eventful'
import { unreactive } from './interface'
import { reactive } from './proxy'
import type { EffectCleanup, EffectTrigger } from './types'

type KeyFunction<T, K extends PropertyKey> = (item: T) => K

/**
 * Events emitted by the Register for CRUD operations
 */
export interface RegisterEvents<T, K extends PropertyKey> {
	/**
	 * Emitted when a new item is added to the register
	 */
	add: (item: T, key: K, index: number) => void
	/**
	 * Emitted when an item is removed from the register
	 */
	delete: (item: T, key: K, index: number) => void
	/**
	 * Emitted when an item's value is updated (same key, new value)
	 */
	update: (oldItem: T, newItem: T, key: K, index: number) => void
	/**
	 * Emitted when an item's key changes (rekey operation)
	 */
	rekey: (item: T, oldKey: K, newKey: K, index: number) => void
	/**
	 * Index signature for EventsBase compatibility
	 */
	[key: string]: (...args: any[]) => void
}

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
// TODO: What to do with prototype forwarding ?
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
	readonly #valueInfo = new Map<T, { key: K; stop?: EffectCleanup }>()
	readonly #keyEffects = new Set<EffectCleanup>()
	readonly #ascend: FunctionWrapper
	readonly #events = new Eventful<RegisterEvents<T, K>>()

	/**
	 * Register event listeners for CRUD operations
	 */
	on(events: Partial<RegisterEvents<T, K>>): void
	on<EventType extends keyof RegisterEvents<T, K>>(
		event: EventType,
		cb: RegisterEvents<T, K>[EventType]
	): () => void
	on<EventType extends keyof RegisterEvents<T, K>>(
		eventOrEvents: EventType | Partial<RegisterEvents<T, K>>,
		cb?: RegisterEvents<T, K>[EventType]
	): () => void {
		// @ts-expect-error Delegate to Eventful
		return this.#events.on(eventOrEvents, cb)
	}

	/**
	 * Remove event listeners
	 */
	off(events: Partial<RegisterEvents<T, K>>): void
	off<EventType extends keyof RegisterEvents<T, K>>(
		event: EventType,
		cb?: RegisterEvents<T, K>[EventType]
	): void
	off<EventType extends keyof RegisterEvents<T, K>>(
		eventOrEvents: EventType | Partial<RegisterEvents<T, K>>,
		cb?: RegisterEvents<T, K>[EventType]
	): void {
		// @ts-expect-error Delegate to Eventful
		this.#events.off(eventOrEvents, cb)
	}

	/**
	 * Register a global hook that receives all events
	 */
	hook(
		cb: <EventType extends keyof RegisterEvents<T, K>>(
			event: EventType,
			...args: Parameters<RegisterEvents<T, K>[EventType]>
		) => void
	): () => void {
		return this.#events.hook(cb)
	}

	constructor(keyFn: KeyFunction<T, K>, initial?: Iterable<T>) {
		super()
		/* Moved below initialization */
		let ascendGet: FunctionWrapper | undefined
		effect(({ ascend }) => {
			ascendGet = ascend
		})
		this.#ascend = ascendGet!
		if (typeof keyFn !== 'function') throw new Error('Register requires a key function')
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
			this.#keyEffects.add(stop as EffectCleanup)
		})
		if (info.key === undefined) throw new Error('Register key function must return a property key')
		return info.key
	}

	private assertValidKey(key: unknown): asserts key is K {
		const type = typeof key
		if (type !== 'string' && type !== 'number' && type !== 'symbol')
			throw new Error('Register key function must return a property key')
	}

	private setKeyValue(key: K, value: T, index?: number) {
		const existing = this.#values.get(key)
		if (existing !== undefined && existing !== value) {
			this.cleanupValue(existing)
			this.#values.set(key, value)
			if (index !== undefined) {
				this.#events.emit('update', existing, value, key, index)
			}
		} else {
			this.#values.set(key, value)
		}
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
		let index = -1
		for (let i = 0; i < this.#keys.length; i++)
			if (Object.is(this.#keys[i], oldKey)) {
				this.#keys[i] = newKey
				if (index === -1) index = i
			}
		this.#usage.set(newKey, existingCount + count)
		this.#usage.delete(oldKey)
		this.#values.delete(oldKey)
		const updatedInfo = this.#valueInfo.get(value)
		if (updatedInfo) updatedInfo.key = newKey
		if (index !== -1) {
			this.#events.emit('rekey', value, oldKey, newKey, index)
		}
	}

	private incrementUsage(key: K) {
		const count = this.#usage.get(key) ?? 0
		this.#usage.set(key, count + 1)
	}

	private decrementUsage(key: K, index?: number) {
		const count = this.#usage.get(key)
		if (!count) return
		if (count <= 1) {
			const value = this.#values.get(key)
			this.#usage.delete(key)
			this.#values.delete(key)
			if (value !== undefined) {
				this.cleanupValue(value)
				const idx = index ?? this.#keys.indexOf(key)
				this.#events.emit('delete', value, key, idx)
			}
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
			const oldValue = this.#values.get(key)
			this.setKeyValue(key, value)
			if (oldValue !== undefined && oldValue !== value) {
				this.#events.emit('update', oldValue, value, key, index)
			}
			return
		}
		if (oldKey !== undefined) this.decrementUsage(oldKey as K)
		this.#keys[index] = key
		this.incrementUsage(key)
		this.setKeyValue(key, value)
		this.#events.emit('add', value, key, index)
	}

	private insertKeyValue(index: number, key: K, value: T) {
		this.#keys.splice(index, 0, key)
		this.incrementUsage(key)
		this.setKeyValue(key, value)
		this.#events.emit('add', value, key, index)
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
		for (let i = 0; i < removedKeys.length; i++) {
			const key = removedKeys[i]
			if (key === undefined) continue
			const value = this.#values.get(key as K)
			this.decrementUsage(key as K, normalizedStart + i)
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
		this.decrementUsage(key as K, index)
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
			if (this.#values.has(key)) {
				const index = this.#keys.indexOf(key)
				this.setKeyValue(key, value, index)
			}
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

/**
 * Creates a reactive Register - an ordered, array-like collection with stable key-based identity.
 * 
 * Register combines array semantics (indexable access, ordering, iteration) with Map-like
 * key-based lookups. Items with the same key share the same value instance, making it ideal
 * for UI lists keyed by IDs or when you need to preserve identity across reorders.
 * 
 * @param keyFn - Function that extracts the key from each item
 * @param initial - Optional initial items to populate the register
 * @returns A reactive Register instance
 * 
 * @example
 * ```typescript
 * const users = register(
 *   (user: User) => user.id,
 *   [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
 * )
 * 
 * users.push({ id: 3, name: 'Charlie' })
 * const bob = users.get(2) // Get by key
 * ```
 */
export function register<T, K extends PropertyKey = PropertyKey>(
	keyFn: KeyFunction<T, K>,
	initial?: Iterable<T>
): Register<T, K> {
	return new RegisterClass(keyFn, initial) as Register<T, K>
}
