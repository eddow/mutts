import { reactive } from './proxy'
import { nativeReactive, nonReactiveMark } from './types'

// Track objects that should never be reactive and cannot be modified
/**
 * WeakSet containing objects that should never be made reactive
 */
export const nonReactiveObjects = new WeakSet<object>()

const absent = Symbol('absent')

/**
 * Converts an iterator to a generator that yields reactive values
 */
export function* makeReactiveIterator<T>(iterator: Iterator<T>): Generator<T> {
	let result = iterator.next()
	while (!result.done) {
		yield reactive(result.value)
		result = iterator.next()
	}
}

/**
 * Converts an iterator of key-value pairs to a generator that yields reactive key-value pairs
 */
export function* makeReactiveEntriesIterator<K, V>(iterator: Iterator<[K, V]>): Generator<[K, V]> {
	let result = iterator.next()
	while (!result.done) {
		const [key, value] = result.value
		yield [reactive(key), reactive(value)]
		result = iterator.next()
	}
}

/**
 * Mark an object as non-reactive. This object and all its properties will never be made reactive.
 * @param obj - The object to mark as non-reactive
 */
function nonReactive<T extends object[]>(...obj: T): T[0] {
	for (const o of obj) {
		try {
			Object.defineProperty(o, nonReactiveMark, {
				value: true,
				writable: false,
				enumerable: false,
				configurable: false,
			})
		} catch {}
		if (!(nonReactiveMark in (o as object))) nonReactiveObjects.add(o as object)
	}
	return obj[0]
}

/**
 * Set of functions that test if objects are immutable
 * Objects that pass these tests will not be made reactive
 */
export const immutables = new Set<(tested: any) => boolean>()

/**
 * Checks if an object is marked as non-reactive
 * @param obj - The object to check
 * @returns True if the object is non-reactive
 */
export function isNonReactive(obj: any): boolean {
	// Don't make primitives reactive
	if (obj === null || typeof obj !== 'object') return true

	// Check if the object itself is marked as non-reactive
	if (nonReactiveObjects.has(obj)) return true

	// Check if the object has the non-reactive symbol
	if (obj[nonReactiveMark]) return true

	// Check if the object is immutable
	for (const fn of immutables) if (fn(obj)) return true

	return false
}

/**
 * Marks classes as non-reactive
 * @param cls - Classes to mark as non-reactive
 * @returns The first class (for chaining)
 */
export function nonReactiveClass<T extends (new (...args: any[]) => any)[]>(...cls: T): T[0] {
	for (const c of cls) if (c) (c.prototype as any)[nonReactiveMark] = true
	return cls[0]
}

nonReactiveClass(Date, RegExp, Error, Promise, Function)
if (typeof window !== 'undefined') nonReactive(window, document)
//if (typeof Element !== 'undefined') nonReactiveClass(Element, Node)

/**
 * Registers a native class to use a specialized reactive wrapper
 * @param originalClass - The original class to register
 * @param reactiveClass - The reactive wrapper class
 */
export function registerNativeReactivity(
	originalClass: new (...args: any[]) => any,
	reactiveClass: new (...args: any[]) => any
) {
	originalClass.prototype[nativeReactive] = reactiveClass
	nonReactiveClass(reactiveClass)
}

export { absent }
