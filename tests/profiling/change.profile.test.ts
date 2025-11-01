/**
 * Profiling tests for change detection and effect dispatch
 * Measures the overhead of touched(), effect collection, and batching
 * Run with: npm run test:profile
 */
import { effect } from 'mutts/reactive/effects'
import { reactive } from 'mutts/reactive/proxy'
import { profileSync } from './helpers'

describe('Change Detection Performance', () => {
	describe('Effect Dispatch', () => {
		it('benchmark: single property change triggering one effect', () => {
			const obj: any = reactive({ count: 0 })
			let callCount = 0

			const stop = effect(() => {
				callCount++
				// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
				obj.count
			})

			const result = profileSync(
				() => {
					obj.count++
				},
				{ name: 'Single change, single effect', iterations: 10000 }
			)

			stop()

			console.log(result)
			console.log(`Effect was called ${callCount} times`)
			// Allow some variance due to profiling overhead - expect at least 10001 (initial + changes)
			expect(callCount).toBeGreaterThanOrEqual(10001)
		})

		it('benchmark: single property change triggering multiple effects', () => {
			const obj: any = reactive({ count: 0 })
			let callCount = 0

			// Create multiple effects watching the same property
			const stops = Array.from({ length: 10 }, () =>
				effect(() => {
					callCount++
					// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
					obj.count
				})
			)

			const result = profileSync(
				() => {
					obj.count++
				},
				{ name: 'Single change, 10 effects', iterations: 1000 }
			)

			stops.forEach((stop) => stop())

			console.log(result)
			console.log(`Total effect calls: ${callCount}`)
		})

		it('benchmark: multiple property changes', () => {
			const obj: any = reactive({ a: 0, b: 0, c: 0, d: 0, e: 0 })
			let callCount = 0

			const stop = effect(() => {
				callCount++
				// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
				obj.a
				// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
				obj.b
				// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
				obj.c
			})

			const result = profileSync(
				() => {
					obj.a++
					obj.b++
					obj.c++
				},
				{ name: 'Multiple changes', iterations: 5000 }
			)

			stop()

			console.log(result)
		})
	})

	describe('Batching', () => {
		it('benchmark: batched changes vs individual changes', () => {
			const obj: any = reactive({ count: 0 })
			let callCount = 0

			const stop = effect(() => {
				callCount++
				// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
				obj.count
			})

			// Individual changes (not batched)
			const individualResult = profileSync(
				() => {
					for (let i = 0; i < 10; i++) {
						obj.count++
					}
				},
				{ name: '10 individual changes', iterations: 1000 }
			)

			// Reset
			obj.count = 0
			callCount = 0

			// Batched changes (using atomic)
			const { atomic } = require('mutts/reactive/effects')
			const batchedFn = atomic(() => {
				for (let i = 0; i < 10; i++) {
					obj.count++
				}
			})

			const batchedResult = profileSync(
				() => {
					batchedFn()
				},
				{ name: '10 batched changes', iterations: 1000 }
			)

			stop()

			console.log('Individual:', individualResult)
			console.log('Batched:', batchedResult)
			console.log(
				`Batching is ${(individualResult.avgTime / batchedResult.avgTime).toFixed(2)}x faster`
			)
		})
	})

	describe('Deep Changes', () => {
		it('benchmark: nested property changes', () => {
			const obj: any = reactive({
				user: {
					profile: {
						name: 'John',
						age: 30,
					},
				},
			})
			let callCount = 0

			const stop = effect(() => {
				callCount++
				// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
				obj.user.profile.name
				// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
				obj.user.profile.age
			})

			const result = profileSync(
				() => {
					obj.user.profile.age++
				},
				{ name: 'Nested property change', iterations: 5000 }
			)

			stop()

			console.log(result)
			// Allow some variance due to profiling overhead - expect at least 5001 (initial + changes)
			expect(callCount).toBeGreaterThanOrEqual(5001)
		})

		it('benchmark: object replacement vs property change', () => {
			const obj: any = reactive({
				user: {
					name: 'John',
					age: 30,
				},
			})
			let callCount = 0

			const stop = effect(() => {
				callCount++
				// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
				obj.user.name
			})

			// Property change
			const propertyChange = profileSync(
				() => {
					obj.user.age = 31
				},
				{ name: 'Property change', iterations: 5000 }
			)

			// Reset
			obj.user = { name: 'John', age: 30 }
			callCount = 0

			// Object replacement
			const objectReplace = profileSync(
				() => {
					obj.user = { name: 'John', age: 31 }
				},
				{ name: 'Object replacement', iterations: 5000 }
			)

			stop()

			console.log('Property change:', propertyChange)
			console.log('Object replacement:', objectReplace)
		})
	})
})

