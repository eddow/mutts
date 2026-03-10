import { unreactiveProperties } from './types'
export const absent = Symbol('absent')

type UnreactiveMarker = true | Set<PropertyKey>
type UnreactiveHost = {
	[unreactiveProperties]?: UnreactiveMarker
}

/**
 * Add unreactive properties to a prototype.
 * If no set is provided, marks the entire object/prototype as non-reactive (sets [unreactiveProperties] = true).
 * If a set is provided, merges with existing unreactive properties (never overrides true).
 */
export function addUnreactiveProps<T extends object>(proto: T, set?: Iterable<PropertyKey>): T {
	if (unreactiveProperties in proto) {
		const existing = (proto as UnreactiveHost)[unreactiveProperties]
		// If already fully unreactive, don't change
		if (existing === true) return proto
		// If no set provided, upgrade to fully unreactive
		if (!set) {
			;(proto as UnreactiveHost)[unreactiveProperties] = true
			return proto
		}
		// Merge sets
		const merged = new Set<PropertyKey>(existing)
		;(proto as UnreactiveHost)[unreactiveProperties] = merged
		for (const p of set) merged.add(p)
	}
	// If no set, mark as fully unreactive, otherwise create set
	else (proto as UnreactiveHost)[unreactiveProperties] = set ? new Set<PropertyKey>(set) : true
	return proto
}

/** Check if a property is marked unreactive on obj or any of its prototypes (trap-free) */
export function isUnreactiveProp(obj: object, prop: PropertyKey): boolean {
	if (typeof prop === 'symbol' || prop === 'constructor') return true
	const marker = (obj as UnreactiveHost)[unreactiveProperties]
	return (
		marker === true || // Fully unreactive
		marker?.has?.(prop) || // Property is unreactive
		false
	)
}

export function nonReactive<T extends object[]>(...obj: T): T[0] {
	for (const o of obj) {
		;(o as UnreactiveHost)[unreactiveProperties] = true
	}
	return obj[0]
}

export function nonReactiveClass<T extends (new (...args: any[]) => any)[]>(...cls: T): T[0] {
	for (const c of cls) if (c) (c.prototype as UnreactiveHost)[unreactiveProperties] = true
	return cls[0]
}

export function isNonReactive(obj: any): boolean {
	return !obj || (obj as UnreactiveHost)[unreactiveProperties] === true
}

nonReactiveClass(Date, RegExp, Error, Promise, Function)
if (typeof window !== 'undefined') {
	nonReactive(window, document)
	nonReactiveClass(Node, Element, HTMLElement, EventTarget, HTMLCollection, NodeList)
}
