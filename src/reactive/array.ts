import { Indexable } from '../indexable'
import { dependant, prototypeForwarding, specificAccessors, touched } from './core'
const allProps = Symbol('all-props')
const anyProps = Symbol('any-props')
const original = Symbol('original')
const RA = Symbol('ReactiveArray')

// TODO: map/foreach/every/some - re-implement (ex, [x,x,x].map -> 3 effects)

class ReactiveBaseArray {
	declare readonly [RA]: any
	declare readonly [original]: any[]
	get length() {
		return this[original].length
	}
	set length(value: number) {
		this[original].length = value
	}
	[Symbol.iterator]() {
		return this[original][Symbol.iterator]()
	}
}

Object.defineProperties(ReactiveBaseArray.prototype, {
	[specificAccessors]: {
		value: Object.setPrototypeOf({
			length: {
				get(ra: ReactiveArray) {
					dependant(ra[RA], 'length')
					return ra[original].length
				},
				set(ra: ReactiveArray, value: number) {
					try {
						ra[original].length = value
					}
					finally {
						touched(ra[RA], anyProps, { type: 'set', prop: 'length' })
					}
				},
			},
		}, null),
		enumerable: false,
		configurable: false,
	}
})
export class ReactiveArray extends Indexable(
	ReactiveBaseArray,
	{
		get(index: number): any {
			dependant(this[RA], allProps)
			return this[original][index]
		},
		set(index: number, value: any) {
			const added = index >= this[original].length
			this[original][index] = value
			if (added)
				touched(this[RA], 'length')
			touched(this[RA], anyProps, { type: added ? 'add' : 'set', prop: index })
		},
	}
) {
	constructor(originalArray: any[]) {
		super()
		Object.defineProperties(this, {
			[RA]: {
				value: this,
				enumerable: false,
				configurable: false,
			},
			[original]: {
				value: originalArray,
				enumerable: false,
				configurable: false,
			},
			[prototypeForwarding]: {
				value: originalArray,
			},
		})
	}

	// Safe array access with negative indices
	at(index: number): any {
		const actualIndex = index < 0 ? this.length + index : index
		dependant(this[RA], actualIndex)
		if (actualIndex < 0 || actualIndex >= this.length) return undefined
		return this[original][actualIndex]
	}

	push(...items: any[]) {
		const oldLength = this.length
		try { return this[original].push(...items) }
		finally {
			touched(this[RA], 'length', { type: 'bunch', method: 'push' })
			touched(this[RA], anyProps)
			for(let i = 0; i < items.length; i++)
				touched(this[RA], i+oldLength)
		}
	}

	pop() {
		if(this[original].length === 0) return undefined
		try { return this[original].pop() }
		finally {
			touched(this[RA], 'length', { type: 'bunch', method: 'pop' })
			touched(this[RA], anyProps)
			touched(this[RA], this.length)
		}
	}

	shift() {
		if(this[original].length === 0) return undefined
		try { return this[original].shift() }
		finally {
			touched(this[RA], 'length', { type: 'bunch', method: 'shift' })
			touched(this[RA], anyProps)
			// Touch all indices that will shift down
			touched(this[RA], allProps)
		}
	}

	unshift(...items: any[]) {
		try { return this[original].unshift(...items) }
		finally {
			touched(this[RA], 'length', { type: 'bunch', method: 'unshift' })
			touched(this[RA], anyProps)
			// Touch all existing indices that will shift up
			touched(this[RA], allProps)
		}
	}

	splice(start: number, deleteCount?: number, ...items: any[]) {
		try {
			if(deleteCount === undefined) return this[original].splice(start)
			return this[original].splice(start, deleteCount, ...items)
		}
		finally {
		// Touch length change and all affected indices with a single allProps call
			touched(this[RA], 'length', { type: 'bunch', method: 'splice' })
			touched(this[RA], allProps)
			touched(this[RA], anyProps)
		}
	}

	reverse() {
		try { return this[original].reverse() }
		finally {
			// Touch all indices since they all change positions
			touched(this[RA], allProps, { type: 'bunch', method: 'reverse' })
			touched(this[RA], anyProps)
		}
	}

	sort(compareFn?: (a: any, b: any) => number) {
		try { return this[original].sort(compareFn) as any }
		finally {
			// Touch all indices since they all change positions
			touched(this[RA], allProps, { type: 'bunch', method: 'sort' })
			touched(this[RA], anyProps)
		}
	}

	fill(value: any, start?: number, end?: number) {
		try {
			if(start === undefined) return this[original].fill(value) as any
			if(end === undefined) return this[original].fill(value, start) as any
			return this[original].fill(value, start, end) as any
		}
		finally {
			touched(this[RA], allProps, { type: 'bunch', method: 'fill' })
		}
	}

	copyWithin(target: number, start: number, end?: number) {
		try {
			if(end === undefined) return this[original].copyWithin(target, start) as any
			return this[original].copyWithin(target, start, end) as any
		}
		finally {
			touched(this[RA], allProps, { type: 'bunch', method: 'copyWithin' })
		}
		// Touch all affected indices with a single allProps call
	}

	// Immutable versions of mutator methods
	toReversed(): any[] {
		dependant(this[RA], anyProps)
		return this[original].toReversed()
	}

	toSorted(compareFn?: (a: any, b: any) => number): any[] {
		dependant(this[RA], anyProps)
		return this[original].toSorted(compareFn)
	}

	toSpliced(start: number, deleteCount?: number, ...items: any[]): any[] {
		dependant(this[RA], anyProps)
		return deleteCount === undefined ?
			this[original].toSpliced(start) :
			this[original].toSpliced(start, deleteCount, ...items)
	}

	with(index: number, value: any): any[] {
		dependant(this[RA], anyProps)
		return this[original].with(index, value)
	}

	// Iterator methods with reactivity tracking
	entries() {
		dependant(this[RA], anyProps)
		return this[original].entries()
	}

	keys() {
		dependant(this[RA], anyProps)
		return this[original].keys()
	}

	values() {
		dependant(this[RA], anyProps)
		return this[original].values()
	}

	[Symbol.iterator]() {
		dependant(this[RA], anyProps)
		return this[original][Symbol.iterator]()
	}

	indexOf(searchElement: any, fromIndex?: number): number {
		dependant(this[RA], anyProps)
		return this[original].indexOf(searchElement, fromIndex)
	}

	lastIndexOf(searchElement: any, fromIndex?: number): number {
		dependant(this[RA], anyProps)
		return this[original].lastIndexOf(searchElement, fromIndex)
	}

	includes(searchElement: any, fromIndex?: number): boolean {
		dependant(this[RA], anyProps)
		return this[original].includes(searchElement, fromIndex)
	}

	find(predicate: (this: any, value: any, index: number, obj: any[]) => boolean, thisArg?: any): any {
		dependant(this[RA], anyProps)
		return this[original].find(predicate, thisArg)
	}

	findIndex(predicate: (this: any, value: any, index: number, obj: any[]) => boolean, thisArg?: any): number {
		dependant(this[RA], anyProps)
		return this[original].findIndex(predicate, thisArg)
	}

	flat(): any[] {
		dependant(this[RA], anyProps)
		return this[original].flat()
	}

	flatMap(callbackfn: (this: any, value: any, index: number, array: any[]) => any[], thisArg?: any): any[] {
		dependant(this[RA], anyProps)
		return this[original].flatMap(callbackfn, thisArg)
	}

	every(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): boolean {
		dependant(this[RA], anyProps)
		return this[original].every(callbackfn as any, thisArg)
	}

	filter(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): any[] {
		dependant(this[RA], anyProps)
		return this[original].filter(callbackfn as any, thisArg)
	}

	map(callbackfn: (value: any, index: number, array: any[]) => any, thisArg?: any): any[] {
		dependant(this[RA], anyProps)
		return this[original].map(callbackfn as any, thisArg)
	}

	reduce(callbackfn: (previousValue: any, currentValue: any, currentIndex: number, array: any[]) => any, initialValue?: any): any {
		dependant(this[RA], anyProps)
		if (arguments.length >= 2) return this[original].reduce(callbackfn as any, initialValue)
		return (this[original] as any).reduce(callbackfn as any)
	}

	reduceRight(callbackfn: (previousValue: any, currentValue: any, currentIndex: number, array: any[]) => any, initialValue?: any): any {
		dependant(this[RA], anyProps)
		if (arguments.length >= 2) return this[original].reduceRight(callbackfn as any, initialValue)
		return (this[original] as any).reduceRight(callbackfn as any)
	}

	slice(start?: number, end?: number): any[] {
		dependant(this[RA], anyProps)
		if (start === undefined && end === undefined) return this[original].slice()
		if (end === undefined) return this[original].slice(start)
		return this[original].slice(start, end)
	}

	concat(...items: any[]): any[] {
		dependant(this[RA], anyProps)
		return this[original].concat(...items)
	}

	join(separator?: string): string {
		dependant(this[RA], anyProps)
		return this[original].join(separator as any)
	}

	forEach(callbackfn: (value: any, index: number, array: any[]) => void, thisArg?: any): void {
		dependant(this[RA], anyProps)
		this[original].forEach(callbackfn as any, thisArg)
	}

	some(callbackfn: (value: any, index: number, array: any[]) => boolean, thisArg?: any): boolean {
		dependant(this[RA], anyProps)
		return this[original].some(callbackfn as any, thisArg)
	}

}
