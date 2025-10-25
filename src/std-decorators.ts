import { decorator, GenericClassDecorator } from './decorator'

// In order to avoid async re-entrance, we could use zone.js or something like that.
const syncCalculating: { object: object; prop: PropertyKey }[] = []
/**
 * Decorator that caches the result of a getter method and only recomputes when dependencies change
 * Prevents circular dependencies and provides automatic cache invalidation
 */
export const cached = decorator({
	getter(original, propertyKey) {
		return function (this: any) {
			const alreadyCalculating = syncCalculating.findIndex(
				(c) => c.object === this && c.prop === propertyKey
			)
			if (alreadyCalculating > -1)
				throw new Error(
					`Circular dependency detected: ${syncCalculating
						.slice(alreadyCalculating)
						.map((c) => `${c.object.constructor.name}.${String(c.prop)}`)
						.join(' -> ')} -> again`
				)
			syncCalculating.push({ object: this, prop: propertyKey })
			try {
				const rv = original.call(this)
				cache(this, propertyKey, rv)
				return rv
			} finally {
				syncCalculating.pop()
			}
		}
	},
})

/**
 * Checks if a property is cached (has a cached value)
 * @param object - The object to check
 * @param propertyKey - The property key to check
 * @returns True if the property has a cached value
 */
export function isCached(object: Object, propertyKey: PropertyKey) {
	return !!Object.getOwnPropertyDescriptor(object, propertyKey)
}

/**
 * Caches a value for a property on an object
 * @param object - The object to cache the value on
 * @param propertyKey - The property key to cache
 * @param value - The value to cache
 */
export function cache(object: Object, propertyKey: PropertyKey, value: any) {
	Object.defineProperty(object, propertyKey, { value })
}

/**
 * Creates a decorator that modifies property descriptors for specified properties
 * @param descriptor - The descriptor properties to apply
 * @returns A class decorator that applies the descriptor to specified properties
 */
export function describe(descriptor: {
	enumerable?: boolean
	configurable?: boolean // Not modifiable once the property has been defined ?
	writable?: boolean
}) {
	return <T>(...properties: (keyof T)[]): GenericClassDecorator<T> =>
		(Base) => {
			return class extends Base {
				constructor(...args: any[]) {
					super(...args)
					for (const key of properties) {
						Object.defineProperty(this, key, {
							...Object.getOwnPropertyDescriptor(this, key),
							...descriptor,
						})
					}
				}
			}
		}
}

/**
 * Decorator that marks methods, properties, or classes as deprecated
 * Provides warning messages when deprecated items are used
 */
export const deprecated = Object.assign(
	decorator({
		method(original, propertyKey) {
			return function (this: any, ...args: any[]) {
				deprecated.warn(this, propertyKey)
				return original.apply(this, args)
			}
		},
		getter(original, propertyKey) {
			return function (this: any) {
				deprecated.warn(this, propertyKey)
				return original.call(this)
			}
		},
		setter(original, propertyKey) {
			return function (this: any, value: any) {
				deprecated.warn(this, propertyKey)
				return original.call(this, value)
			}
		},
		class(original) {
			return class extends original {
				constructor(...args: any[]) {
					super(...args)
					deprecated.warn(this, 'constructor')
				}
			}
		},
		default(message: string) {
			return decorator({
				method(original, propertyKey) {
					return function (this: any, ...args: any[]) {
						deprecated.warn(this, propertyKey, message)
						return original.apply(this, args)
					}
				},
				getter(original, propertyKey) {
					return function (this: any) {
						deprecated.warn(this, propertyKey, message)
						return original.call(this)
					}
				},
				setter(original, propertyKey) {
					return function (this: any, value: any) {
						deprecated.warn(this, propertyKey, message)
						return original.call(this, value)
					}
				},
				class(original) {
					return class extends original {
						constructor(...args: any[]) {
							super(...args)
							deprecated.warn(this, 'constructor', message)
						}
					}
				},
			})
		},
	}),
	{
		warn: (target: any, propertyKey: PropertyKey, message?: string) => {
			// biome-ignore lint/suspicious/noConsole: To be overridden
			console.warn(
				`${target.constructor.name}.${String(propertyKey)} is deprecated${message ? `: ${message}` : ''}`
			)
		},
	}
)

/**
 * Creates a debounced method decorator that delays execution until after the delay period has passed
 * @param delay - The delay in milliseconds
 * @returns A method decorator that debounces method calls
 */
export function debounce(delay: number) {
	return decorator({
		method(original, _propertyKey) {
			let timeoutId: ReturnType<typeof setTimeout> | null = null

			return function (this: any, ...args: any[]) {
				// Clear existing timeout
				if (timeoutId) {
					clearTimeout(timeoutId)
				}

				// Set new timeout
				timeoutId = setTimeout(() => {
					original.apply(this, args)
					timeoutId = null
				}, delay)
			}
		},
	})
}

/**
 * Creates a throttled method decorator that limits execution to once per delay period
 * @param delay - The delay in milliseconds
 * @returns A method decorator that throttles method calls
 */
export function throttle(delay: number) {
	return decorator({
		method(original, _propertyKey) {
			let lastCallTime = 0
			let timeoutId: ReturnType<typeof setTimeout> | null = null

			return function (this: any, ...args: any[]) {
				const now = Date.now()

				// If enough time has passed since last call, execute immediately
				if (now - lastCallTime >= delay) {
					// Clear any pending timeout since we're executing now
					if (timeoutId) {
						clearTimeout(timeoutId)
						timeoutId = null
					}
					lastCallTime = now
					return original.apply(this, args)
				}

				// Otherwise, schedule execution for when the delay period ends
				if (!timeoutId) {
					const remainingTime = delay - (now - lastCallTime)
					const scheduledArgs = [...args] // Capture args at scheduling time
					timeoutId = setTimeout(() => {
						lastCallTime = Date.now()
						original.apply(this, scheduledArgs)
						timeoutId = null
					}, remainingTime)
				}
			}
		},
	})
}
