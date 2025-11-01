/**
 * Profiling tests for reactive arrays
 * Measures performance of array operations and reactive wrappers
 * Run with: npm run test:profile
 */
import { reactive } from 'mutts/reactive/proxy'
import { profileSync } from './helpers'

describe('Array Performance Profiling', () => {
	describe('Array Access', () => {
		it('benchmark: reactive array index access', () => {
			const plainArr = Array.from({ length: 100 }, (_, i) => i)
			const reactiveArr = reactive(plainArr)

			const plainResult = profileSync(
				() => {
					for (let i = 0; i < 100; i++) {
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						plainArr[i]
					}
				},
				{ name: 'Plain array access', iterations: 10000 }
			)

			const reactiveResult = profileSync(
				() => {
					for (let i = 0; i < 100; i++) {
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						reactiveArr[i]
					}
				},
				{ name: 'Reactive array access', iterations: 10000 }
			)

			console.log('Plain:', plainResult)
			console.log('Reactive:', reactiveResult)
		})
	})

	describe('Array Mutations', () => {
		it('benchmark: push operations', () => {
			const reactiveArr: any[] = reactive([])

			const result = profileSync(
				() => {
					reactiveArr.push(Math.random())
				},
				{ name: 'Reactive array push', iterations: 10000 }
			)

			console.log(result)
		})

		it('benchmark: splice operations', () => {
			const reactiveArr: any[] = reactive(Array.from({ length: 100 }, (_, i) => i))

			const result = profileSync(
				() => {
					reactiveArr.splice(50, 1, Math.random())
				},
				{ name: 'Reactive array splice', iterations: 5000 }
			)

			console.log(result)
		})

		it('benchmark: array iteration methods', () => {
			const reactiveArr: any[] = reactive(Array.from({ length: 100 }, (_, i) => i))

			const mapResult = profileSync(
				() => {
					reactiveArr.map((x) => x * 2)
				},
				{ name: 'Array.map()', iterations: 1000 }
			)

			const filterResult = profileSync(
				() => {
					reactiveArr.filter((x) => x % 2 === 0)
				},
				{ name: 'Array.filter()', iterations: 1000 }
			)

			console.log('Map:', mapResult)
			console.log('Filter:', filterResult)
		})
	})

	describe('Array Length Changes', () => {
		it('benchmark: length changes triggering effects', () => {
			const arr: any[] = reactive([1, 2, 3])
			let callCount = 0

			const { effect } = require('mutts/reactive/effects')
			const stop = effect(() => {
				callCount++
				// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
				arr.length
			})

			const result = profileSync(
				() => {
					arr.push(4)
				},
				{ name: 'Array push with length tracking', iterations: 1000 }
			)

			stop()

			console.log(result)
			console.log(`Effect called ${callCount} times`)
		})
	})
})

