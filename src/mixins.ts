import { isConstructor } from './utils'

/**
 * A mixin function that takes a base class and returns a new class with mixed-in functionality
 */
export type MixinFunction<Mixed> = <Base>(
	base: new (...args: any[]) => Base
) => new (
	...args: any[]
) => Base & Mixed

/**
 * A mixin class that can be used both as a base class and as a mixin function
 */
export type MixinClass<Mixed> = new (...args: any[]) => Mixed

/**
 * Creates a mixin that can be used both as a class (extends) and as a function (mixin)
 *
 * This function supports:
 * - Using mixins as base classes: `class MyClass extends MyMixin`
 * - Using mixins as functions: `class MyClass extends MyMixin(SomeBase)`
 * - Composing mixins: `const Composed = MixinA(MixinB)`
 * - Type-safe property inference for all patterns
 *
 * @param mixinFunction - The function that creates the mixin
 * @param unwrapFunction - Optional function to unwrap reactive objects for method calls
 * @returns A mixin that can be used both as a class and as a function
 */
export function mixin<MixinFn extends (base: any) => new (...args: any[]) => any>(
	mixinFunction: MixinFn,
	unwrapFunction?: (obj: any) => any
): (new (
	...args: any[]
) => InstanceType<ReturnType<MixinFn>>) &
	(<Base>(
		base: abstract new (...args: any[]) => Base
	) => new (
		...args: any[]
	) => InstanceType<ReturnType<MixinFn>> & Base) {
	/**
	 * Cache for mixin results to ensure the same base class always returns the same mixed class
	 */
	const mixinCache = new WeakMap<new (...args: any[]) => any, new (...args: any[]) => any>()

	// Apply the mixin to Object as the base class
	const MixedBase = mixinFunction(Object)
	mixinCache.set(Object, MixedBase)

	// Create the proxy that handles both constructor and function calls
	return new Proxy(MixedBase, {
		// Handle `MixinClass(SomeBase)` - use as mixin function
		apply(_target, _thisArg, args) {
			if (args.length === 0) {
				throw new Error('Mixin requires a base class')
			}

			const baseClass = args[0]
			if (typeof baseClass !== 'function') {
				throw new Error('Mixin requires a constructor function')
			}

			// Check if it's a valid constructor or a mixin
			if (
				!isConstructor(baseClass) &&
				!(baseClass && typeof baseClass === 'function' && baseClass.prototype)
			) {
				throw new Error('Mixin requires a valid constructor')
			}

			// Check cache first
			const cached = mixinCache.get(baseClass)
			if (cached) {
				return cached
			}

			let usedBase = baseClass
			if (unwrapFunction) {
				// Create a proxied base class that handles method unwrapping
				const ProxiedBaseClass = class extends baseClass {}

				// Proxy the prototype methods to handle unwrapping
				const originalPrototype = baseClass.prototype
				const proxiedPrototype = new Proxy(originalPrototype, {
					get(target, prop, receiver) {
						const value = Reflect.get(target, prop, receiver)

						// Only wrap methods that are likely to access private fields
						// Skip symbols and special properties that the reactive system needs
						if (
							typeof value === 'function' &&
							typeof prop === 'string' &&
							!['constructor', 'toString', 'valueOf'].includes(prop)
						) {
							// Return a wrapped version that uses unwrapped context
							return function (...args: any[]) {
								// Use the unwrapping function if provided, otherwise use this
								const context = unwrapFunction(this)
								return value.apply(context, args)
							}
						}

						return value
					},
				})

				// Set the proxied prototype
				Object.setPrototypeOf(ProxiedBaseClass.prototype, proxiedPrototype)
				usedBase = ProxiedBaseClass
			}

			// Create the mixed class using the proxied base class
			const mixedClass = mixinFunction(usedBase)

			// Cache the result
			mixinCache.set(baseClass, mixedClass)

			return mixedClass
		},
	}) as MixinFn & (new (...args: any[]) => InstanceType<ReturnType<MixinFn>>)
}
