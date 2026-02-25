import { unreactiveProperties } from './types'
export const absent = Symbol('absent')

/**
 * Add unreactive properties to a prototype.
 * If no set is provided, marks the entire object/prototype as non-reactive (sets [unreactiveProperties] = true).
 * If a set is provided, merges with existing unreactive properties (never overrides true).
 */
export function addUnreactiveProps<T extends object>(proto: T, set?: Iterable<PropertyKey>): T {
	if (unreactiveProperties in proto) {
		const existing = (proto as any)[unreactiveProperties]
		// If already fully unreactive, don't change
		if (existing === true) return proto
		// If no set provided, upgrade to fully unreactive
		if (!set) {
			;(proto as any)[unreactiveProperties] = true
			return proto
		}
		// Merge sets
		set = (proto as any)[unreactiveProperties] = new Set<PropertyKey>((proto as any)[unreactiveProperties])
		for (const p of set) existing.add(p)
	} else 
		// If no set, mark as fully unreactive, otherwise create set
		;(proto as any)[unreactiveProperties] = set ? new Set<PropertyKey>(set) : true
	return proto
}

/** Check if a property is marked unreactive on obj or any of its prototypes (trap-free) */
export function isUnreactiveProp(obj: object, prop: PropertyKey): boolean {
	if(typeof prop === 'symbol' || prop === 'constructor') return true
	const marker = obj[unreactiveProperties]
	return (marker === true) 				// Fully unreactive
		|| (marker && marker.has?.(prop))	// Property is unreactive
		|| false
}

export function nonReactive<T extends object[]>(...obj: T): T[0] {
	for (const o of obj) {
		;(o as any)[unreactiveProperties] = true
	}
	return obj[0]
}

export function nonReactiveClass<T extends (new (...args: any[]) => any)[]>(...cls: T): T[0] {
	for (const c of cls) if (c) (c.prototype as any)[unreactiveProperties] = true
	return cls[0]
}

export function isNonReactive(obj: any): boolean {
	return !obj || obj[unreactiveProperties] === true
}

nonReactiveClass(Date, RegExp, Error, Promise, Function)
if (typeof window !== 'undefined') {
	nonReactive(window, document)
	nonReactiveClass(Node, Element, HTMLElement, EventTarget, HTMLCollection, NodeList)
}
