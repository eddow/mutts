/**
 * Creates a flavored (extensible) version of a function with chainable property modifiers.
 *
 * Each property defined in `flavors` returns a new flavored function that transforms
 * how the original function is called. This enables a fluent API where properties
 * create specialized variants of the base function.
 *
 * @param fn - The base function to flavor
 * @param flavors - Object defining the flavor properties (getters or methods)
 * @returns A proxy of the function with the flavor properties attached
 *
 * @example
 * ```typescript
 * function greet(name: string, options?: { loud?: boolean }) {
 *   const greeting = `Hello, ${name}!`
 *   return options?.loud ? greeting.toUpperCase() : greeting
 * }
 *
 * const flavoredGreet = flavored(greet, {
 *   get loud() {
 *     return createFlavor(this, (name, opts) => [name, { ...opts, loud: true }])
 *   }
 * })
 *
 * flavoredGreet('World') // "Hello, World!"
 * flavoredGreet.loud('World') // "HELLO, WORLD!"
 * ```
 */
import { named } from './utils'

/**
 * Creates a flavored (extensible) version of a function with chainable property modifiers.
 */
export function flavored<T extends (...args: any[]) => any, F>(
	fn: T,
	flavors: F & ThisType<T & F>
): T & F {
	// Store flavors for recursive flavoring
	;(fn as any).flavors = flavors

	return new Proxy(fn, {
		get(target, prop, receiver) {
			if (prop in flavors) {
				return Reflect.get(flavors, prop, receiver)
			}
			return (target as any)[prop]
		},
	}) as T & F
}

/**
 * Creates a new flavored function that transforms arguments before calling the base.
 *
 * @param fn - The base flavored function
 * @param transform - Function that receives the original arguments and returns transformed arguments
 * @returns A new flavored function with the transformation applied
 *
 * @example
 * ```typescript
 * const loudGreet = createFlavor(greet, (name, opts) => [name, { ...opts, loud: true }])
 * ```
 */
export function createFlavor<T extends (...args: any[]) => any>(
	fn: T,
	transform: (...args: Parameters<T>) => Parameters<T>,
	name?: string
): T {
	const fct = function flavorWrapper(this: any, ...args: Parameters<T>) {
		return fn.apply(this, transform(...args))
	}
	if (name) named(name, fct)

	return flavored(fct as T, (fn as any).flavors || {})
}

/**
 * Creates a new flavored function that merges options objects at a specific index.
 * By default, uses the function's arity (length) as the index for options.
 *
 * @param fn - The base flavored function
 * @param defaultOptions - Options to merge
 * @param optionsIndex - Optional explicit index for options (defaults to fn.length)
 * @param name - Optional name for the wrapper
 * @returns A new flavored function
 */
export function flavorOptions<T extends (...args: any[]) => any>(
	fn: T,
	defaultOptions: Record<string, any>,
	opts: {
		optionsIndex?: number
		name?: string
	} = {}
): T {
	// If the function is already flavorOptions-wrapped, it might have an index stored
	const targetIndex = opts.optionsIndex ?? (fn as any).optionsIndex ?? fn.length

	const fct = function flavorOptionsWrapper(this: any, ...args: any[]) {
		const newArgs = [...args]

		// Ensure we have enough arguments to reach the options index
		while (newArgs.length <= targetIndex) {
			newArgs.push(undefined)
		}

		const currentOptions = newArgs[targetIndex]
		const isObject =
			currentOptions !== null &&
			typeof currentOptions === 'object' &&
			!Array.isArray(currentOptions)

		newArgs[targetIndex] = isObject ? { ...defaultOptions, ...currentOptions } : defaultOptions

		return fn.apply(this, newArgs)
	}

	if (opts.name) named(`${fn.name}.${opts.name}`, fct)

	// Preserve arity and options track
	Object.defineProperty(fct, 'length', { value: fn.length })
	;(fct as any).optionsIndex = targetIndex

	return flavored(fct as T, (fn as any).flavors || {})
}
