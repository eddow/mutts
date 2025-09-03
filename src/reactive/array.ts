import { Indexable } from '../indexable'
import { allProps, dependant, specificAccessors, touched, unreactive } from './core'
const original = Symbol('original')
const RA = Symbol('ReactiveArray')

class ReactiveBaseArray extends Array {
	@unreactive
	declare readonly [RA]: any
	@unreactive
	declare readonly [original]: any[]
	get length() {
		return this[original].length
	}
}
export class ReactiveArray extends Indexable(
	ReactiveBaseArray,
	{
		get(index: number): any {
			return this[original][index]
		},
		set(index: number, value: any) {
			if (index >= this[original].length)
				touched(this[RA], 'length', { type: 'add', prop: index })
			this[original][index] = value
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
			[specificAccessors]: {
				value: {
					length: {
						get(ra: ReactiveArray) { return ra[original].length },
						set(ra: ReactiveArray, value: number) { ra[original].length = value },
					},
				},
				enumerable: false,
				configurable: false,
			},
		})
	}
	push(...items: any[]) {
		touched(this[RA], 'length', { type: 'set', prop: 'length' })
		for(let i = 0; i < items.length; i++) {
			touched(this[RA], i+this.length, { type: 'add', prop: i+this.length })
		}
		return this[original].push(...items)
	}

	pop() {
		touched(this[RA], 'length', { type: 'del', prop: 'length' })
		touched(this[RA], this.length-1, { type: 'del', prop: this.length-1 })
		return this[original].pop()
	}
	// Array length property with reactivity
}
