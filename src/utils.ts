type ElementTypes<T extends readonly unknown[]> = {
	[K in keyof T]: T[K] extends readonly (infer U)[] ? U : T[K]
}

/**
 * Combines multiple arrays into an array of tuples, stopping at the shortest array length
 * @param args - Arrays to zip together
 * @returns Array of tuples containing elements from each input array
 */
export function zip<T extends (readonly unknown[])[]>(...args: T): ElementTypes<T>[] {
	if (!args.length) return []
	const minLength = Math.min(...args.map((arr) => arr.length))
	const result: ElementTypes<T>[] = []

	for (let i = 0; i < minLength; i++) {
		const tuple = args.map((arr) => arr[i]) as ElementTypes<T>
		result.push(tuple)
	}

	return result
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
 * Renames a function with a new name
 * @param fct - The function to rename
 * @param name - The new name for the function
 * @returns The function with the new name
 */
export function renamed<F extends Function>(fct: F, name: string): F {
	return Object.defineProperties(fct, {
		name: {
			value: name,
		},
	})
}

export function ReflectGet(obj: any, prop: any, receiver: any) {
	// Check if Node is available and obj is an instance of Node
	if (typeof Node !== 'undefined' && obj instanceof Node) return obj[prop]
	return Reflect.get(obj, prop, receiver)
}

export function ReflectSet(obj: any, prop: any, value: any, receiver: any) {
	// Check if Node is available and obj is an instance of Node
	if (typeof Node !== 'undefined' && obj instanceof Node) {
		obj[prop] = value
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
}

export function isOwnAccessor(obj: any, prop: any) {
	const opd = Object.getOwnPropertyDescriptor(obj, prop)
	return !!(opd?.get || opd?.set)
}
