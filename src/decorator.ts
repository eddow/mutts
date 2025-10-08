// biome-ignore-all lint/suspicious/noConfusingVoidType: We *love* voids
// Standardized decorator system that works with both Legacy and Modern decorators

import { isConstructor } from './utils'

export class DecoratorError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'DecoratorException'
	}
}
//#region all decorator types

// Used for get/set and method decorators
export type LegacyPropertyDecorator<T> = (
	target: T,
	name: string | symbol,
	descriptor: PropertyDescriptor
) => any

export type LegacyClassDecorator<T> = (target: T) => any

export type ModernMethodDecorator<T> = (target: T, context: ClassMethodDecoratorContext) => any

export type ModernGetterDecorator<T> = (target: T, context: ClassGetterDecoratorContext) => any

export type ModernSetterDecorator<T> = (target: T, context: ClassSetterDecoratorContext) => any

export type ModernAccessorDecorator<T> = (target: T, context: ClassAccessorDecoratorContext) => any

export type ModernClassDecorator<T> = (target: T, context: ClassDecoratorContext) => any

//#endregion

type DDMethod<T> = (
	original: (this: T, ...args: any[]) => any,
	name: PropertyKey
) => ((this: T, ...args: any[]) => any) | void

type DDGetter<T> = (original: (this: T) => any, name: PropertyKey) => ((this: T) => any) | void

type DDSetter<T> = (
	original: (this: T, value: any) => void,
	name: PropertyKey
) => ((this: T, value: any) => void) | void

type DDClass<T> = <Ctor extends new (...args: any[]) => T = new (...args: any[]) => T>(
	target: Ctor
) => Ctor | void
export interface DecoratorDescription<T> {
	method?: DDMethod<T>
	class?: DDClass<T>
	getter?: DDGetter<T>
	setter?: DDSetter<T>
	default?: (...args: any[]) => any
}

export type Decorator<T, Description extends DecoratorDescription<T>> = (Description extends {
	method: DDMethod<T>
}
	? LegacyPropertyDecorator<T> & ModernMethodDecorator<T>
	: unknown) &
	(Description extends { class: DDClass<new (...args: any[]) => T> }
		? LegacyClassDecorator<new (...args: any[]) => T> &
				ModernClassDecorator<new (...args: any[]) => T>
		: unknown) &
	(Description extends { getter: DDGetter<T> }
		? LegacyPropertyDecorator<T> & ModernGetterDecorator<T> & ModernAccessorDecorator<T>
		: unknown) &
	(Description extends { setter: DDSetter<T> }
		? LegacyPropertyDecorator<T> & ModernSetterDecorator<T> & ModernAccessorDecorator<T>
		: unknown) &
	(Description extends { default: infer Signature } ? Signature : unknown)

export type DecoratorFactory<T> = <Description extends DecoratorDescription<T>>(
	description: Description
) => (Description extends { method: DDMethod<T> }
	? LegacyPropertyDecorator<T> & ModernMethodDecorator<T>
	: unknown) &
	(Description extends { class: DDClass<new (...args: any[]) => T> }
		? LegacyClassDecorator<new (...args: any[]) => T> &
				ModernClassDecorator<new (...args: any[]) => T>
		: unknown) &
	(Description extends { getter: DDGetter<T> }
		? LegacyPropertyDecorator<T> & ModernGetterDecorator<T> & ModernAccessorDecorator<T>
		: unknown) &
	(Description extends { setter: DDSetter<T> }
		? LegacyPropertyDecorator<T> & ModernSetterDecorator<T> & ModernAccessorDecorator<T>
		: unknown) &
	(Description extends { default: infer Signature } ? Signature : unknown)

export function legacyDecorator<T = any>(description: DecoratorDescription<T>): any {
	return function (
		target: any,
		propertyKey?: PropertyKey,
		descriptor?: PropertyDescriptor,
		...args: any[]
	) {
		if (propertyKey === undefined) {
			if (isConstructor(target)) {
				if (!('class' in description)) throw new Error('Decorator cannot be applied to a class')
				return description.class?.(target)
			}
		} else if (typeof target === 'object' && ['string', 'symbol'].includes(typeof propertyKey)) {
			if (!descriptor) throw new Error('Decorator cannot be applied to a field')
			else if (typeof descriptor === 'object' && 'configurable' in descriptor) {
				if ('get' in descriptor || 'set' in descriptor) {
					if (!('getter' in description || 'setter' in description))
						throw new Error('Decorator cannot be applied to a getter or setter')
					if ('getter' in description) {
						const newGetter = description.getter?.(descriptor.get, propertyKey)
						if (newGetter) descriptor.get = newGetter
					}
					if ('setter' in description) {
						const newSetter = description.setter?.(descriptor.set, propertyKey)
						if (newSetter) descriptor.set = newSetter
					}
					return descriptor
				} else if (typeof descriptor.value === 'function') {
					if (!('method' in description)) throw new Error('Decorator cannot be applied to a method')
					const newMethod = description.method?.(descriptor.value, propertyKey)
					if (newMethod) descriptor.value = newMethod
					return descriptor
				}
			}
		}
		if (!('default' in description))
			throw new Error('Decorator do not have a default implementation')
		return description.default.call(this, target, propertyKey, descriptor, ...args)
	}
}

export function modernDecorator<T = any>(description: DecoratorDescription<T>): any {
	return function (target: any, context?: DecoratorContext, ...args: any[]) {
		if (!context?.kind || typeof context.kind !== 'string') {
			if (!('default' in description))
				throw new Error('Decorator do not have a default implementation')
			return description.default.call(this, target, context, ...args)
		}
		switch (context.kind) {
			case 'class':
				if (!('class' in description)) throw new Error('Decorator cannot be applied to a class')
				return description.class?.(target)
			case 'field':
				throw new Error('Decorator cannot be applied to a field')
			case 'getter':
				if (!('getter' in description)) throw new Error('Decorator cannot be applied to a getter')
				return description.getter?.(target, context.name)
			case 'setter':
				if (!('setter' in description)) throw new Error('Decorator cannot be applied to a setter')
				return description.setter?.(target, context.name)
			case 'method':
				if (!('method' in description)) throw new Error('Decorator cannot be applied to a method')
				return description.method?.(target, context.name)
			case 'accessor': {
				if (!('getter' in description || 'setter' in description))
					throw new Error('Decorator cannot be applied to a getter or setter')
				const rv: Partial<ClassAccessorDecoratorResult<any, any>> = {}
				if ('getter' in description) {
					const newGetter = description.getter?.(target.get, context.name)
					if (newGetter) rv.get = newGetter
				}
				if ('setter' in description) {
					const newSetter = description.setter?.(target.set, context.name)
					if (newSetter) rv.set = newSetter
				}
				return rv
			}
			//return description.accessor?.(target, context.name, target)
		}
	}
}

/**
 * Detects if the decorator is being called in modern (Modern) or legacy (Legacy) mode
 * based on the arguments passed to the decorator function
 */
function detectDecoratorMode(
	_target: any,
	contextOrKey?: any,
	_descriptor?: any
): 'modern' | 'legacy' {
	// Modern decorators have a context object as the second parameter
	// Legacy decorators have a string/symbol key as the second parameter
	if (
		typeof contextOrKey === 'object' &&
		contextOrKey !== null &&
		typeof contextOrKey.kind === 'string'
	) {
		return 'modern'
	}
	return 'legacy'
}

export const decorator: DecoratorFactory<any> = (description: DecoratorDescription<any>) => {
	return ((target: any, contextOrKey?: any, ...args: any[]) => {
		const mode = detectDecoratorMode(target, contextOrKey, args[0])
		return mode === 'modern'
			? modernDecorator(description)(target, contextOrKey, ...args)
			: legacyDecorator(description)(target, contextOrKey, ...args)
	}) as any
}

export type GenericClassDecorator<T> = LegacyClassDecorator<abstract new (...args: any[]) => T> &
	ModernClassDecorator<abstract new (...args: any[]) => T>
