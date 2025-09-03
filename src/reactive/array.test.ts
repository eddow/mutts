import { effect, reactive } from './index'

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
				reactiveArray.length // Access index beyond current length
			})

			expect(effectCount).toBe(1)

			// Setting the index should expand the array and trigger the effect
			reactiveArray[4] = 999
			expect(effectCount).toBe(2)
			expect(reactiveArray.length).toBe(5)
			expect(reactiveArray[4]).toBe(999)
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
	})
})
