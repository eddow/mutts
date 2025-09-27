// Integrated with `using` statement via Symbol.dispose
const fr = new FinalizationRegistry<() => void>((f) => f())
export const destructor = Symbol('destructor')
export const allocatedValues = Symbol('allocated')
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

export function Destroyable<
	T extends new (
		...args: any[]
	) => any,
	Allocated extends Partial<typeof this>,
>(
	base: T,
	destructorObj: Destructor<Allocated>
): (new (
	...args: ConstructorParameters<T>
) => InstanceType<T> & { [allocatedValues]: Allocated }) & {
	destroy(obj: InstanceType<T>): boolean
	isDestroyable(obj: InstanceType<T>): boolean
}

export function Destroyable<Allocated extends Record<PropertyKey, any> = Record<PropertyKey, any>>(
	destructorObj: Destructor<Allocated>
): (new () => { [allocatedValues]: Allocated }) & {
	destroy(obj: any): boolean
	isDestroyable(obj: any): boolean
}

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
export function allocated<
	Key extends PropertyKey,
	Allocated extends AbstractDestroyable<{ [key in Key]: any }>,
>(target: Allocated, propertyKey: Key) {
	const forwarding = target as { [forwardProperties]?: PropertyKey[] }
	if (!forwarding[forwardProperties]) {
		forwarding[forwardProperties] = []
	}
	forwarding[forwardProperties].push(propertyKey)
	// Make a get/set accessor that stores the value in the allocated object
	Object.defineProperty(target, propertyKey, {
		get: function (this: any) {
			return this[allocatedValues][propertyKey]
		},
		set: function (this: any, value: any) {
			this[allocatedValues][propertyKey] = value
		},
	})
}

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

// Context Manager Protocol for `with` statement integration
export interface ContextManager<T = any> {
	[Symbol.dispose](): void
	value?: T
}
