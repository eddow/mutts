import { atomic, effect, reactive } from 'mutts'

describe('ReactiveArray Optimization Tests', () => {
	describe('copyWithin optimization', () => {
		it('should only trigger effects for indices that are actually changed', () => {
			const array = [1, 2, 3, 4, 5]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[4] // Access 5th element (index 4)
			})

			expect(effectCount).toBe(1)

			// copyWithin(0, 1, 3) means:
			// target = 0
			// start = 1
			// end = 3
			// copies indices 1, 2 to 0, 1
			// array becomes [2, 3, 3, 4, 5]
			// index 4 (value 5) is NOT changed.

			reactiveArray.copyWithin(0, 1, 3)

			// In the unoptimized version, this would be 2 because it touches the whole array range.
			// In the optimized version, it should remain 1.
			expect(effectCount).toBe(1)
			expect(reactiveArray[0]).toBe(2)
			expect(reactiveArray[1]).toBe(3)
			expect(reactiveArray[4]).toBe(5)
		})

		it('should trigger effects for indices that ARE changed', () => {
			const array = [1, 2, 3, 4, 5]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[0] // Access 1st element (index 0)
			})

			expect(effectCount).toBe(1)

			// copyWithin(0, 1, 3) overwrites index 0.
			reactiveArray.copyWithin(0, 1, 3)

			expect(effectCount).toBe(2)
			expect(reactiveArray[0]).toBe(2)
		})
	})

	describe('every/some optimization', () => {
		describe('every', () => {
			it('should correct results', () => {
				const arr = reactive([1, 2, 3])
				expect(arr.every(x => x < 4)).toBe(true)
				expect(arr.every(x => x < 2)).toBe(false)
			})

			it('should stop tracking dependencies after finding a false value (short-circuit)', () => {
				const array = [1, 2, 3, 4]
				const reactiveArray = reactive(array)

				let effectCount = 0
				effect(() => {
					effectCount++
					// specific check: x < 2.
					// index 0 (1) is < 2 (true). continue.
					// index 1 (2) is NOT < 2 (false). STOP.
					// Should track index 0 and 1. Should NOT track index 2 or 3.
					reactiveArray.every(x => x < 2) 
				})

				expect(effectCount).toBe(1)

				// Modify index 3 (value 4 -> 5).
				// In unoptimized version (dependant(this)), this triggers.
				// In optimized version, it should NOT trigger.
				reactiveArray[3] = 5
				expect(effectCount).toBe(1) 

				// Modify index 1 (value 2 -> 0).
				// This IS tracked, so it should trigger.
				// And now every(x < 2) might change result (if 0 < 2, yes).
				reactiveArray[1] = 0
				expect(effectCount).toBe(2)
			})

			it('should track length if it iterates strictly to the end', () => {
				const array = [1, 2] // all < 3
				const reactiveArray = reactive(array)

				let effectCount = 0
				let result = false
				effect(() => {
					effectCount++
					result = reactiveArray.every(x => x < 3)
				})

				expect(effectCount).toBe(1)
				expect(result).toBe(true)

				// Pushing an element that satisfies condition -> result true
				atomic(() => reactiveArray.push(2))()
				expect(effectCount).toBe(2)
				expect(result).toBe(true)

				// Pushing an element that fails condition -> result false
				atomic(() => reactiveArray.push(5))()
				expect(effectCount).toBe(3)
				expect(result).toBe(false)
			})
		})

		describe('some', () => {
			it('should correct results', () => {
				const arr = reactive([1, 2, 3])
				expect(arr.some(x => x > 2)).toBe(true)
				expect(arr.some(x => x > 5)).toBe(false)
			})

			it('should stop tracking dependencies after finding a true value (short-circuit)', () => {
				const array = [1, 2, 3, 4]
				const reactiveArray = reactive(array)

				let effectCount = 0
				effect(() => {
					effectCount++
					// specific check: x > 1.
					// index 0 (1) is NOT > 1 (false). continue.
					// index 1 (2) IS > 1 (true). STOP.
					// Should track index 0 and 1. Should NOT track index 2 or 3.
					reactiveArray.some(x => x > 1)
				})

				expect(effectCount).toBe(1)

				// Modify index 3 (value 4 -> 5).
				// Should NOT trigger.
				reactiveArray[3] = 5
				expect(effectCount).toBe(1)

				// Modify index 1 (value 2 -> 0).
				// This IS tracked. Now it's not > 1. Result might change (or need to look further).
				reactiveArray[1] = 0
				expect(effectCount).toBe(2)
			})
		})
	})

	describe('splice edge cases', () => {
		it('should handle negative start index correctly', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			// Watch for changes at index -1 (should essentially never happen/matter, but calculating it wrong might trigger it)
			let negativeIndexTriggered = 0
			effect(() => {
				negativeIndexTriggered++
				// @ts-ignore
				reactiveArray[-1]
			})

			// Watch for changes at the actual last index (2)
			let lastIndexTriggered = 0
			effect(() => {
				lastIndexTriggered++
				reactiveArray[2]
			})

			expect(negativeIndexTriggered).toBe(1)
			expect(lastIndexTriggered).toBe(1)

			// splice(-1, 1, 4) -> replaces last element (3) with 4.
			// Start index is -1.
			reactiveArray.splice(-1, 1, 4)

			// Current implementation potentially touches -1.
			// Fixed implementation should NOT touch -1.
			expect(negativeIndexTriggered).toBe(1)
			// Should touch index 2.
			expect(lastIndexTriggered).toBe(2)
			expect(reactiveArray[2]).toBe(4)
		})

		it('should handle start index > length correctly', () => {
			const array = [1, 2]
			const reactiveArray = reactive(array)

			// Watch for changes at index 100
			let outOfBoundsTriggered = 0
			effect(() => {
				outOfBoundsTriggered++
				reactiveArray[100]
			})

			// Watch for changes at index 2 (where it should actually append)
			let appendIndexTriggered = 0
			effect(() => {
				appendIndexTriggered++
				reactiveArray[2]
			})

			expect(outOfBoundsTriggered).toBe(1)
			expect(appendIndexTriggered).toBe(1)

			// splice(100, 0, 3) -> appends 3 at index 2.
			reactiveArray.splice(100, 0, 3)

			// Current implementation potentially touches 100.
			expect(outOfBoundsTriggered).toBe(1)
			// Should touch index 2.
			expect(appendIndexTriggered).toBe(2)
			expect(reactiveArray[2]).toBe(3)
		})

		it('should clamp deleteCount correctly', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let lengthTriggered = 0
			effect(() => {
				lengthTriggered++
				reactiveArray.length
			})

			expect(lengthTriggered).toBe(1)

			// splice(0, 100) -> deletes 3 items.
			// Current implementation might calculate range based on 100.
			reactiveArray.splice(0, 100)

			expect(lengthTriggered).toBe(2)
			expect(reactiveArray.length).toBe(0)
		})
	})

	describe('at optimization', () => {
		it('should track length when using negative index', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)
			let lastValue
			let effectCount = 0
			effect(() => {
				effectCount++
				lastValue = reactiveArray.at(-1)
			})

			expect(effectCount).toBe(1)
			expect(lastValue).toBe(3)

			// Push new element. Index 2 (value 3) is unchanged.
			// But at(-1) should now point to index 3 (value 4).
			atomic(() => reactiveArray.push(4))()

			expect(effectCount).toBe(2)
			expect(lastValue).toBe(4)
		})
/*
		it('should NOT track length when using positive index with sufficient range', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)
			let firstValue
			let effectCount = 0
			effect(() => {
				effectCount++
				firstValue = reactiveArray.at(0)
			})

			expect(effectCount).toBe(1)
			expect(firstValue).toBe(1)

			// Push new element. Length changes.
			// at(0) still points to index 0.
			reactiveArray.push(4)

			// Should NOT trigger because index 0 didn't change.
			expect(effectCount).toBe(1)
			expect(firstValue).toBe(1)
		})*/
	})

	describe('find/findIndex optimization', () => {
		it('should short-circuit dependency tracking when element is found', () => {
			const array = [1, 2, 3, 4]
			const reactiveArray = reactive(array)
			let result
			let effectCount = 0

			effect(() => {
				effectCount++
				// finding 2. Should scan index 0 (1), index 1 (2). Found. Stop.
				result = reactiveArray.find((x) => x === 2)
			})

			expect(effectCount).toBe(1)
			expect(result).toBe(2)

			// Modify index 3 (value 4 -> 5).
			// Should NOT trigger because loop stopped at index 1.
			reactiveArray[3] = 5
			expect(effectCount).toBe(1)

			// Modify index 0 (value 1 -> 0).
			// Should trigger because index 0 was visited.
			reactiveArray[0] = 0
			expect(effectCount).toBe(2)
		})

		it('should track length if element is NOT found', () => {
			const array = [1, 2]
			const reactiveArray = reactive(array)
			let result
			let effectCount = 0

			effect(() => {
				effectCount++
				result = reactiveArray.find((x) => x === 3)
			})

			expect(effectCount).toBe(1)
			expect(result).toBeUndefined()

			// Push 3. Length changes.
			atomic(() => reactiveArray.push(3))()
			expect(effectCount).toBe(2)
			expect(result).toBe(3)
		})

		it('findIndex should also short-circuit', () => {
			const array = [1, 2, 3, 4]
			const reactiveArray = reactive(array)
			let result
			let effectCount = 0

			effect(() => {
				effectCount++
				result = reactiveArray.findIndex((x) => x === 2)
			})

			expect(effectCount).toBe(1)
			expect(result).toBe(1)

			// Modify index 3. Should not trigger.
			reactiveArray[3] = 5
			expect(effectCount).toBe(1)
		})
	})

	describe('fill optimization', () => {
		it('should only trigger changes for filled range', () => {
			const array = [1, 2, 3, 4]
			const reactiveArray = reactive(array)
			let effectCount = 0
			
			// Effect depends on index 0 (value 1)
			effect(() => {
				effectCount++
				reactiveArray[0]
			})
			
			expect(effectCount).toBe(1)
			
			// Fill index 2 to 3 (end exclusive, so index 2 only) with 9
			// Should NOT trigger index 0 listener
			reactiveArray.fill(9, 2, 3)
			
			expect(effectCount).toBe(1)
			expect(reactiveArray[2]).toBe(9)
			
			// Fill index 0 to 1 with 8
			// Should trigger
			reactiveArray.fill(8, 0, 1)
			expect(effectCount).toBe(2)
			expect(reactiveArray[0]).toBe(8)
		})

		it('should handle negative indices in fill', () => {
			const array = [1, 2, 3, 4]
			const reactiveArray = reactive(array)
			let effectCount = 0
			// listen to index 3
			effect(() => {
				effectCount++
				reactiveArray[3]
			})
			expect(effectCount).toBe(1)

			// fill(-2, -1) -> index 2 to 3 (exclusive) -> index 2 only.
			// Should not trigger index 3.
			reactiveArray.fill(9, -2, -1)
			expect(effectCount).toBe(1)
			expect(reactiveArray[2]).toBe(9)

			// fill(-1) -> index 3 to end -> index 3.
			// Should trigger.
			reactiveArray.fill(8, -1)
			expect(effectCount).toBe(2)
			expect(reactiveArray[3]).toBe(8)
		})
	})

	describe('indexOf/lastIndexOf optimization', () => {
		it('should short-circuit dependency tracking when element is found', () => {
			const array = [1, 2, 3, 4]
			const reactiveArray = reactive(array)
			let result
			let effectCount = 0

			effect(() => {
				effectCount++
				result = reactiveArray.indexOf(2)
			})

			expect(effectCount).toBe(1)
			expect(result).toBe(1)

			// Modify index 3. Should NOT trigger.
			reactiveArray[3] = 99
			expect(effectCount).toBe(1)

			// Modify index 0. Should trigger.
			reactiveArray[0] = 0
			expect(effectCount).toBe(2)
		})

		it('should handle lastIndexOf optimization', () => {
			const array = [1, 2, 3, 2, 1]
			const reactiveArray = reactive(array)
			let result
			let effectCount = 0

			effect(() => {
				effectCount++
				// Searching for 2 from end.
				// Should check index 4 (1), index 3 (2). Found.
				result = reactiveArray.lastIndexOf(2)
			})

			expect(effectCount).toBe(1)
			expect(result).toBe(3)

			// Modify index 1 (value 2).
			// Should NOT trigger because we found it at index 3 and stopped going backwards.
			reactiveArray[1] = 99
			expect(effectCount).toBe(1)

			// Modify index 4 (value 1).
			// Should trigger because it was visited.
			reactiveArray[4] = 0
			expect(effectCount).toBe(2)
		})
	})
})
