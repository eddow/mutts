import { decorator, GenericClassDecorator } from './decorator'

// In order to avoid async re-entrance, we could use zone.js or something like that.
const syncCalculating: { object: object; prop: PropertyKey }[] = []
export const cached = decorator({
	getter(propertyKey, original) {
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

export function isCached(object: Object, propertyKey: PropertyKey) {
	return !!Object.getOwnPropertyDescriptor(object, propertyKey)
}

export function cache(object: Object, propertyKey: PropertyKey, value: any) {
	Object.defineProperty(object, propertyKey, { value })
}

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

export const deprecated = Object.assign(
	decorator({
		method(propertyKey, original) {
			return function (this: any, ...args: any[]) {
				deprecated.warn(this, propertyKey)
				return original.apply(this, args)
			}
		},
		getter(propertyKey, original) {
			return function (this: any) {
				deprecated.warn(this, propertyKey)
				return original.call(this)
			}
		},
		setter(propertyKey, original) {
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
	}),
	{
		warn: (target: any, propertyKey: PropertyKey) => {
			// biome-ignore lint/suspicious/noConsole: To be overridden
			console.warn(`${target.constructor.name}.${String(propertyKey)} is deprecated`)
		},
	}
)

export function debounce(delay: number) {
	return decorator({
		method(_propertyKey, original) {
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

export function throttle(delay: number) {
	return decorator({
		method(_propertyKey, original) {
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
