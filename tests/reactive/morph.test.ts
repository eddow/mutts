import { describe, expect, test } from 'vitest'
import { reactive, morph } from 'mutts'

describe('morph', () => {
	describe('basic functionality', () => {
		test('maps array elements reactively', () => {
			const source = reactive([1, 2, 3])
			const doubled = morph(source, x => x * 2)

			expect(doubled[0]).toBe(2)
			expect(doubled[1]).toBe(4)
			expect(doubled[2]).toBe(6)

			// Update source
			source.push(4)
			expect(doubled[3]).toBe(8)

			// Modify existing element
			source[0] = 10
			expect(doubled[0]).toBe(20)
		})

		test('handles function source', () => {
			const items = reactive([1, 2, 3])
			const getItems = () => [...items]
			const tripled = morph(getItems, x => x * 3)

			expect(tripled[0]).toBe(3)
			expect(tripled[1]).toBe(6)
			expect(tripled[2]).toBe(9)

			items.push(4)
			expect(tripled[3]).toBe(12)
		})

		test('handles array mutations correctly', () => {
			const source = reactive(['a', 'b', 'c'])
			const upperCased = morph(source, s => s.toUpperCase())
			let accessCount = 0

			// Access all elements
			for (let i = 0; i < upperCased.length; i++) {
				accessCount++
				expect(upperCased[i]).toBe(source[i].toUpperCase())
			}
			expect(accessCount).toBe(3)

			// Insert in middle
			source.splice(1, 0, 'x')
			expect(upperCased[1]).toBe('X')
			expect(upperCased[2]).toBe('B') // 'b' moved to index 2

			// Remove element
			source.splice(0, 1)
			expect(upperCased[0]).toBe('X') // 'x' moved to index 0
		})

		test('preserves non-numeric properties', () => {
			const source = reactive([1, 2, 3])
			const mapped = morph(source, x => x * 2)

			expect(mapped.length).toBe(3)
			expect(Array.isArray(mapped)).toBe(true)
		})
	})

	describe('reactive callback dependencies', () => {
		test('invalidates cache when callback dependencies change', () => {
			const source = reactive([1, 2])
			const multiplier = reactive({value: 2})
			let computeCount = 0

			const multiplied = morph(source, x => {
				computeCount++
				return x * multiplier.value
			})

			// Initial computation
			expect(multiplied[0]).toBe(2)
			expect(multiplied[1]).toBe(4)
			expect(computeCount).toBe(2) // One for each element accessed

			// Access again - should be cached
			expect(multiplied[0]).toBe(2)
			expect(computeCount).toBe(2) // No new computation

			// Change dependency - should invalidate all
			multiplier.value = 3
			expect(multiplied[0]).toBe(3)
			expect(multiplied[1]).toBe(6)
			expect(computeCount).toBe(4) // Recomputed both elements
		})

		test('only invalidates accessed elements when dependency changes', () => {
			const source = reactive([1, 2, 3, 4])
			const factor = reactive({value: 10})
			let computeCount = 0

			const processed = morph(source, x => {
				computeCount++
				return x > 2 ? x/2 : x * factor.value
			})

			// Access only first two elements
			expect(processed[0]).toBe(10)
			expect(processed[1]).toBe(20)
			expect(processed[2]).toBe(1.5) // First access for element 2
			expect(computeCount).toBe(3)

			// Change dependency
			factor.value = 5

			// Only accessed elements should be recomputed
			expect(processed[0]).toBe(5)
			expect(processed[1]).toBe(10)
			expect(processed[2]).toBe(1.5) // First access for element 2
			expect(computeCount).toBe(5) // Only recomputed accessed elements
		})

		test('handles multiple reactive dependencies', () => {
			const source = reactive([1, 2])
			const addend = reactive({value: 5})
			const multiplier = reactive({value: 2})
			let computeCount = 0

			const calculated = morph(source, x => {
				computeCount++
				return (x + addend.value) * multiplier.value
			})

			expect(calculated[0]).toBe(12) // (1 + 5) * 2
			expect(calculated[1]).toBe(14) // (2 + 5) * 2
			expect(computeCount).toBe(2)

			// Change first dependency
			addend.value = 10
			expect(calculated[0]).toBe(22) // (1 + 10) * 2
			expect(computeCount).toBe(3)

			// Change second dependency
			multiplier.value = 3
			expect(calculated[0]).toBe(33) // (1 + 10) * 3
			expect(computeCount).toBe(4)
		})
	})

	describe('edge cases', () => {
		test('handles sparse arrays', () => {
			const source = reactive([1, , 3] as number[])
			const squared = morph(source, x => x ? x * x : undefined)

			expect(squared[0]).toBe(1)
			expect(squared[1]).toBeUndefined()
			expect(squared[2]).toBe(9)

			// Fill the hole
			source[1] = 2
			expect(squared[1]).toBe(4)
		})

		test('handles undefined elements', () => {
			const source = reactive([1, undefined, 3])
			const processed = morph(source, x => x ? x * 2 : 'undefined')

			expect(processed[0]).toBe(2)
			expect(processed[1]).toBe('undefined')
			expect(processed[2]).toBe(6)
		})

		test('works with non-reactive static source', () => {
			const source = [1, 2, 3]
			const doubled = morph(source, x => x * 2)

			expect(doubled[0]).toBe(2)
			expect(doubled[1]).toBe(4)
			expect(doubled[2]).toBe(6)
		})
	})
})

describe('morph.pure', () => {
	describe('pure optimization', () => {
		test('skips per-item effects for pure callbacks', () => {
			const source = reactive([1, 2, 3])
			let computeCount = 0

			const doubled = morph.pure(source, x => {
				computeCount++
				return x * 2
			})

			// Initial computation
			expect(doubled[0]).toBe(2)
			expect(doubled[1]).toBe(4)
			expect(doubled[2]).toBe(6)
			expect(computeCount).toBe(3)

			// Access again - should not recompute
			expect(doubled[0]).toBe(2)
			expect(doubled[1]).toBe(4)
			expect(doubled[2]).toBe(6)
			expect(computeCount).toBe(3)

			// Modify source - should recompute affected elements
			source[0] = 10
			expect(doubled[0]).toBe(20)
			expect(computeCount).toBe(4) // Only recomputed element 0
		})

		test('returns plain array for non-reactive source', () => {
			const source = [1, 2, 3]
			const result = morph.pure(source, x => x * 2)

			// Should return a plain array, not a reactive proxy
			expect(Array.isArray(result)).toBe(true)
			expect(result).toEqual([2, 4, 6])

			// Verify it's not reactive
			expect(result[0]).toBe(2)
			source[0] = 10
			expect(result[0]).toBe(2) // Unchanged
		})

		test('still tracks source array changes', () => {
			const source = reactive([1, 2])
			let computeCount = 0

			const processed = morph.pure(source, x => {
				computeCount++
				return x + 1
			})

			// Initial
			expect(processed[0]).toBe(2)
			expect(processed[1]).toBe(3)
			expect(computeCount).toBe(2)

			// Array mutation
			source.push(3)
			expect(processed[2]).toBe(4)
			expect(computeCount).toBe(3)

			// Element replacement
			source[0] = 10
			expect(processed[0]).toBe(11)
			expect(computeCount).toBe(4)
		})

		test('does not track callback dependencies', () => {
			const source = reactive([1, 2])
			const factor = reactive({value: 2})
			let computeCount = 0

			const multiplied = morph.pure(source, x => {
				computeCount++
				// This dependency is ignored in pure mode
				return x * factor.value
			})

			expect(multiplied[0]).toBe(2)
			expect(multiplied[1]).toBe(4)
			expect(computeCount).toBe(2)

			// Change dependency - should NOT invalidate cache in pure mode
			factor.value = 10
			expect(multiplied[0]).toBe(2) // Still uses old cached value
			expect(multiplied[1]).toBe(4)
			expect(computeCount).toBe(2) // No recomputation
		})

		test('pure mode is more performant for large arrays', () => {
			const source = reactive(Array.from({ length: 1000 }, (_, i) => i))
			let computeCount = 0

			const processed = morph.pure(source, x => {
				computeCount++
				return x * 2
			})

			// Access first 10 elements
			for (let i = 0; i < 10; i++) {
				expect(processed[i]).toBe(i * 2)
			}
			expect(computeCount).toBe(10)

			// Change one element
			source[5] = 999
			expect(processed[5]).toBe(1998)
			expect(computeCount).toBe(11) // Only recomputed one element
		})
	})

	describe('pure vs reactive behavior comparison', () => {
		test('reactive morph tracks dependencies, pure does not', () => {
			const source = reactive([1, 2])
			const dependency = reactive({value: 10})
			let reactiveCount = 0
			let pureCount = 0

			const reactiveResult = morph(source, x => {
				reactiveCount++
				return x + dependency.value
			})

			const pureResult = morph.pure(source, x => {
				pureCount++
				return x + dependency.value
			})

			// Initial computation
			expect(reactiveResult[0]).toBe(11)
			expect(pureResult[0]).toBe(11)
			expect(reactiveCount).toBe(1)
			expect(pureCount).toBe(1)

			// Change dependency
			dependency.value = 20

			// Reactive version updates
			expect(reactiveResult[0]).toBe(21)
			expect(reactiveCount).toBe(2)

			// Pure version stays cached
			expect(pureResult[0]).toBe(11) // Still 11, not 31
			expect(pureCount).toBe(1) // No recomputation
		})
	})
})
