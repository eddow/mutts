// biome-ignore-all lint/suspicious/noConfusingVoidType: We *love* voids
// Standardized decorator system that works with both Legacy and Modern decorators

import { isConstructor } from './utils'

/**
 * Error thrown when decorator operations fail
 */
export class DecoratorError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'DecoratorException'
	}
}
//#region all decorator types

// Used for get/set and method decorators
/**
 * Legacy property decorator type for methods, getters, and setters
 */
export type LegacyPropertyDecorator<T> = (
	target: T,
	name: string | symbol,
	descriptor: PropertyDescriptor
) => any

/**
 * Legacy class decorator type
 */
export type LegacyClassDecorator<T> = (target: T) => any

/**
 * Modern method decorator type
 */
export type ModernMethodDecorator<T> = (target: T, context: ClassMethodDecoratorContext) => any

/**
 * Modern getter decorator type
 */
export type ModernGetterDecorator<T> = (target: T, context: ClassGetterDecoratorContext) => any

/**
 * Modern setter decorator type
 */
export type ModernSetterDecorator<T> = (target: T, context: ClassSetterDecoratorContext) => any

/**
 * Modern accessor decorator type
 */
export type ModernAccessorDecorator<T> = (target: T, context: ClassAccessorDecoratorContext) => any

/**
 * Modern class decorator type
 */
export type ModernClassDecorator<T> = (target: T, context: ClassDecoratorContext) => any

//#endregion

type DDMethod<T> = (
	original: (this: T, ...args: any[]) => any,
	target: any,
	name: PropertyKey
) => ((this: T, ...args: any[]) => any) | void

type DDGetter<T> = (original: (this: T) => any, target: any, name: PropertyKey) => ((this: T) => any) | void

type DDSetter<T> = (
	original: (this: T, value: any) => void,
	target: any,
	name: PropertyKey
) => ((this: T, value: any) => void) | void

type DDClass<T> = <Ctor extends new (...args: any[]) => T = new (...args: any[]) => T>(
	target: Ctor
) => Ctor | void
/**
 * Description object for creating decorators that work with both Legacy and Modern decorator proposals
 */
export interface DecoratorDescription<T> {
	/** Handler for method decorators */
	method?: DDMethod<T>
	/** Handler for class decorators */
	class?: DDClass<T>
	/** Handler for getter decorators */
	getter?: DDGetter<T>
	/** Handler for setter decorators */
	setter?: DDSetter<T>
	/** Default handler for any decorator type not explicitly defined */
	default?: (...args: any[]) => any
}

/**
 * Type for decorators that work with both Legacy and Modern decorator proposals
 * Automatically infers the correct decorator type based on the description
 */
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

/**
 * Factory type for creating decorators that work with both Legacy and Modern decorator proposals
 */
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

/**
 * Creates a decorator that works with Legacy decorator proposals
 * @param description - The decorator description object
 * @returns A decorator function compatible with Legacy decorators
 */
export function legacyDecorator<T = any>(description: DecoratorDescription<T>): any {
	return function (
		this: any,
		target: any,
		propertyKey?: PropertyKey,
		descriptor?: PropertyDescriptor,
		...args: any[]
	) {
		if (propertyKey === undefined) {
			if (isConstructor(target)) {
				if (!('class' in description)) throw new Error('Decorator cannot be applied to a class')
				return description.class!(target)
			}
		} else if (typeof target === 'object' && ['string', 'symbol'].includes(typeof propertyKey)) {
			if (!descriptor) throw new Error('Decorator cannot be applied to a field')
			else if (typeof descriptor === 'object' && 'configurable' in descriptor) {
				if ('get' in descriptor || 'set' in descriptor) {
					if (!('getter' in description || 'setter' in description))
						throw new Error('Decorator cannot be applied to a getter or setter')
					if ('getter' in description) {
						const newGetter = description.getter!(descriptor.get as any, target, propertyKey)
						if (newGetter) descriptor.get = newGetter
					}
					if ('setter' in description) {
						const newSetter = description.setter!(descriptor.set as any, target, propertyKey)
						if (newSetter) descriptor.set = newSetter
					}
					return descriptor
				} else if (typeof descriptor.value === 'function') {
					if (!('method' in description)) throw new Error('Decorator cannot be applied to a method')
					const newMethod = description.method!(descriptor.value, target, propertyKey)
					if (newMethod) descriptor.value = newMethod
					return descriptor
				}
			}
		}
		if (!('default' in description))
			throw new Error('Decorator do not have a default implementation')
		return description.default!.call(this, target, propertyKey, descriptor, ...args)
	}
}

/**
 * Creates a decorator that works with Modern decorator proposals
 * @param description - The decorator description object
 * @returns A decorator function compatible with Modern decorators
 */
export function modernDecorator<T = any>(description: DecoratorDescription<T>): any {
	/*return function (target: any, context?: DecoratorContext, ...args: any[]) {*/
	return function (this: any, target: any, context?: DecoratorContext, ...args: any[]) {
		if (!context?.kind || typeof context.kind !== 'string') {
			if (!('default' in description))
				throw new Error('Decorator do not have a default implementation')
			return description.default!.call(this, target, context, ...args)
		}
		switch (context.kind) {
			case 'class':
				if (!('class' in description)) throw new Error('Decorator cannot be applied to a class')
				return description.class!(target)
			case 'field':
				throw new Error('Decorator cannot be applied to a field')
			case 'getter':
				if (!('getter' in description)) throw new Error('Decorator cannot be applied to a getter')
				return description.getter!(target, target, context.name)
			case 'setter':
				if (!('setter' in description)) throw new Error('Decorator cannot be applied to a setter')
				return description.setter!(target, target, context.name)
			case 'method':
				if (!('method' in description)) throw new Error('Decorator cannot be applied to a method')
				return description.method!(target, target, context.name)
			case 'accessor': {
				if (!('getter' in description || 'setter' in description))
					throw new Error('Decorator cannot be applied to a getter or setter')
				const rv: Partial<ClassAccessorDecoratorResult<any, any>> = {}
				if ('getter' in description) {
					const newGetter = description.getter!(target.get, target, context.name)
					if (newGetter) rv.get = newGetter
				}
				if ('setter' in description) {
					const newSetter = description.setter!(target.set, target, context.name)
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

/**
 * Main decorator factory that automatically detects and works with both Legacy and Modern decorator proposals
 * @param description - The decorator description object
 * @returns A decorator that works in both Legacy and Modern environments
 */
export const decorator: DecoratorFactory<any> = (description: DecoratorDescription<any>) => {
	const modern = modernDecorator(description)
	const legacy = legacyDecorator(description)
	return ((target: any, contextOrKey?: any, ...args: any[]) => {
		const mode = detectDecoratorMode(target, contextOrKey, args[0])
		return mode === 'modern'
			? modern(target, contextOrKey, ...args)
			: legacy(target, contextOrKey, ...args)
	}) as any
}

/**
 * Generic class decorator type that works with both Legacy and Modern decorator proposals
 */
export type GenericClassDecorator<T> = LegacyClassDecorator<abstract new (...args: any[]) => T> &
	ModernClassDecorator<abstract new (...args: any[]) => T>
