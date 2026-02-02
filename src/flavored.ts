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
export function flavored<T extends (...args: any[]) => any, F extends Record<string, any>>(
	fn: T,
	flavors: F
): T & F {
	return new Proxy(fn, {
		apply(target, thisArg, args) {
			return target.apply(thisArg, args)
		},
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
	transform: (...args: Parameters<T>) => Parameters<T>
): T {
	return new Proxy(fn, {
		apply(target, thisArg, args: Parameters<T>) {
			return target.apply(thisArg, transform(...args))
		},
	}) as T
}

/**
 * Creates a new flavored function that merges options objects.
 * Useful when the last argument is an options object that should be merged.
 *
 * @param fn - The base flavored function
 * @param defaultOptions - Options to merge with the provided options
 * @returns A new flavored function with merged options
 *
 * @example
 * ```typescript
 * const opaqueEffect = flavorOptions(effect, { opaque: true })
 * const namedEffect = flavorOptions(effect, { name: 'myEffect' })
 * ```
 */
export function flavorOptions<T extends (...args: any[]) => any>(
	fn: T,
	defaultOptions: Record<string, any>
): T {
	return new Proxy(fn, {
		apply(target, thisArg, args) {
			const lastArg = args[args.length - 1]
			const mergedArgs =
				lastArg !== undefined && typeof lastArg === 'object'
					? [...args.slice(0, -1), { ...defaultOptions, ...lastArg }]
					: [...args, defaultOptions]
			return target.apply(thisArg, mergedArgs)
		},
	}) as T
}
