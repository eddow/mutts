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

type AnyFunction = (...args: any[]) => any
type CaptionedOptions<T extends AnyFunction> = {
	callbackIndex?: number
	name?: string
	rename?: (caption: string, callback: Function) => unknown
	warn?: (message: string) => void
	shouldWarnAnonymous?: (callback: Function, args: Parameters<T>) => boolean
}
type ResolvedCaptionedOptions<T extends AnyFunction> = {
	callbackIndex: number
	name: string
	rename: NonNullable<CaptionedOptions<T>['rename']>
	warn: NonNullable<CaptionedOptions<T>['warn']>
	shouldWarnAnonymous?: CaptionedOptions<T>['shouldWarnAnonymous']
}

const captionedOptionsSymbol = Symbol('mutts.captioned.options')

export type Captioned<T extends AnyFunction> = T & {
	(strings: TemplateStringsArray, ...values: readonly unknown[]): T
}

function isTemplateStringsArray(value: unknown): value is TemplateStringsArray {
	return (
		Array.isArray(value) &&
		Object.hasOwn(value, 'raw') &&
		Array.isArray((value as unknown as TemplateStringsArray).raw)
	)
}

function renderTemplate(strings: TemplateStringsArray, values: readonly unknown[]) {
	let result = strings[0] ?? ''
	for (let i = 0; i < values.length; i++) result += String(values[i]) + (strings[i + 1] ?? '')
	return result
}

function renameCallback<T extends Function>(caption: string, callback: T): T {
	Object.defineProperty(callback, 'name', {
		value: caption,
		writable: false,
		configurable: true,
	})
	return callback
}

function isAnonymousCallback(callback: Function) {
	return !callback.name || callback.name === 'anonymous'
}

/**
 * Wraps a callback-first function so it also accepts a tagged-template call form.
 *
 * The template caption is applied to one callback argument before the base
 * function runs. By default, `captioned` targets the first argument, but
 * `callbackIndex` can point to any callback position.
 *
 * This is intended for APIs such as `effect`, `lift`, or `watch` where naming
 * is useful but should remain separate from the flavor system.
 *
 * Plain calls still work:
 * `run(callback)`
 *
 * Captioned calls add a runtime name to the first callback:
 * `` run`task:${id}`(callback) ``
 *
 * Anonymous uncaptioned callbacks may trigger a warning depending on
 * `shouldWarnAnonymous`.
 */
export function captioned<T extends AnyFunction>(
	fn: T,
	options: CaptionedOptions<T> = {}
): Captioned<T> {
	const settings: ResolvedCaptionedOptions<T> = {
		callbackIndex: options.callbackIndex ?? 0,
		name: options.name ?? (fn.name || 'callback'),
		rename: options.rename ?? ((caption, callback) => renameCallback(caption, callback)),
		warn: options.warn ?? ((message) => console.warn(message)),
		shouldWarnAnonymous: options.shouldWarnAnonymous,
	}
	;(fn as T & { [captionedOptionsSymbol]?: CaptionedOptions<T> })[captionedOptionsSymbol] = settings

	return new Proxy(fn, {
		get(target, prop, receiver) {
			if (prop === captionedOptionsSymbol) return settings
			return Reflect.get(target, prop, receiver)
		},
		apply(target, thisArg, args) {
			if (isTemplateStringsArray(args[0])) {
				const caption = renderTemplate(args[0], args.slice(1))
				return function captionedCall(this: unknown, ...callArgs: Parameters<T>) {
					const callback = callArgs[settings.callbackIndex]
					if (typeof callback !== 'function')
						throw new TypeError(
							`${settings.name} template calls require a callback at argument index ${settings.callbackIndex}`
						)
					const nextArgs = [...callArgs] as Parameters<T>
					nextArgs[settings.callbackIndex] = settings.rename(caption, callback) as Parameters<T>[number]
					return Reflect.apply(target, this, nextArgs)
				} as T
			}
			const callback = args[settings.callbackIndex]
			if (typeof callback === 'function' && isAnonymousCallback(callback)) {
				const shouldWarn =
					settings.shouldWarnAnonymous?.(
						callback,
						args as Parameters<T>
					) ?? true
				if (shouldWarn)
					settings.warn(
						`${settings.name}: anonymous callback detected. Use template syntax for automatic naming:\n` +
						`  Current: ${settings.name}(() => { ... })\n` +
						`  Fix:     ${settings.name}\`descriptive-name\`(() => { ... })\n` +
						`The captioned system uses the template literal as the effect name for better debugging.`
					)
			}
			return Reflect.apply(target, thisArg, args)
		},
	}) as Captioned<T>
}

export function inheritCaption<T extends AnyFunction>(source: AnyFunction, target: T): T {
	const settings = (source as AnyFunction & { [captionedOptionsSymbol]?: CaptionedOptions<T> })[
		captionedOptionsSymbol
	]
	return settings ? (captioned(target, settings) as T) : target
}

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

	return flavored(inheritCaption(fn, fct as T), (fn as any).flavors || {})
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

	return flavored(inheritCaption(fn, fct as T), (fn as any).flavors || {})
}
