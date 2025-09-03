export const getAt = Symbol('getAt')
export const setAt = Symbol('setAt')

interface IndexingAt<Items = any> {
	[getAt](index: number): Items
}

interface Accessor<T, Items> {
	get(this: T, index: number): Items
	set?(this: T, index: number, value: Items): void
}

abstract class AbstractGetAt<Items = any> {
	abstract [getAt](index: number): Items
}

export function Indexable<Items, Base extends abstract new (...args: any[]) => any>(
	base: Base,
	accessor: Accessor<InstanceType<Base>, Items>
): new (
	...args: ConstructorParameters<Base>
) => InstanceType<Base> & { [x: number]: Items }

export function Indexable<Items>(accessor: Accessor<any, Items>): new () => { [x: number]: Items }

export function Indexable<Base extends new (...args: any[]) => IndexingAt>(
	base: Base
): new (
	...args: ConstructorParameters<Base>
) => InstanceType<Base> & { [x: number]: AtReturnType<InstanceType<Base>> }

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

	abstract class Indexable extends base {
		[x: number]: Items
	}

	Object.setPrototypeOf(
		Indexable.prototype,
		new Proxy(base.prototype, {
			get(target, prop, receiver) {
				if (prop in target) {
					const getter = Object.getOwnPropertyDescriptor(target, prop)?.get
					return getter ? getter.call(receiver) : target[prop]
				}
				if (typeof prop === 'string') {
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
