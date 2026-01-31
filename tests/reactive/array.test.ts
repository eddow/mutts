import { effect, reactive, unwrap } from 'mutts'

describe('ReactiveArray', () => {
	describe('numeric index reactivity', () => {
		it('should track dependencies when accessing numeric indexes', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[0] // Access first element
			})

			expect(effectCount).toBe(1)

			// Changing the value should trigger the effect
			reactiveArray[0] = 100
			expect(effectCount).toBe(2)
		})

		it('should track dependencies when accessing multiple indexes', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[1] // Access second element
				reactiveArray[2] // Access third element
			})

			expect(effectCount).toBe(1)

			// Changing either index should trigger the effect
			reactiveArray[1] = 200
			expect(effectCount).toBe(2)

			reactiveArray[2] = 300
			expect(effectCount).toBe(3)
		})

		it('should handle out-of-bounds index access', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[5] // Access out-of-bounds index
			})

			expect(effectCount).toBe(1)

			// Setting an out-of-bounds index should trigger the effect
			reactiveArray[5] = 999
			expect(effectCount).toBe(2)
		})
	})

	describe('length reactivity', () => {
		it('should track dependencies when pushing', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[4]
			})

			expect(effectCount).toBe(1)
			// Adding an element should not trigger the effect
			reactiveArray.push(4)
			expect(effectCount).toBe(1)
			// Adding another element should trigger the effect
			reactiveArray.push(5)
			expect(effectCount).toBe(2)
		})

		it('should track dependencies when length changes due to index assignment', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray.length
			})

			expect(effectCount).toBe(1)

			// Setting an index beyond current length should trigger the effect
			reactiveArray[5] = 999
			expect(effectCount).toBe(2)
			expect(reactiveArray.length).toBe(6)
		})

		it('should track dependencies when length changes due to push', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray.length
			})

			expect(effectCount).toBe(1)

			// Push should trigger the effect
			reactiveArray.push(4, 5)
			expect(effectCount).toBe(2)
			expect(reactiveArray.length).toBe(5)
		})

		it('should track dependencies when length changes due to pop', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray.length
			})

			expect(effectCount).toBe(1)

			// Pop should trigger the effect
			reactiveArray.pop()
			expect(effectCount).toBe(2)
			expect(reactiveArray.length).toBe(2)
		})
	})
	describe('array mimicry', () => {
		it('should return an array', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)
			expect(Array.isArray(reactiveArray)).toBe(true)
		})
		it('should flatmap', () => {
			const array = reactive([1, 2, 3])
			const reactiveArray = array.flatMap((x) => [x, x + 1])
			expect(unwrap(reactiveArray)).toEqual([1, 2, 2, 3, 3, 4])
		})
		it('should be flatmapped', () => {
			const array = reactive([1, 2, 3])
			const reactiveArray = [array].flatMap((x) => x)
			expect(reactiveArray).toEqual([1, 2, 3])
		})
	})
	describe('push and pop methods', () => {
		it('should handle push with reactivity', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[3] // Access index that will be created
			})

			expect(effectCount).toBe(1)
			expect(reactiveArray.length).toBe(3)

			reactiveArray.push(4)
			expect(effectCount).toBe(2)
			expect(reactiveArray.length).toBe(4)
			expect(reactiveArray[3]).toBe(4)
		})

		it('should handle pop with reactivity', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[2] // Access last element
			})

			expect(effectCount).toBe(1)
			expect(reactiveArray.length).toBe(3)

			const popped = reactiveArray.pop()
			expect(effectCount).toBe(2)
			expect(reactiveArray.length).toBe(2)
			expect(popped).toBe(3)
		})
	})

	describe('shift and unshift methods', () => {
		it('should handle shift with reactivity', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[0] // Access first element
				reactiveArray[1] // Access second element
			})

			expect(effectCount).toBe(1)

			const shifted = reactiveArray.shift()
			expect(effectCount).toBe(2)
			expect(shifted).toBe(1)
			expect(reactiveArray[0]).toBe(2)
			expect(reactiveArray[1]).toBe(3)
			expect(reactiveArray.length).toBe(2)
		})

		it('should handle unshift with reactivity', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[0] // Access first element
				reactiveArray[2] // Access third element
			})

			expect(effectCount).toBe(1)

			reactiveArray.unshift(0)
			expect(effectCount).toBe(2)
			expect(reactiveArray[0]).toBe(0)
			expect(reactiveArray[1]).toBe(1)
			expect(reactiveArray[3]).toBe(3)
			expect(reactiveArray.length).toBe(4)
		})
	})

	describe('splice method', () => {
		it('should handle splice with deletion only', () => {
			const array = [1, 2, 3, 4, 5]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[1] // Access second element
				reactiveArray[3] // Access fourth element
			})

			expect(effectCount).toBe(1)

			const removed = reactiveArray.splice(1, 2)
			expect(effectCount).toBe(2)
			expect(unwrap(removed)).toEqual([2, 3])
			expect(reactiveArray[1]).toBe(4)
			expect(reactiveArray[2]).toBe(5)
			expect(reactiveArray.length).toBe(3)
		})

		it('should handle splice with insertion only', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[1] // Access second element
				reactiveArray[3] // Access index that will be created
			})

			expect(effectCount).toBe(1)

			reactiveArray.splice(1, 0, 10, 20)
			expect(effectCount).toBe(2)
			expect(reactiveArray[1]).toBe(10)
			expect(reactiveArray[2]).toBe(20)
			expect(reactiveArray[3]).toBe(2)
			expect(reactiveArray.length).toBe(5)
		})

		it('should handle splice with replacement', () => {
			const array = [1, 2, 3, 4]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[1] // Access second element
				reactiveArray[2] // Access third element
			})

			expect(effectCount).toBe(1)

			const removed = reactiveArray.splice(1, 2, 10, 20)
			expect(effectCount).toBe(2)
			expect(unwrap(removed)).toEqual([2, 3])
			expect(reactiveArray[1]).toBe(10)
			expect(reactiveArray[2]).toBe(20)
			expect(reactiveArray.length).toBe(4)
		})

		it('should handle splice with negative start index', () => {
			const array = [1, 2, 3, 4, 5]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[3] // Access fourth element
			})

			expect(effectCount).toBe(1)

			reactiveArray.splice(-2, 1)
			expect(effectCount).toBe(2)
			expect(reactiveArray[3]).toBe(5)
			expect(reactiveArray.length).toBe(4)
		})

		it('should handle splice without deleteCount parameter', () => {
			const array = [1, 2, 3, 4, 5]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[1] // Access second element
			})

			expect(effectCount).toBe(1)

			const removed = reactiveArray.splice(1)
			expect(effectCount).toBe(2)
			expect(unwrap(removed)).toEqual([2, 3, 4, 5])
			expect(reactiveArray.length).toBe(1)
		})
	})

	describe('reverse method', () => {
		it('should handle reverse with reactivity', () => {
			const array = [1, 2, 3, 4]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[0] // Access first element
				reactiveArray[3] // Access last element
			})

			expect(effectCount).toBe(1)

			reactiveArray.reverse()
			expect(effectCount).toBe(2)
			expect(reactiveArray[0]).toBe(4)
			expect(reactiveArray[3]).toBe(1)
		})
	})

	describe('sort method', () => {
		it('should handle sort with reactivity', () => {
			const array = [3, 1, 4, 2]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[0] // Access first element
				reactiveArray[2] // Access third element
			})

			expect(effectCount).toBe(1)

			reactiveArray.sort()
			expect(effectCount).toBe(2)
			expect(reactiveArray[0]).toBe(1)
			expect(reactiveArray[2]).toBe(3)
		})

		it('should handle sort with compare function', () => {
			const array = [3, 1, 4, 2]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[0] // Access first element
			})

			expect(effectCount).toBe(1)

			reactiveArray.sort((a, b) => b - a) // Descending order
			expect(effectCount).toBe(2)
			expect(reactiveArray[0]).toBe(4)
		})
	})

	describe('fill method', () => {
		it('should handle fill with reactivity', () => {
			const array = [1, 2, 3, 4, 5]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[1] // Access second element
				reactiveArray[3] // Access fourth element
			})

			expect(effectCount).toBe(1)

			reactiveArray.fill(0, 1, 4)
			expect(effectCount).toBe(2)
			expect(reactiveArray[1]).toBe(0)
			expect(reactiveArray[3]).toBe(0)
			expect(reactiveArray[0]).toBe(1) // Should not change
			expect(reactiveArray[4]).toBe(5) // Should not change
		})

		it('should handle fill without start and end parameters', () => {
			const array = [1, 2, 3, 4, 5]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[0] // Access first element
				reactiveArray[4] // Access last element
			})

			expect(effectCount).toBe(1)

			reactiveArray.fill(0)
			expect(effectCount).toBe(2)
			expect(reactiveArray[0]).toBe(0)
			expect(reactiveArray[4]).toBe(0)
		})

		it('should handle fill with only start parameter', () => {
			const array = [1, 2, 3, 4, 5]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[2] // Access third element
				reactiveArray[4] // Access last element
			})

			expect(effectCount).toBe(1)

			reactiveArray.fill(0, 2)
			expect(effectCount).toBe(2)
			expect(reactiveArray[2]).toBe(0)
			expect(reactiveArray[4]).toBe(0)
			expect(reactiveArray[1]).toBe(2) // Should not change
		})
	})

	describe('copyWithin method', () => {
		it('should handle copyWithin with reactivity', () => {
			const array = [1, 2, 3, 4, 5]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[0] // Access first element
				reactiveArray[1] // Access second element
			})

			expect(effectCount).toBe(1)

			reactiveArray.copyWithin(0, 3, 5)
			expect(effectCount).toBe(2)
			expect(reactiveArray[0]).toBe(4)
			expect(reactiveArray[1]).toBe(5)
		})

		it('should handle copyWithin without end parameter', () => {
			const array = [1, 2, 3, 4, 5]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[0] // Access first element
			})

			expect(effectCount).toBe(1)

			reactiveArray.copyWithin(0, 2)
			expect(effectCount).toBe(2)
			expect(reactiveArray[0]).toBe(3)
			expect(reactiveArray[1]).toBe(4)
			expect(reactiveArray[2]).toBe(5)
		})

	})


	describe('mixed index and length reactivity', () => {
		it('should track both index and length changes in same effect', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray[0] // Access first element
				reactiveArray.length // Access length
			})

			expect(effectCount).toBe(1)

			// Changing an element should trigger the effect
			reactiveArray[0] = 100
			expect(effectCount).toBe(2)

			// Adding an element should trigger the effect
			reactiveArray.push(4)
			expect(effectCount).toBe(3)
		})

		it('should handle array expansion correctly', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray.length // Access length
			})

			expect(effectCount).toBe(1)

			// Setting the index should expand the array and trigger the effect
			reactiveArray[4] = 999
			expect(effectCount).toBe(2)
			expect(reactiveArray.length).toBe(5)
			expect(reactiveArray[4]).toBe(999)
		})
	})

	describe('iterator methods', () => {
		it('should track allProps for entries()', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray.entries()
			})

			expect(effectCount).toBe(1)

			// Any change should trigger the effect since entries() depends on allProps
			reactiveArray[0] = 100
			expect(effectCount).toBe(2)

			reactiveArray.push(4)
			expect(effectCount).toBe(3)
		})

		it('should only track length for keys()', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray.keys()
			})

			expect(effectCount).toBe(1)

			// Changing an element should NOT trigger the effect (only length changes)
			reactiveArray[0] = 100
			expect(effectCount).toBe(1)

			reactiveArray.push(4)
			expect(effectCount).toBe(2)
		})

		it('should track allProps for values()', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray.values()
			})

			expect(effectCount).toBe(1)

			// Any change should trigger the effect since values() depends on allProps
			reactiveArray[0] = 100
			expect(effectCount).toBe(2)

			reactiveArray.push(4)
			expect(effectCount).toBe(3)
		})

		it('should track allProps for Symbol.iterator', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			let effectCount = 0
			effect(() => {
				effectCount++
				for (const _value of reactiveArray) {
					// Just iterate to trigger the Symbol.iterator
				}
			})

			expect(effectCount).toBe(1)

			// Any change should trigger the effect since Symbol.iterator depends on allProps
			reactiveArray[0] = 100
			expect(effectCount).toBe(2)

			reactiveArray.push(4)
			expect(effectCount).toBe(3)
		})

		it('should work with for...of loops', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			const values: number[] = []
			let effectCount = 0
			effect(() => {
				effectCount++
				values.length = 0 // Clear previous values
				for (const value of reactiveArray) {
					values.push(value)
				}
			})

			expect(effectCount).toBe(1)
			expect(unwrap(values)).toEqual([1, 2, 3])

			// Modifying an element should trigger the effect
			reactiveArray[0] = 100
			expect(effectCount).toBe(2)
			expect(unwrap(values)).toEqual([100, 2, 3])

			// Adding an element should trigger the effect
			reactiveArray.push(4)
			expect(effectCount).toBe(3)
			expect(unwrap(values)).toEqual([100, 2, 3, 4])
		})
	})

	describe('basic functionality', () => {
		it('should handle empty arrays', () => {
			const array: number[] = []
			const reactiveArray = reactive(array)

			expect(reactiveArray.length).toBe(0)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveArray.length
			})

			expect(effectCount).toBe(1)

			reactiveArray.push(1)
			expect(effectCount).toBe(2)
		})

		describe('query methods', () => {
			it('should track anyProps for indexOf()', () => {
				const array = [1, 2, 3]
				const ra = reactive(array)
				let found = -1

				let runs = 0
				effect(() => {
					runs++
					found = ra.indexOf(2)
				})

				expect(runs).toBe(1)
				expect(found).toBe(1)

				ra[1] = 20
				expect(runs).toBe(2)
				expect(found).toBe(-1)

				ra.push(2)
				expect(runs).toBe(3)
				expect(found).toBe(3)
			})

			it('should track anyProps for find()', () => {
				const array = [1, 2, 3]
				const ra = reactive(array)
				let found: number | undefined
				let runs = 0
				effect(() => {
					runs++
					found = ra.find((v) => v === 9)
				})

				expect(runs).toBe(1)
				expect(found).toBeUndefined()

				ra[0] = 9
				expect(runs).toBe(2)
				expect(found).toBe(9)

				ra[0] = 1
				expect(runs).toBe(3)
				expect(found).toBeUndefined()
			})

			it('should track anyProps for every()', () => {
				const array = [1, 2, 3]
				const ra = reactive(array)
				let allTrue = false
				let runs = 0
				effect(() => {
					runs++
					allTrue = ra.every((v) => v > 0)
				})

				expect(runs).toBe(1)
				expect(allTrue).toBe(true)

				ra[1] = -1
				expect(runs).toBe(2)
				expect(allTrue).toBe(false)

				ra.splice(1, 1, 2)
				expect(runs).toBe(3)
				expect(allTrue).toBe(true)
			})

			it('should track anyProps for filter()', () => {
				const array = [1, 2, 3, 4]
				const ra = reactive(array)

				let filtered: number[] = []
				let runs = 0
				effect(() => {
					runs++
					filtered = ra.filter((v) => v % 2 === 0)
				})

				expect(runs).toBe(1)
				expect(unwrap(filtered)).toEqual([2, 4])

				ra[1] = 5
				expect(runs).toBe(2)
				expect(unwrap(filtered)).toEqual([4])

				ra.unshift(6)
				expect(runs).toBe(3)
				expect(unwrap(filtered)).toEqual([6, 4])
			})

			it('should track anyProps for map()', () => {
				const array = [1, 2, 3]
				const ra = reactive(array)

				let mapped: number[] = []
				let runs = 0
				effect(() => {
					runs++
					mapped = ra.map((v) => v * 2)
				})

				expect(runs).toBe(1)
				expect(unwrap(mapped)).toEqual([2, 4, 6])

				ra[1] = 5
				expect(runs).toBe(2)
				expect(unwrap(mapped)).toEqual([2, 10, 6])

				ra.push(4)
				expect(runs).toBe(3)
				expect(unwrap(mapped)).toEqual([2, 10, 6, 8])
			})

			it('should track anyProps for reduce()', () => {
				const array = [1, 2, 3]
				const ra = reactive(array)

				let sum = 0
				let runs = 0
				effect(() => {
					runs++
					sum = ra.reduce((a, b) => a + b, 0)
				})

				expect(runs).toBe(1)
				expect(sum).toBe(6)

				ra[0] = 10
				expect(runs).toBe(2)
				expect(sum).toBe(15)

				ra.push(4)
				expect(runs).toBe(3)
				expect(sum).toBe(19)
			})

			it('should track anyProps for reduceRight()', () => {
				const array = [1, 2, 3]
				const ra = reactive(array)

				let concat = ''
				let runs = 0
				effect(() => {
					runs++
					concat = ra.reduceRight((acc, v) => acc + String(v), '')
				})

				expect(runs).toBe(1)
				expect(concat).toBe('321')

				ra[0] = 9
				expect(runs).toBe(2)
				expect(concat).toBe('329')

				ra.unshift(0)
				expect(runs).toBe(3)
				expect(concat).toBe('3290')
			})

			it('should track anyProps for slice()', () => {
				const array = [1, 2, 3, 4]
				const ra = reactive(array)

				let sliced: number[] = []
				let runs = 0
				effect(() => {
					runs++
					sliced = ra.slice(1, 3)
				})

				expect(runs).toBe(1)
				expect(unwrap(sliced)).toEqual([2, 3])

				ra[2] = 9
				expect(runs).toBe(2)
				expect(unwrap(sliced)).toEqual([2, 9])

				ra.unshift(0)
				expect(runs).toBe(3)
				expect(unwrap(sliced)).toEqual([1, 2])
			})

			it('should track anyProps for concat()', () => {
				const array = [1, 2]
				const ra = reactive(array)

				let concatenated: number[] = []
				let runs = 0
				const extra = [3]
				effect(() => {
					runs++
					concatenated = unwrap(ra.concat(extra))
				})

				expect(runs).toBe(1)
				expect(concatenated).toEqual([1, 2, 3])

				ra[1] = 20
				expect(runs).toBe(2)
				expect(concatenated).toEqual([1, 20, 3])

				ra.push(4)
				expect(runs).toBe(3)
				expect(concatenated).toEqual([1, 20, 4, 3])
			})

			it('should track anyProps for join()', () => {
				const array = [1, 2, 3]
				const ra = reactive(array)

				let joined = ''
				let runs = 0
				effect(() => {
					runs++
					joined = ra.join('-')
				})

				expect(runs).toBe(1)
				expect(joined).toBe('1-2-3')

				ra[1] = 9
				expect(runs).toBe(2)
				expect(joined).toBe('1-9-3')

				ra.push(4)
				expect(runs).toBe(3)
				expect(joined).toBe('1-9-3-4')
			})

			it('should track anyProps for forEach()', () => {
				const array = [1, 2, 3]
				const ra = reactive(array)

				let sum = 0
				let runs = 0
				effect(() => {
					runs++
					sum = 0
					ra.forEach((v) => {
						sum += v
					})
				})

				expect(runs).toBe(1)
				expect(sum).toBe(6)

				ra[0] = 10
				expect(runs).toBe(2)
				expect(sum).toBe(15)

				ra.push(4)
				expect(runs).toBe(3)
				expect(sum).toBe(19)
			})
			it('should react when iterating a pre-fetched Symbol.iterator', () => {
				const array = [1, 2, 3]
				const reactiveArray = reactive(array)

				const values: number[] = []
				let effectCount = 0
				effect(() => {
					effectCount++
					values.length = 0
					// Pre-fetch iterator BEFORE iterating
					for (const value of reactiveArray) {
						values.push(value)
					}
				})

				expect(effectCount).toBe(1)
				expect(unwrap(values)).toEqual([1, 2, 3])

				// Changing an element should trigger the effect
				reactiveArray[0] = 100
				expect(effectCount).toBe(2)
				expect(unwrap(values)).toEqual([100, 2, 3])

				// Adding an element should also trigger the effect
				reactiveArray.push(4)
				expect(effectCount).toBe(3)
				expect(unwrap(values)).toEqual([100, 2, 3, 4])
			})
		})
		it('should work with reactive() function', () => {
			const array = [1, 2, 3]
			const reactiveArray = reactive(array)

			expect(reactiveArray).toBeInstanceOf(Array)
			expect(reactiveArray[0]).toBe(1)
			expect(reactiveArray[1]).toBe(2)
			expect(reactiveArray[2]).toBe(3)
			expect(reactiveArray.length).toBe(3)
		})
	})
})
