import { atomic, effect, reactive, unwrap } from 'mutts/reactive'
import { memoize } from 'mutts/reactive/memoize'

describe('memoize', () => {
	it('returns cached value and forwards same memoized function', () => {
		const compute = jest.fn(({ value }: { value: number }) => value * 2)
		const memo1 = memoize(compute)
		const memo2 = memoize(compute)
		expect(memo1).toBe(memo2)

		const arg = { value: 3 }
		expect(memo1(arg)).toBe(6)
		expect(compute).toHaveBeenCalledTimes(1)
		expect(memo1(arg)).toBe(6)
		expect(compute).toHaveBeenCalledTimes(1)
		// multiple args
		const compute2 = jest.fn((a: { foo: number }, b: { bar: number }) => a.foo + b.bar)
		const memo3 = memoize(compute2)
		const a = reactive({ foo: 1 })
		const b = reactive({ bar: 2 })
		expect(memo3(a, b)).toBe(3)
		expect(memo3(a, b)).toBe(3)
		expect(compute2).toHaveBeenCalledTimes(1)
		b.bar = 3
		expect(memo3(a, b)).toBe(4)
		expect(compute2).toHaveBeenCalledTimes(2)
		a.foo = 2
		expect(memo3(a, b)).toBe(5)
		expect(compute2).toHaveBeenCalledTimes(3)
		atomic(() => {
			a.foo = 3
			b.bar = 4
		})()
		expect(memo3(a, b)).toBe(7)
		expect(compute2).toHaveBeenCalledTimes(4)
	})

	it('invalidates cache when dependencies change and triggers reactive consumers', () => {
		const source = reactive({ value: 1 })
		const compute = jest.fn(({ node }: { node: typeof source }) => node.value * 10)
		const memo = memoize(compute)
		const args = { node: source }

		const observed: number[] = []
		effect(() => {
			observed.push(memo(args))
		})

		expect(observed).toEqual([10])
		expect(compute).toHaveBeenCalledTimes(1)

		source.value = 2
		expect(observed).toEqual([10, 20])
		expect(compute).toHaveBeenCalledTimes(2)

		// Hitting the cache again should use fresh value without recomputation
		expect(memo(args)).toBe(20)
		expect(compute).toHaveBeenCalledTimes(2)
	})

	it('invalidates memoization when an array property is replaced by another array', () => {
		const state = reactive({ list: [1, 2, 3] })
		let computations = 0
		const getList = memoize(() => {
			computations++
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
					calls++
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
					this.calls++
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
})
