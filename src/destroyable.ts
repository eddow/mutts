import { decorator } from './decorator'

// Integrated with `using` statement via Symbol.dispose
const fr = new FinalizationRegistry<() => void>((f) => f())
/**
 * Symbol for marking destructor methods
 */
export const destructor = Symbol('destructor')
/**
 * Symbol for accessing allocated values in destroyable objects
 */
export const allocatedValues = Symbol('allocated')
/**
 * Error thrown when attempting to access a destroyed object
 */
export class DestructionError extends Error {
	static throw<_T = void>(msg: string) {
		return () => {
			throw new DestructionError(msg)
		}
	}
	constructor(msg: string) {
		super(`Object is destroyed. ${msg}`)
		this.name = 'DestroyedAccessError'
	}
}
const destroyedHandler = {
	[Symbol.toStringTag]: 'MutTs Destroyable',
	get: DestructionError.throw('Cannot access destroyed object'),
	set: DestructionError.throw('Cannot access destroyed object'),
} as const

abstract class AbstractDestroyable<Allocated> {
	abstract [destructor](allocated: Allocated): void
	[Symbol.dispose](): void {
		this[destructor](this as unknown as Allocated)
	}
}

interface Destructor<Allocated> {
	destructor(allocated: Allocated): void
}

/**
 * Creates a destroyable class with a base class and destructor object
 * @param base - The base class to extend
 * @param destructorObj - Object containing the destructor method
 * @returns A destroyable class with static destroy and isDestroyable methods
 */
export function Destroyable<
	T extends new (
		...args: any[]
	) => any,
	Allocated extends Partial<InstanceType<T>>,
>(
	base: T,
	destructorObj: Destructor<Allocated>
): (new (
	...args: ConstructorParameters<T>
) => InstanceType<T> & { [allocatedValues]: Allocated }) & {
	destroy(obj: InstanceType<T>): boolean
	isDestroyable(obj: InstanceType<T>): boolean
}

/**
 * Creates a destroyable class with only a destructor object (no base class)
 * @param destructorObj - Object containing the destructor method
 * @returns A destroyable class with static destroy and isDestroyable methods
 */
export function Destroyable<Allocated extends Record<PropertyKey, any> = Record<PropertyKey, any>>(
	destructorObj: Destructor<Allocated>
): (new () => { [allocatedValues]: Allocated }) & {
	destroy(obj: any): boolean
	isDestroyable(obj: any): boolean
}

/**
 * Creates a destroyable class with a base class (requires [destructor] method)
 * @param base - The base class to extend
 * @returns A destroyable class with static destroy and isDestroyable methods
 */
export function Destroyable<
	T extends new (
		...args: any[]
	) => any,
	Allocated extends Record<PropertyKey, any> = Record<PropertyKey, any>,
>(
	base: T
): (new (
	...args: ConstructorParameters<T>
) => AbstractDestroyable<Allocated> & InstanceType<T> & { [allocatedValues]: Allocated }) & {
	destroy(obj: InstanceType<T>): boolean
	isDestroyable(obj: InstanceType<T>): boolean
}

/**
 * Creates an abstract destroyable base class
 * @returns An abstract destroyable class with static destroy and isDestroyable methods
 */
export function Destroyable<
	Allocated extends Record<PropertyKey, any> = Record<PropertyKey, any>,
>(): abstract new () => (AbstractDestroyable<Allocated> & {
	[allocatedValues]: Allocated
}) & {
	destroy(obj: any): boolean
	isDestroyable(obj: any): boolean
}

export function Destroyable<
	T extends new (
		...args: any[]
	) => any,
	Allocated extends Record<PropertyKey, any> = Record<PropertyKey, any>,
>(base?: T | Destructor<Allocated>, destructorObj?: Destructor<Allocated>) {
	if (base && typeof base !== 'function') {
		destructorObj = base as Destructor<Allocated>
		base = undefined
	}
	if (!base) {
		base = class {} as T
	}

	return class Destroyable extends (base as T) {
		static readonly destructors = new WeakMap<any, () => void>()
		static destroy(obj: Destroyable) {
			const destructor = Destroyable.destructors.get(obj)
			if (!destructor) return false
			fr.unregister(obj)
			Destroyable.destructors.delete(obj)
			Object.setPrototypeOf(obj, new Proxy({}, destroyedHandler))
			// Clear all own properties
			for (const key of Object.getOwnPropertyNames(obj)) {
				delete (obj as any)[key]
			}
			destructor()
			return true
		}
		static isDestroyable(obj: Destroyable) {
			return Destroyable.destructors.has(obj)
		}

		declare [forwardProperties]: PropertyKey[]
		readonly [allocatedValues]: Allocated
		constructor(...args: any[]) {
			super(...args)
			const allocated = {} as Allocated
			this[allocatedValues] = allocated
			// @ts-expect-error `this` is an AbstractDestroyable
			const myDestructor = destructorObj?.destructor ?? this[destructor]
			if (!myDestructor) {
				throw new DestructionError('Destructor is not defined')
			}
			function destruction() {
				myDestructor(allocated)
			}
			Destroyable.destructors.set(this, destruction)
			fr.register(this, destruction, this)
		}
	}
}

const forwardProperties = Symbol('forwardProperties')
/**
 * Decorator that marks properties to be stored in the allocated object and passed to the destructor
 * Use with accessor properties or explicit get/set pairs
 */
export const allocated = decorator({
	setter(original, propertyKey) {
		return function (value) {
			this[allocatedValues][propertyKey] = value
			return original.call(this, value)
		}
	},
})

/**
 * Registers a callback to be called when an object is garbage collected
 * @param cb - The callback function to execute on garbage collection
 * @returns The object whose reference can be collected
 */
export function callOnGC(cb: () => void) {
	let called = false
	const forward = () => {
		if (called) return
		called = true
		cb()
	}
	fr.register(forward, cb, cb)
	return forward
}

/**
 * Context Manager Protocol for `using` statement integration
 * Provides automatic resource cleanup when used with the `using` statement
 */
export interface ContextManager<T = any> {
	[Symbol.dispose](): void
	value?: T
}
