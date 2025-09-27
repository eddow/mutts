// biome-ignore-all lint/suspicious/noConfusingVoidType: We *love* voids
// Standardized decorator system that works with both Stage 2 and Stage 3 decorators

import { isConstructor } from './utils'

export class DecoratorError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'DecoratorException'
	}
}

/**
 * Detects which decorator system is available in the current environment
 */
function detectDecoratorSupport(): 'stage3' | 'stage2' | false {
	let result: 'stage3' | 'stage2' | false = false
	try {
		// Test for Stage 3 decorator signature
		const stage3Decorator = (_target: any, context: any) => {
			result = context ? 'stage3' : 'stage2'
		}
		// @ts-ignore
		@stage3Decorator
		class Test {}
		// Use Test to avoid unused warning
		void Test

		return result
	} catch (_e) {
		return false
	}
}

// Cache the decorator support detection
export const decoratorSupport = detectDecoratorSupport()
/*
interface TypedPropertyDescriptor<T> extends PropertyDescriptor {
	value?: T
	get?(): T
	set?(v: T): void
}*/

//#region all decorator types

// Used for get/set and method decorators
export type Stage2PropertyDecorator<T> = (
	target: T,
	name: string | symbol,
	descriptor: PropertyDescriptor
) => any

export type Stage2ClassDecorator<T> = (target: T) => any

export type Stage3MethodDecorator<T> = (target: T, context: ClassMethodDecoratorContext) => any

export type Stage3GetterDecorator<T> = (target: T, context: ClassGetterDecoratorContext) => any

export type Stage3SetterDecorator<T> = (target: T, context: ClassSetterDecoratorContext) => any

export type Stage3ClassDecorator<T> = (target: T, context: ClassDecoratorContext) => any

//#endregion

type DDMethod<T> = (
	name: PropertyKey,
	original: (this: T, ...args: any[]) => any
) => ((this: T, ...args: any[]) => any) | void

type DDGetter<T> = (name: PropertyKey, original: (this: T) => any) => ((this: T) => any) | void

type DDSetter<T> = (
	name: PropertyKey,
	original: (this: T, value: any) => void
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
	? Stage2PropertyDecorator<T> & Stage3MethodDecorator<T>
	: unknown) &
	(Description extends { class: DDClass<new (...args: any[]) => T> }
		? Stage2ClassDecorator<new (...args: any[]) => T> &
				Stage3ClassDecorator<new (...args: any[]) => T>
		: unknown) &
	(Description extends { getter: DDGetter<T> }
		? Stage2PropertyDecorator<T> & Stage3GetterDecorator<T>
		: unknown) &
	(Description extends { setter: DDSetter<T> }
		? Stage2PropertyDecorator<T> & Stage3SetterDecorator<T>
		: unknown) &
	(Description extends { default: infer Signature } ? Signature : unknown)

export type DecoratorFactory<T> = <Description extends DecoratorDescription<T>>(
	description: Description
) => (Description extends { method: DDMethod<T> }
	? Stage2PropertyDecorator<T> & Stage3MethodDecorator<T>
	: unknown) &
	(Description extends { class: DDClass<new (...args: any[]) => T> }
		? Stage2ClassDecorator<new (...args: any[]) => T> &
				Stage3ClassDecorator<new (...args: any[]) => T>
		: unknown) &
	(Description extends { getter: DDGetter<T> }
		? Stage2PropertyDecorator<T> & Stage3GetterDecorator<T>
		: unknown) &
	(Description extends { setter: DDSetter<T> }
		? Stage2PropertyDecorator<T> & Stage3SetterDecorator<T>
		: unknown) &
	(Description extends { default: infer Signature } ? Signature : unknown)

export function stage2Decorator<T = any>(description: DecoratorDescription<T>): any {
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
						const newGetter = description.getter?.(propertyKey, descriptor.get)
						if (newGetter) descriptor.get = newGetter
					}
					if ('setter' in description) {
						const newSetter = description.setter?.(propertyKey, descriptor.set)
						if (newSetter) descriptor.set = newSetter
					}
					return descriptor
				} else if (typeof descriptor.value === 'function') {
					if (!('method' in description)) throw new Error('Decorator cannot be applied to a method')
					const newMethod = description.method?.(propertyKey, descriptor.value)
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

export function stage3Decorator<T = any>(description: DecoratorDescription<T>): any {
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
				return description.getter?.(context.name, target)
			case 'setter':
				if (!('setter' in description)) throw new Error('Decorator cannot be applied to a setter')
				return description.setter?.(context.name, target)
			case 'method':
				if (!('method' in description)) throw new Error('Decorator cannot be applied to a method')
				return description.method?.(context.name, target)
			case 'accessor': {
				if (!('getter' in description || 'setter' in description))
					throw new Error('Decorator cannot be applied to a getter or setter')
				const rv: Partial<ClassAccessorDecoratorResult<any, any>> = {}
				if ('getter' in description) {
					const newGetter = description.getter?.(context.name, target.get)
					if (newGetter) rv.get = newGetter
				}
				if ('setter' in description) {
					const newSetter = description.setter?.(context.name, target.set)
					if (newSetter) rv.set = newSetter
				}
				return rv
			}
			//return description.accessor?.(target, context.name, target)
		}
	}
}

export const decorator: DecoratorFactory<any> =
	decoratorSupport === 'stage3' ? stage3Decorator : stage2Decorator
/*export const decorator = <T extends object, Description extends DecoratorDescription<T>>(
	description: Description
): Decorator<T, Description> => {
	return decoratorSupport === 'stage3' ? stage3Decorator(description) : stage2Decorator(description)
}*/

export type GenericClassDecorator<T> = Stage2ClassDecorator<new (...args: any[]) => T> &
	Stage3ClassDecorator<new (...args: any[]) => T>
