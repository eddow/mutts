type ElementTypes<T extends readonly unknown[]> = {
	[K in keyof T]: T[K] extends readonly (infer U)[] ? U : T[K]
}

/**
 * Yields tuples containing elements from each input array, stopping at the longest array length
 * @param args - Arrays to zip together
 * @returns Generator yielding tuples containing elements from each input array
 */
export function* zip<T extends (readonly unknown[])[]>(...args: T): Generator<ElementTypes<T>> {
	if (!args.length) return []
	const maxLength = Math.max(...args.map((arr) => arr.length))

	for (let i = 0; i < maxLength; i++) {
		const tuple = args.map((arr) => arr[i]) as ElementTypes<T>
		yield tuple
	}
}

/**
 * Checks if two arrays are strictly equal (shallow comparison)
 * @param a - First value
 * @param b - Second value
 * @returns True if arrays are equal or values are strictly equal
 */
export function arrayEquals(a: any, b: any): boolean {
	if (!Array.isArray(a) || !Array.isArray(b)) return false
	if (a === b) return true
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false
	}
	return true
}

const nativeConstructors = new Set<Function>([
	Object,
	Array,
	Date,
	Function,
	Set,
	Map,
	WeakMap,
	WeakSet,
	Promise,
	Error,
	TypeError,
	ReferenceError,
	SyntaxError,
	RangeError,
	URIError,
	EvalError,
	Reflect,
	Proxy,
	RegExp,
	String,
	Number,
	Boolean,
] as Function[])
/**
 * Checks if a function is a constructor (class or constructor function)
 * @param fn - The function to check
 * @returns True if the function is a constructor
 */
export function isConstructor(fn: Function): boolean {
	return (
		fn &&
		typeof fn === 'function' &&
		(nativeConstructors.has(fn) || fn.toString?.().startsWith('class '))
	)
}

/**
 * Checks if a value is an object
 * @param value - The value to check
 * @returns True if the value is an object
 */
export function isObject(value: any): value is object {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		!(
			value instanceof Date ||
			value instanceof RegExp ||
			value instanceof Error ||
			value instanceof Set ||
			value instanceof Map ||
			value instanceof WeakSet ||
			value instanceof WeakMap ||
			value instanceof Promise ||
			value instanceof Function
		)
	)
}

const hasNode = typeof Node !== 'undefined'
export const FoolProof = {
	get(obj: any, prop: any, receiver: any) {
		if (hasNode && obj instanceof Node) return (obj as any)[prop]
		return Reflect.get(obj, prop, receiver)
	},
	set(obj: any, prop: any, value: any, receiver: any) {
		if (hasNode && obj instanceof Node) {
			;(obj as any)[prop] = value
			return true
		}
		if (!(obj instanceof Object) && !Reflect.has(obj, prop)) {
			Object.defineProperty(obj, prop, {
				value,
				configurable: true,
				writable: true,
				enumerable: true,
			})
			return true
		}
		return Reflect.set(obj, prop, value, receiver)
	},
}

export function isOwnAccessor(obj: any, prop: any) {
	const opd = Object.getOwnPropertyDescriptor(obj, prop)
	return !!(opd?.get || opd?.set)
}

/**
 * Deeply compares two values.
 * For objects, compares prototypes with === and then own properties recursively.
 * Uses a cache to handle circular references.
 * @param a - First value
 * @param b - Second value
 * @param cache - Map for circular reference protection (internal use)
 * @returns True if values are deeply equal
 */
export function deepCompare(a: any, b: any, cache = new Map<object, Set<object>>()): boolean {
	if (a === b) return true

	if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
		return a === b
	}

	// Prototype check
	const protoA = Object.getPrototypeOf(a)
	const protoB = Object.getPrototypeOf(b)
	if (protoA !== protoB) {
		console.warn(`[deepCompare] prototype mismatch:`, {
			nameA: a?.constructor?.name,
			nameB: b?.constructor?.name,
		})
		return false
	}
	// Circular reference protection
	let compared = cache.get(a)
	if (compared?.has(b)) return true
	if (!compared) {
		compared = new Set()
		cache.set(a, compared)
	}
	compared.add(b)

	// Handle specific object types
	if (Array.isArray(a)) {
		if (!Array.isArray(b)) {
			console.warn(`[deepCompare] B is not an array`)
			return false
		}
		if (a.length !== b.length) {
			console.warn(`[deepCompare] array length mismatch:`, { lenA: a.length, lenB: b.length })
			return false
		}
		for (let i = 0; i < a.length; i++) {
			if (!deepCompare(a[i], b[i], cache)) {
				console.warn(`[deepCompare] array element mismatch at index ${i}`)
				return false
			}
		}
		return true
	}

	if (a instanceof Date) {
		const match = b instanceof Date && a.getTime() === b.getTime()
		if (!match) console.warn(`[deepCompare] Date mismatch`)
		return match
	}
	if (a instanceof RegExp) {
		const match = b instanceof RegExp && a.toString() === b.toString()
		if (!match) console.warn(`[deepCompare] RegExp mismatch`)
		return match
	}
	if (a instanceof Set) {
		if (!(b instanceof Set) || a.size !== b.size) {
			console.warn(`[deepCompare] Set size mismatch`)
			return false
		}
		for (const val of a) {
			let found = false
			for (const bVal of b) {
				if (deepCompare(val, bVal, cache)) {
					found = true
					break
				}
			}
			if (!found) {
				console.warn(`[deepCompare] missing Set element`)
				return false
			}
		}
		return true
	}
	if (a instanceof Map) {
		if (!(b instanceof Map) || a.size !== b.size) {
			console.warn(`[deepCompare] Map size mismatch`)
			return false
		}
		for (const [key, val] of a) {
			if (!b.has(key)) {
				let foundMatch = false
				for (const [bKey, bVal] of b) {
					if (deepCompare(key, bKey, cache) && deepCompare(val, bVal, cache)) {
						foundMatch = true
						break
					}
				}
				if (!foundMatch) {
					console.warn(`[deepCompare] missing Map key`)
					return false
				}
			} else {
				if (!deepCompare(val, b.get(key), cache)) {
					console.warn(`[deepCompare] Map value mismatch for key`)
					return false
				}
			}
		}
		return true
	}

	// Compare own properties
	const keysA = Object.keys(a)
	const keysB = Object.keys(b)
	if (keysA.length !== keysB.length) {
		console.warn(`[deepCompare] keys length mismatch:`, {
			lenA: keysA.length,
			lenB: keysB.length,
			keysA,
			keysB,
			a,
			b,
		})
		return false
	}

	for (const key of keysA) {
		if (!Object.hasOwn(b, key)) {
			console.warn(`[deepCompare] missing key ${String(key)} in B`)
			return false
		}
		if (!deepCompare(a[key], b[key], cache)) {
			console.warn(`[deepCompare] value mismatch for key ${String(key)}:`, {
				valA: a[key],
				valB: b[key],
			})
			return false
		}
	}

	return true
}

// Internal use: Used for reactive sets/maps to differentiate between different reactive containers: `x.get('aKey')` vs. `x['aKey']`
const contentRefs = new WeakMap<object, any>()
export function contentRef(container: object) {
	if (!contentRefs.has(container))
		contentRefs.set(
			container,
			Object.seal(
				Object.create(null, {
					contentOf: { value: container, writable: false, configurable: false },
				})
			)
		)
	return contentRefs.get(container)
}

/**
 * Tags an object with a name
 * @param name - The name to tag the object with
 * @param obj - The object to tag
 * @returns The object with the tag
 */
export function tag<T extends object>(name: string, obj: T): T {
	Object.defineProperties(obj, {
		[Symbol.toStringTag]: {
			value: name,
			writable: false,
			configurable: true,
		},
		toString: {
			value: () => name,
			writable: false,
			configurable: true,
		},
	})
	return obj
}

/**
 * Renames a function with a new name
 * @param name - The new name for the function
 * @param fn - The function to rename
 * @returns The function with the new name
 */
export function named<T extends Function>(name: string, fn: T): T {
	Object.defineProperty(fn, 'name', {
		value: fn.name ? `${fn.name}::${name}` : name,
		writable: false,
		configurable: true,
	})
	return fn
}

export function* stringKeys(o: object) {
	for (const key in o) yield key
}