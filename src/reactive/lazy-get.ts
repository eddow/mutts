import { ReflectGet } from '../utils'

const lazyGetSymbol = Symbol('lazyGet')
type LazyTarget = () => any

export type LazyGet<T = unknown> = (() => T) & { valueOf(): T; [lazyGetSymbol]: true }

type LazyValue<T> = T extends LazyGet<infer U> ? LazyValue<U> : T

type PrimitiveTypeOf<T> = T extends undefined
	? 'undefined'
	: T extends null
		? 'object'
		: T extends boolean
			? 'boolean'
			: T extends string
				? 'string'
				: T extends number
					? 'number'
					: T extends bigint
						? 'bigint'
						: T extends symbol
							? 'symbol'
							: T extends (...args: any[]) => any
								? 'function'
								: 'object'

type TypeOfResult<T> = PrimitiveTypeOf<LazyValue<T>>

export function isLazyGet(obj: unknown): obj is LazyGet {
	return typeof obj === 'function' && lazyGetSymbol in obj
}

export function unwrapLazyGet<T>(obj: T): LazyValue<T> {
	let value: unknown = obj
	while (isLazyGet(value)) value = value.valueOf()
	return value as LazyValue<T>
}

const lazyGetProxyHandler = Object.assign(
	{
		getPrototypeOf(target) {
			const value = unwrapLazyGet(target())
			switch (typeof value) {
				case 'number':
					return Number.prototype
				case 'string':
					return String.prototype
				case 'boolean':
					return Boolean.prototype
				case 'symbol':
					return Symbol.prototype
				case 'undefined':
					return undefined
			}
			return Reflect.getPrototypeOf(value)
		},
		setPrototypeOf(target, proto) {
			return Reflect.setPrototypeOf(unwrapLazyGet(target()), proto)
		},
		isExtensible(target) {
			return Reflect.isExtensible(unwrapLazyGet(target()))
		},
		preventExtensions(target) {
			return Reflect.preventExtensions(unwrapLazyGet(target()))
		},
		getOwnPropertyDescriptor(target, prop) {
			return Reflect.getOwnPropertyDescriptor(unwrapLazyGet(target()), prop)
		},
		defineProperty(target, prop, descriptor) {
			return Reflect.defineProperty(unwrapLazyGet(target()), prop, descriptor)
		},
		has(target, prop) {
			if (prop === lazyGetSymbol) return true
			return Reflect.has(unwrapLazyGet(target()), prop)
		},
		get(target, prop, receiver) {
			if (prop === 'valueOf' || prop === Symbol.toPrimitive) return () => unwrapLazyGet(target())
			const value = unwrapLazyGet(target())
			if (!['object', 'function'].includes(typeof value)) return
			return ReflectGet(value, prop, receiver)
		},
		set(target, prop, value, receiver) {
			return Reflect.set(unwrapLazyGet(target()), prop, value, receiver)
		},
		deleteProperty(target, prop) {
			return Reflect.deleteProperty(unwrapLazyGet(target()), prop)
		},
		ownKeys(target) {
			return Reflect.ownKeys(unwrapLazyGet(target()))
		},
		apply(target, thisArg, argArray) {
			const actual = unwrapLazyGet(target())
			if (typeof actual !== 'function') throw new TypeError('Target is not callable')
			return Reflect.apply(actual, thisArg, argArray)
		},
		construct(target, argArray, newTarget) {
			const actual = unwrapLazyGet(target())
			if (typeof actual !== 'function') throw new TypeError('Target is not constructable')
			return Reflect.construct(actual, argArray, newTarget)
		},
	} satisfies ProxyHandler<LazyTarget>,
	{
		[Symbol.toStringTag]: 'LazyGet',
	}
)
export function lazyGet<T>(extract: () => T): LazyGet<T> {
	return new Proxy(extract, lazyGetProxyHandler) as LazyGet<T>
}

export function lazy<T extends object>(target: T): T {
	return new Proxy(target, {
		get(target, prop, receiver) {
			return lazyGet(() => ReflectGet(target, prop, receiver))
		},
		set(target, prop, value) {
			return Reflect.set(target, prop, value)
		},
		deleteProperty(target, prop) {
			return Reflect.deleteProperty(target, prop)
		},
	})
}

export function typeOf<T>(obj: T): TypeOfResult<T> {
	return (isLazyGet(obj) ? typeof unwrapLazyGet(obj) : typeof obj) as TypeOfResult<T>
}

export function isPrimitive(obj: any): boolean {
	return ['number', 'string', 'boolean', 'symbol', 'undefined', 'bigint'].includes(typeOf(obj))
}
export function isObject(obj: any): obj is object {
	return typeOf(obj) === 'object' && obj !== null
}
export function isFunction(obj: any): obj is Function {
	return typeOf(obj) === 'function'
}
export function isNumber(obj: any): obj is number {
	return typeOf(obj) === 'number'
}
export function isString(obj: any): obj is string {
	return typeOf(obj) === 'string'
}
export function isBoolean(obj: any): obj is boolean {
	return typeOf(obj) === 'boolean'
}
export function isSymbol(obj: any): obj is symbol {
	return typeOf(obj) === 'symbol'
}
export function isUndefined(obj: any): obj is undefined {
	return typeOf(obj) === 'undefined'
}
export function isBigInt(obj: any): obj is bigint {
	return typeOf(obj) === 'bigint'
}
