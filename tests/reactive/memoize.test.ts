import { atomic, effect, reactive, reactiveOptions, unwrap } from 'mutts'
import { memoize } from 'mutts'

describe('memoize', () => {
	it('returns cached value and forwards same memoized function', () => {
		let calls1 = 0
		const compute = vi.fn(({ value }: { value: number }) => {
			if (!reactiveOptions.isVerificationRun) calls1++
			return value * 2
		})
		const memo1 = memoize(compute)
		const memo2 = memoize(compute)
		expect(memo1).toBe(memo2)

		const arg = { value: 3 }
		expect(memo1(arg)).toBe(6)
		expect(calls1).toBe(1)
		expect(memo1(arg)).toBe(6)
		expect(calls1).toBe(1)
		// multiple args
		let calls2 = 0
		const compute2 = vi.fn((a: { foo: number }, b: { bar: number }) => {
			if (!reactiveOptions.isVerificationRun) calls2++
			return a.foo + b.bar
		})
		const memo3 = memoize(compute2)
		const a = reactive({ foo: 1 })
		const b = reactive({ bar: 2 })
		expect(memo3(a, b)).toBe(3)
		expect(memo3(a, b)).toBe(3)
		expect(calls2).toBe(1)
		b.bar = 3
		expect(memo3(a, b)).toBe(4)
		expect(calls2).toBe(2)
		a.foo = 2
		expect(memo3(a, b)).toBe(5)
		expect(calls2).toBe(3)
		atomic(() => {
			a.foo = 3
			b.bar = 4
		})()
		expect(memo3(a, b)).toBe(7)
		expect(calls2).toBe(4)
	})

	it('invalidates cache when dependencies change and triggers reactive consumers', () => {
		const source = reactive({ value: 1 })
		let calls = 0
		const compute = vi.fn(({ node }: { node: typeof source }) => {
			if (!reactiveOptions.isVerificationRun) calls++
			return node.value * 10
		})
		const memo = memoize(compute)
		const args = { node: source }

		const observed: number[] = []
		effect(() => {
			observed.push(memo(args))
		})

		expect(observed).toEqual([10])
		expect(calls).toBe(1)

		source.value = 2
		expect(observed).toEqual([10, 20])
		expect(calls).toBe(2)

		// Hitting the cache again should use fresh value without recomputation
		expect(memo(args)).toBe(20)
		expect(calls).toBe(2)
	})

	it('invalidates memoization when an array property is replaced by another array', () => {
		const state = reactive({ list: [1, 2, 3] })
		let computations = 0
		const getList = memoize(() => {
			if (!reactiveOptions.isVerificationRun) computations++
			return state.list
		})

		expect(unwrap(getList())).toEqual([1, 2, 3])
		expect(computations).toBe(1)

		// Replace the array
		state.list = [4, 5, 6]

		expect(unwrap(getList())).toEqual([4, 5, 6])
		expect(computations).toBe(2)
	})

	it('throws when argument is not a non-null object', () => {
		const memo = memoize(({ value }: { value: number }) => value)
		expect(() => memo(null as unknown as { value: number })).toThrow()
		expect(() => memo(3 as unknown as { value: number })).toThrow()
	})

	describe('when used as a decorator', () => {
			it('memoizes legacy getter descriptors', () => {
				let calls = 0
				class Example {
					state = reactive({ value: 1 })
					@memoize
					get computed() {
						if (!reactiveOptions.isVerificationRun) calls++
						return this.state.value * 2
					}
				}

				const instance1 = new Example()
				expect(instance1.computed).toBe(2)
				expect(calls).toBe(1)
				expect(instance1.computed).toBe(2)
				expect(calls).toBe(1)

				instance1.state.value = 2
				expect(instance1.computed).toBe(4)
				expect(calls).toBe(2)
				expect(instance1.computed).toBe(4)
				expect(calls).toBe(2)
				const instance2 = new Example()
				expect(instance2.computed).toBe(2)
				expect(calls).toBe(3)
				expect(instance2.computed).toBe(2)
				expect(calls).toBe(3)
			})

		it('memoizes methods with multiple arguments', () => {
			class Calculator {
				calls = 0
				increment = reactive({ value: 1 })
				@memoize
				compute(a: { value: number }, b: { value: number }) {
					if (!reactiveOptions.isVerificationRun) this.calls++
					return a.value + b.value + this.increment.value
				}
			}

			const calc = new Calculator()
			const first = reactive({ value: 1 })
			const second = reactive({ value: 2 })

			expect(calc.compute(first, second)).toBe(4)
			expect(calc.compute(first, second)).toBe(4)
			expect(calc.calls).toBe(1)

			second.value = 3
			expect(calc.compute(first, second)).toBe(5)
			expect(calc.calls).toBe(2)

			first.value = 2
			expect(calc.compute(first, second)).toBe(6)
			expect(calc.calls).toBe(3)

			calc.increment.value = 2
			expect(calc.compute(first, second)).toBe(7)
			expect(calc.calls).toBe(4)
		})
	})

	describe('discrepancy detection', () => {
		afterEach(() => {
			reactiveOptions.onMemoizationDiscrepancy = undefined
		})

		it('detects discrepancy when a non-reactive dependency changes', () => {
			let nonReactiveValue = 1
			const callback = vi.fn()
			reactiveOptions.onMemoizationDiscrepancy = callback

			const memo = memoize(({ obj }: { obj: object }) => {
				return nonReactiveValue
			})

			const arg = { obj: {} }
			expect(memo(arg)).toBe(1)
			expect(callback).not.toHaveBeenCalled()

			nonReactiveValue = 2
			// The memo depends on arg.obj (which didn't change), so it's a cache hit
			// But the discrepancy detector should catch that fresh execution returns 2
			expect(memo(arg)).toBe(1)
			expect(callback).toHaveBeenCalledWith(1, 2, expect.any(Function), [arg], 'calculation')
		})

		it('does NOT trigger discrepancy when result is structurally equal (deepCompare)', () => {
			let nonReactiveValue = [1, 2]
			const callback = vi.fn()
			reactiveOptions.onMemoizationDiscrepancy = callback

			const memo = memoize(({ obj }: { obj: object }) => {
				return [...nonReactiveValue]
			})

			const arg = { obj: {} }
			expect(memo(arg)).toEqual([1, 2])
			expect(callback).not.toHaveBeenCalled()

			// Change to a new array but with same content
			nonReactiveValue = [1, 2]
			expect(memo(arg)).toEqual([1, 2])
			// Should NOT have called callback because [1, 2] deepEquals [1, 2]
			expect(callback).not.toHaveBeenCalled()

			// Change content
			nonReactiveValue = [1, 3]
			expect(memo(arg)).toEqual([1, 2])
			expect(callback).toHaveBeenCalledWith([1, 2], [1, 3], expect.any(Function), [arg], 'calculation')
		})

		it('triggers on initial execution if there is an immediate discrepancy (unlikely but possible if side effects)', () => {
			let count = 0
			const callback = vi.fn()
			reactiveOptions.onMemoizationDiscrepancy = callback

			const memo = memoize(({ obj }: { obj: object }) => {
				return ++count
			})

			const arg = { obj: {} }
			// First call: count becomes 1. Fresh call in detector: count becomes 2.
			expect(memo(arg)).toBe(1)
			expect(callback).toHaveBeenCalledWith(1, 2, expect.any(Function), [arg], 'comparison')
		})
	})
})
