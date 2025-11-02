import { effect, reactive, reactiveOptions } from 'mutts/reactive'

describe('recursive touching option', () => {
	const originalRecursiveTouching = reactiveOptions.recursiveTouching

	beforeAll(() => {
		// Save original value
		reactiveOptions.recursiveTouching = true
	})

	afterAll(() => {
		// Restore original value
		reactiveOptions.recursiveTouching = originalRecursiveTouching
	})

	describe('when recursiveTouching is enabled (default)', () => {
		beforeEach(() => {
			reactiveOptions.recursiveTouching = true
		})

		it('should NOT trigger parent effects when object is replaced with same prototype', () => {
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ x: 10, y: 20 })
			const C = reactive({ something: A })

			let effectRuns = 0

			effect(() => {
				effectRuns++
				const val = C.something
				void val
			})

			expect(effectRuns).toBe(1)

			// Replace C.something from A to B - should trigger deep touch
			C.something = B

			// Effect should NOT run because recursive touch avoids parent effects
			expect(effectRuns).toBe(1)
		})
	})

	describe('when recursiveTouching is disabled', () => {
		beforeEach(() => {
			reactiveOptions.recursiveTouching = false
		})

		it('should trigger parent effects when object is replaced with same prototype', () => {
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ x: 10, y: 20 })
			const C = reactive({ something: A })

			let effectRuns = 0

			effect(() => {
				effectRuns++
				const val = C.something
				void val
			})

			expect(effectRuns).toBe(1)

			// Replace C.something from A to B - should NOT trigger deep touch
			C.something = B

			// Effect should run because recursive touch is disabled
			expect(effectRuns).toBe(2)
		})
	})

	describe('arrays', () => {
		it('should NOT trigger parent effect when arrays are replaced with recursive touching enabled', () => {
			reactiveOptions.recursiveTouching = true

			const oldArray = reactive([1, 2, 3])
			const newArray = reactive([10, 20, 30])
			const C = reactive({ arr: oldArray })

			let effectRuns = 0

			effect(() => {
				effectRuns++
				const val = C.arr
				void val
			})

			expect(effectRuns).toBe(1)

			C.arr = newArray

			// Should NOT trigger parent effect (recursive touch)
			expect(effectRuns).toBe(1)
		})

		it('should trigger parent effect when arrays are replaced with recursive touching disabled', () => {
			reactiveOptions.recursiveTouching = false

			const oldArray = reactive([1, 2, 3])
			const newArray = reactive([10, 20, 30])
			const C = reactive({ arr: oldArray })

			let effectRuns = 0

			effect(() => {
				effectRuns++
				const val = C.arr
				void val
			})

			expect(effectRuns).toBe(1)

			C.arr = newArray

			// Should trigger parent effect (no recursive touch)
			expect(effectRuns).toBe(2)
		})
	})

	describe('nested objects', () => {
		it('should NOT trigger parent effect when nested objects are replaced with recursive touching enabled', () => {
			reactiveOptions.recursiveTouching = true

			const A = reactive({ nested: { value: 1 } })
			const B = reactive({ nested: { value: 2 } })
			const C = reactive({ something: A })

			let effectRuns = 0

			effect(() => {
				effectRuns++
				const val = C.something
				void val
			})

			expect(effectRuns).toBe(1)

			C.something = B

			// Should NOT trigger parent effect (recursive touch)
			expect(effectRuns).toBe(1)
		})

		it('should trigger parent effect when nested objects are replaced with recursive touching disabled', () => {
			reactiveOptions.recursiveTouching = false

			const A = reactive({ nested: { value: 1 } })
			const B = reactive({ nested: { value: 2 } })
			const C = reactive({ something: A })

			let effectRuns = 0

			effect(() => {
				effectRuns++
				const val = C.something
				void val
			})

			expect(effectRuns).toBe(1)

			C.something = B

			// Should trigger parent effect (no recursive touch)
			expect(effectRuns).toBe(2)
		})
	})

	describe('primitive values', () => {
		it('should always trigger effect when primitive is replaced (regardless of option)', () => {
			const C = reactive({ something: 1 })

			let effectRuns = 0

			effect(() => {
				effectRuns++
				const val = C.something
				void val
			})

			expect(effectRuns).toBe(1)

			// Test with recursive touching enabled
			reactiveOptions.recursiveTouching = true
			C.something = 2
			expect(effectRuns).toBe(2)

			// Reset and test with recursive touching disabled
			reactiveOptions.recursiveTouching = false
			C.something = 3
			expect(effectRuns).toBe(3)
		})
	})

	describe('Map and WeakMap', () => {
		it('should use recursive touch when enabled', () => {
			reactiveOptions.recursiveTouching = true

			const map = reactive(new Map())
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ x: 10, y: 20 })

			// Set initial value before creating effect
			map.set('key', A)

			let effectRuns = 0

			effect(() => {
				effectRuns++
				const val = map.get('key')
				void val
			})

			expect(effectRuns).toBe(1)

			// Setting B (same prototype) should NOT trigger parent effect with recursive touch
			map.set('key', B)
			expect(effectRuns).toBe(1)
		})

		it('should NOT use recursive touch when disabled', () => {
			reactiveOptions.recursiveTouching = false

			const map = reactive(new Map())
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ x: 10, y: 20 })

			// Set initial value before creating effect
			map.set('key', A)

			let effectRuns = 0

			effect(() => {
				effectRuns++
				const val = map.get('key')
				void val
			})

			expect(effectRuns).toBe(1)

			// Setting B should trigger effect when recursive touch is disabled
			map.set('key', B)
			expect(effectRuns).toBe(2)
		})

		it('should work with WeakMap too', () => {
			reactiveOptions.recursiveTouching = true

			const weakMap = reactive(new WeakMap())
			const key = {}
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ x: 10, y: 20 })

			weakMap.set(key, A)

			let effectRuns = 0

			effect(() => {
				effectRuns++
				const val = weakMap.get(key)
				void val
			})

			expect(effectRuns).toBe(1)

			// Setting B should NOT trigger with recursive touch
			weakMap.set(key, B)
			expect(effectRuns).toBe(1)

			// But disabling it should trigger
			reactiveOptions.recursiveTouching = false
			weakMap.set(key, A)
			expect(effectRuns).toBe(2)
		})
	})
})
