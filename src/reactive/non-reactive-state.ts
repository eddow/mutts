
export const nonReactiveObjects = new WeakSet<object>()
const nonReactiveClasses = new WeakSet<object>()
export const unreactiveProps = new WeakMap<object, Set<PropertyKey>>()
let unreactivePropsCount = 0

export function addUnreactiveProps(proto: object, set: Set<PropertyKey>) {
	unreactiveProps.set(proto, set)
	unreactivePropsCount++
}

/** Check if a property is marked unreactive on obj or any of its prototypes (trap-free) */
export function isUnreactiveProp(obj: object, prop: PropertyKey): boolean {
	if (!unreactivePropsCount) return false
	let target: object | null = obj
	while (target) {
		if (unreactiveProps.get(target)?.has(prop)) return true
		target = Object.getPrototypeOf(target)
	}
	return false
}
export const immutables = new Set<(tested: any) => boolean>()
export const absent = Symbol('absent')

function markNonReactive<T extends object[]>(...obj: T): T[0] {
	for (const o of obj) nonReactiveObjects.add(o as object)
	return obj[0]
}

export function nonReactiveClass<T extends (new (...args: any[]) => any)[]>(...cls: T): T[0] {
	for (const c of cls) if (c) nonReactiveClasses.add(c.prototype)
	return cls[0]
}

export function isNonReactive(obj: any): boolean {
	if (obj === null || typeof obj !== 'object') return true
	if (nonReactiveObjects.has(obj)) return true
	// Walk the prototype chain on the raw object to check for non-reactive classes
	let proto = Object.getPrototypeOf(obj)
	while (proto) {
		if (nonReactiveClasses.has(proto)) return true
		proto = Object.getPrototypeOf(proto)
	}
	for (const fn of immutables) if (fn(obj)) return true
	return false
}


nonReactiveClass(Date, RegExp, Error, Promise, Function)
if (typeof window !== 'undefined') {
	markNonReactive(window, document)
	nonReactiveClass(Node, Element, HTMLElement, EventTarget, HTMLCollection, NodeList)
}

export { markNonReactive as nonReactive }
