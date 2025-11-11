import { nativeReactive, nonReactiveMark } from './types'

export const nonReactiveObjects = new WeakSet<object>()
export const immutables = new Set<(tested: any) => boolean>()
export const absent = Symbol('absent')

function markNonReactive<T extends object[]>(...obj: T): T[0] {
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

export function nonReactiveClass<T extends (new (...args: any[]) => any)[]>(...cls: T): T[0] {
	for (const c of cls) if (c) (c.prototype as any)[nonReactiveMark] = true
	return cls[0]
}

export function isNonReactive(obj: any): boolean {
	if (obj === null || typeof obj !== 'object') return true
	if (nonReactiveObjects.has(obj)) return true
	if ((obj as any)[nonReactiveMark]) return true
	for (const fn of immutables) if (fn(obj)) return true
	return false
}

export function registerNativeReactivity(
	originalClass: new (...args: any[]) => any,
	reactiveClass: new (...args: any[]) => any
) {
	originalClass.prototype[nativeReactive] = reactiveClass
	nonReactiveClass(reactiveClass)
}

nonReactiveClass(Date, RegExp, Error, Promise, Function)
if (typeof window !== 'undefined') markNonReactive(window, document)

export { markNonReactive as nonReactive }

