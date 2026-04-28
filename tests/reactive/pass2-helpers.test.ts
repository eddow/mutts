import {
	effect,
	isNonReactive,
	reactive,
	reactiveOptions,
	readonlyReactive,
	shallowReactive,
	toRaw,
	markRaw,
	markRawProps,
} from 'mutts'

describe('pass2 reactive helpers', () => {
	it('shallowReactive tracks top-level writes', () => {
		const state = shallowReactive({ count: 0 })
		let runs = 0
		let seen = 0

		effect(() => {
			runs++
			seen = state.count
		})

		expect(runs).toBe(1)
		state.count = 1
		expect(runs).toBe(2)
		expect(seen).toBe(1)
	})

	it('shallowReactive leaves nested values raw', () => {
		const state = shallowReactive({ nested: { count: 0 } })
		let runs = 0
		let seen = 0

		effect(() => {
			runs++
			seen = state.nested.count
		})

		expect(runs).toBe(1)
		state.nested.count = 1
		expect(runs).toBe(1)
		expect(seen).toBe(0)

		state.nested = { count: 2 }
		expect(runs).toBe(2)
		expect(seen).toBe(2)
	})

	it('shallowReactive does not mark nested assignments as raw globally', () => {
		const child = { value: 1 }
		const state = shallowReactive<{ child?: typeof child }>({})
		state.child = child

		expect(isNonReactive(child)).toBe(false)
		expect(reactive(child)).not.toBe(child)
	})

	it('readonlyReactive tracks reads and follows source reactive mutations', () => {
		const source = reactive({ nested: { count: 0 } })
		const view = readonlyReactive(source)
		let runs = 0
		let seen = 0

		effect(() => {
			runs++
			seen = view.nested.count
		})

		expect(runs).toBe(1)
		source.nested.count = 1
		expect(runs).toBe(2)
		expect(seen).toBe(1)
	})

	it('readonlyReactive throws for top-level and nested writes', () => {
		const view = readonlyReactive({ nested: { count: 0 } })

		expect(() => {
			;(view as any).nested = { count: 1 }
		}).toThrow(/readonly/)
		expect(() => {
			view.nested.count = 1
		}).toThrow(/readonly/)
		expect(() => {
			delete (view as any).nested
		}).toThrow(/readonly/)
		expect(() => {
			Object.defineProperty(view, 'extra', { value: true })
		}).toThrow(/readonly/)
	})

	it('readonlyReactive throws for array and collection mutators', () => {
		const readonlyArray = readonlyReactive([1, 2])
		const readonlyMap = readonlyReactive(new Map([['a', { count: 0 }]]))
		const readonlySet = readonlyReactive(new Set([1]))

		expect(() => readonlyArray.push(3)).toThrow(/readonly/)
		expect(() => readonlyMap.set('b', { count: 1 })).toThrow(/readonly/)
		expect(() => readonlyMap.delete('a')).toThrow(/readonly/)
		expect(() => readonlySet.add(2)).toThrow(/readonly/)
		expect(() => readonlySet.clear()).toThrow(/readonly/)
		expect(() => {
			readonlyMap.get('a')!.count = 1
		}).toThrow(/readonly/)
	})

	it('toRaw, markRaw, and markRawProps expose friendly raw aliases', () => {
		const raw = { value: 1, skipped: 1 }
		const proxy = reactive(raw)

		expect(toRaw(proxy)).toBe(raw)
		const marked = { value: 1 }
		expect(markRaw(marked)).toBe(marked)
		expect(isNonReactive(marked)).toBe(true)

		markRawProps(raw, ['skipped'])
		expect(reactive(raw).skipped).toBe(1)
	})
})

describe('proxy access analysis cache', () => {
	it('keeps inherited property tracking correct when instanceMembers changes', () => {
		const original = reactiveOptions.instanceMembers
		try {
			const root = reactive({ value: 0 })
			const child = reactive(Object.create(toRaw(root)))
			let runs = 0

			reactiveOptions.instanceMembers = true
			effect(() => {
				runs++
				;(child as any).value
			})
			root.value = 1
			expect(runs).toBe(1)

			reactiveOptions.instanceMembers = false
			effect(() => {
				runs++
				;(child as any).value
			})
			root.value = 2
			expect(runs).toBe(3)
		} finally {
			reactiveOptions.instanceMembers = original
		}
	})

	it('does not reuse stale accessor analysis when ignoreAccessors changes', () => {
		const original = reactiveOptions.ignoreAccessors
		try {
			let value = 0
			const source = reactive({
				get value() {
					return value
				},
			})
			let runs = 0

			reactiveOptions.ignoreAccessors = true
			effect(() => {
				runs++
				source.value
			})
			source.value
			expect(runs).toBe(1)

			reactiveOptions.ignoreAccessors = false
			effect(() => {
				runs++
				source.value
			})
			value = 1
			Object.defineProperty(toRaw(source), 'value', {
				get() {
					return value
				},
				configurable: true,
			})
			expect(runs).toBe(2)
		} finally {
			reactiveOptions.ignoreAccessors = original
		}
	})
})
