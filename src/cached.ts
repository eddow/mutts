// In order to avoid async re-entrance, we could use zone.js or something like that.
const syncCalculating: { object: object; prop: PropertyKey }[] = []
export function cached(_target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
	const original = descriptor.get
	if (!original) {
		throw new Error('@cached can only be used on getters')
	}

	descriptor.get = function (this: any) {
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

	return descriptor
}

export function isCached(object: Object, propertyKey: PropertyKey) {
	return !!Object.getOwnPropertyDescriptor(object, propertyKey)
}

export function cache(object: Object, propertyKey: PropertyKey, value: any) {
	Object.defineProperty(object, propertyKey, { value })
}
