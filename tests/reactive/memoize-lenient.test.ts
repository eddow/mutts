import { describe, expect, test } from 'vitest'
import { reactive } from '../../src/reactive/proxy'
import { memoize } from '../../src/reactive/memoize'

describe('memoize.lenient', () => {
	describe('function usage', () => {
		test('caches for WeakKey arguments', () => {
			const obj1 = { id: 1 }
			const obj2 = { id: 2 }
			let callCount = 0

			const expensive = memoize.lenient((obj: { id: number }) => {
				callCount++
				return obj.id * 10
			})

			// First call - computes
			expect(expensive(obj1)).toBe(10)
			expect(callCount).toBe(1)

			// Second call with same object - cached
			expect(expensive(obj1)).toBe(10)
			expect(callCount).toBe(1)

			// Different object - computes
			expect(expensive(obj2)).toBe(20)
			expect(callCount).toBe(2)

			// Call with first object again - still cached
			expect(expensive(obj1)).toBe(10)
			expect(callCount).toBe(2)
		})

		test('recomputes for non-WeakKey arguments without throwing', () => {
			let callCount = 0

			const process = memoize.lenient((value: string | number) => {
				callCount++
				return `processed: ${value}`
			})

			// Primitive arguments - should recompute each time
			expect(process('hello')).toBe('processed: hello')
			expect(callCount).toBe(1)

			expect(process('hello')).toBe('processed: hello')
			expect(callCount).toBe(2) // No caching for primitives

			expect(process(42)).toBe('processed: 42')
			expect(callCount).toBe(3)

			expect(process(42)).toBe('processed: 42')
			expect(callCount).toBe(4)
		})

		test('handles mixed WeakKey and non-WeakKey arguments', () => {
			const obj = { value: 'test' }
			let callCount = 0

			const mixed = memoize.lenient((arg: { value: string } | string) => {
				callCount++
				return typeof arg === 'string' ? `str: ${arg}` : `obj: ${arg.value}`
			})

			// Object argument - cached
			expect(mixed(obj)).toBe('obj: test')
			expect(callCount).toBe(1)
			expect(mixed(obj)).toBe('obj: test')
			expect(callCount).toBe(1)

			// String argument - recompute
			expect(mixed('test')).toBe('str: test')
			expect(callCount).toBe(2)
			expect(mixed('test')).toBe('str: test')
			expect(callCount).toBe(3)
		})

		test('works with reactive WeakKey arguments', () => {
			const state = reactive({ count: 0 })
			let callCount = 0

			const compute = memoize.lenient((obj: { count: number }) => {
				callCount++
				return obj.count * 2
			})

			// Initial call
			expect(compute(state)).toBe(0)
			expect(callCount).toBe(1)

			// Change reactive property - cache invalidates
			state.count = 5
			expect(compute(state)).toBe(10)
			expect(callCount).toBe(2)
		})
	})

	describe('decorator usage', () => {
		test('memoizes getter with WeakKey this', () => {
			let callCount = 0

			class Calculator {
				constructor(private value: number) {}

				@memoize.lenient
				get expensive() {
					callCount++
					return this.value * 100
				}
			}

			const calc1 = new Calculator(3)
			const calc2 = new Calculator(5)

			// First access - computes
			expect(calc1.expensive).toBe(300)
			expect(callCount).toBe(1)

			// Second access - cached
			expect(calc1.expensive).toBe(300)
			expect(callCount).toBe(1)

			// Different instance - computes
			expect(calc2.expensive).toBe(500)
			expect(callCount).toBe(2)

			// First instance still cached
			expect(calc1.expensive).toBe(300)
			expect(callCount).toBe(2)
		})

		test('memoizes method with WeakKey arguments', () => {
			let callCount = 0

			class Processor {
				@memoize.lenient
				process(item: { data: string }) {
					callCount++
					return `processed: ${item.data}`
				}
			}

			const processor = new Processor()
			const item1 = { data: 'a' }
			const item2 = { data: 'b' }

			// First call - computes
			expect(processor.process(item1)).toBe('processed: a')
			expect(callCount).toBe(1)

			// Same item - cached
			expect(processor.process(item1)).toBe('processed: a')
			expect(callCount).toBe(1)

			// Different item - computes
			expect(processor.process(item2)).toBe('processed: b')
			expect(callCount).toBe(2)
		})

		test('handles primitive arguments in methods without throwing', () => {
			let callCount = 0

			class StringProcessor {
				@memoize.lenient
				process(value: string) {
					callCount++
					return value.toUpperCase()
				}
			}

			const processor = new StringProcessor()

			// Primitive arguments - recompute each time
			expect(processor.process('hello')).toBe('HELLO')
			expect(callCount).toBe(1)
			expect(processor.process('hello')).toBe('HELLO')
			expect(callCount).toBe(2) // No caching for primitives
		})

		test('memoizes object with WeakKey properties', () => {
			let callCount = 0

			const memoized = memoize.lenient({
				get value() {
					callCount++
					return 42
				}
			})

			// Access property - cached
			expect(memoized.value).toBe(42)
			expect(callCount).toBe(1)
			expect(memoized.value).toBe(42)
			expect(callCount).toBe(1)
		})

		test('handles mixed property types', () => {
			let objCallCount = 0
			let primCallCount = 0

			const memoized = memoize.lenient({
				get object() {
					objCallCount++
					return { result: 'object' }
				},
				get primitive() {
					primCallCount++
					return 'primitive'
				}
			})

			// Object property - cached (the object itself is the WeakKey)
			expect(memoized.object).toEqual({ result: 'object' })
			expect(objCallCount).toBe(1)
			expect(memoized.object).toEqual({ result: 'object' })
			expect(objCallCount).toBe(1)

			// Primitive property - also cached (the object is the WeakKey, not the return value)
			expect(memoized.primitive).toBe('primitive')
			expect(primCallCount).toBe(1)
			expect(memoized.primitive).toBe('primitive')
			expect(primCallCount).toBe(1) // Cached because 'this' (the object) is a WeakKey
		})
	})

	describe('edge cases', () => {
		test('handles null and undefined arguments', () => {
			let callCount = 0

			const fn = memoize.lenient((value: any) => {
				callCount++
				return `value: ${value}`
			})

			// null and undefined are not WeakKeys - recompute
			expect(fn(null)).toBe('value: null')
			expect(callCount).toBe(1)
			expect(fn(null)).toBe('value: null')
			expect(callCount).toBe(2)

			expect(fn(undefined)).toBe('value: undefined')
			expect(callCount).toBe(3)
			expect(fn(undefined)).toBe('value: undefined')
			expect(callCount).toBe(4)
		})

		test('handles symbol arguments', () => {
			let callCount = 0
			const sym1 = Symbol('test')
			const sym2 = Symbol('test')

			const fn = memoize.lenient((sym: symbol) => {
				callCount++
				return sym.toString()
			})

			// Symbols are WeakKeys - cached by identity
			expect(fn(sym1)).toBe(sym1.toString())
			expect(callCount).toBe(1)
			expect(fn(sym1)).toBe(sym1.toString())
			expect(callCount).toBe(1)

			// Different symbol - computes
			expect(fn(sym2)).toBe(sym2.toString())
			expect(callCount).toBe(2)
		})

		test('preserves this context in methods', () => {
			let callCount = 0

		 class Context {
				constructor(private prefix: string) {}

				@memoize.lenient
				method(value: any) {
					callCount++
					return `${this.prefix}: ${value}`
				}
			}

			const ctx1 = new Context('A')
			const ctx2 = new Context('B')
			const obj = { data: 'test' }

			// Different this contexts
			expect(ctx1.method(obj)).toBe('A: [object Object]')
			expect(callCount).toBe(1)
			expect(ctx2.method(obj)).toBe('B: [object Object]')
			expect(callCount).toBe(2)

			// Same context and object - cached
			expect(ctx1.method(obj)).toBe('A: [object Object]')
			expect(callCount).toBe(2)
		})
	})
})
