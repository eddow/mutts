const fr = new FinalizationRegistry<() => void>((f) => f())
export const destructor = Symbol('destructor')
export const allocatedValues = Symbol('allocated')
export class DestructionError extends Error {
	static throw<T = void>(msg: string) {
		return ()=> {throw new DestructionError(msg)}
	}
	constructor(msg: string) {
		super('Object is destroyed')
		this.name = 'DestroyedAccessError'
	}
}
const destroyedHandler: ProxyHandler<any> = {
	get: DestructionError.throw('Cannot access destroyed object'),
	set: DestructionError.throw('Cannot access destroyed object'),
}

abstract class AbstractDestroyable<Allocated> {
	abstract [destructor](allocated: Allocated): void
}

interface Destructor<Allocated extends Record<PropertyKey, any> = Record<PropertyKey, any>> {
	destructor(allocated: Allocated): void
}

export function Destroyable<
	T extends new (
		...args: any[]
	) => any,
	Allocated extends Record<PropertyKey, any> = Record<PropertyKey, any>,
>(
	base: T,
	destructorObj: Destructor<Allocated>
): (new (
	...args: ConstructorParameters<T>
) => InstanceType<T> & {[allocatedValues]: Allocated}) & {
	destroy(obj: InstanceType<T>): boolean
	isDestroyable(obj: InstanceType<T>): boolean
}

export function Destroyable<Allocated extends Record<PropertyKey, any> = Record<PropertyKey, any>>(
	destructorObj: Destructor<Allocated>
): (new () => {[allocatedValues]: Allocated}) & {
	destroy(obj: any): boolean
	isDestroyable(obj: any): boolean
}

export function Destroyable<
	T extends new (...args: any[]) => any,
	Allocated extends Record<PropertyKey, any> = Record<PropertyKey, any>
>(
	base: T
): (new (
	...args: ConstructorParameters<T>
) => AbstractDestroyable<Allocated> & InstanceType<T> & {[allocatedValues]: Allocated}) & {
	destroy(obj: InstanceType<T>): boolean
	isDestroyable(obj: InstanceType<T>): boolean
}

export function Destroyable<
	Allocated extends Record<PropertyKey, any> = Record<PropertyKey, any>,
>(): abstract new () => (AbstractDestroyable<Allocated> & {[allocatedValues]: Allocated}) & {
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

	return class Destroyable extends base {
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

		readonly [allocatedValues]: Allocated
		constructor(...args: any[]) {
			super(...args)
			const allocated = this[allocatedValues] = {} as Allocated
			// @ts-expect-error `this` is an AbstractDestroyable
			const myDestructor = destructorObj?.destructor ?? this[destructor]
			if(!myDestructor) {
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
export function allocated<Allocated extends Record<PropertyKey, any>>(
	target: any,
	propertyKey: PropertyKey
) {
	const forwarding = target as { [forwardProperties]?: PropertyKey[] }
	if(!forwarding[forwardProperties]) {
		forwarding[forwardProperties] = []
		//const superConstructor = Object.getPrototypeOf(target).constructor
		forwarding.constructor = function () {debugger}
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
