/**
 * Profiling tests for dependency tracking
 * Measures the overhead of dependant() calls which happen on every property access
 * Run with: npm run test:profile
 */
import { effect } from 'mutts/reactive/effects'
import { reactive } from 'mutts/reactive/proxy'
import { profileSync } from './helpers'

describe('Dependency Tracking Performance', () => {
	describe('dependant() Overhead', () => {
		it('benchmark: property access with active effect', () => {
			const obj = reactive({ count: 0, items: [1, 2, 3] })

			// With active effect (dependant() is called)
			const withEffect = profileSync(
				() => {
					effect(() => {
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.count
					})()
				},
				{ name: 'Access with effect tracking', iterations: 10000 }
			)

			// Without active effect (no dependant() call)
			const withoutEffect = profileSync(
				() => {
					// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
					obj.count
				},
				{ name: 'Access without effect', iterations: 100000 }
			)

			console.log('With effect:', withEffect)
			console.log('Without effect:', withoutEffect)
		})

		it('benchmark: multiple property accesses in effect', () => {
			const obj = reactive({
				count: 0,
				name: 'test',
				nested: { value: 42 },
				items: [1, 2, 3],
			})

			const result = profileSync(
				() => {
					effect(() => {
						// Access multiple properties
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.count
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.name
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.nested.value
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.items.length
					})()
				},
				{ name: 'Multiple property accesses', iterations: 5000 }
			)

			console.log(result)
		})

		it('benchmark: array iteration with tracking', () => {
			const arr = reactive([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

			const result = profileSync(
				() => {
					effect(() => {
						for (const item of arr) {
							// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
							item
						}
					})()
				},
				{ name: 'Array iteration with tracking', iterations: 1000 }
			)

			console.log(result)
		})
	})

	describe('Effect Registration', () => {
		it('benchmark: creating and cleaning up effects', () => {
			const obj = reactive({ count: 0 })

			const createResult = profileSync(
				() => {
					const stop = effect(() => {
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.count
					})
					stop()
				},
				{ name: 'Create and cleanup effect', iterations: 5000 }
			)

			console.log(createResult)
		})

		it('benchmark: effect cleanup overhead', () => {
			const obj = reactive({ count: 0 })

			// Create many effects
			const effects = Array.from({ length: 1000 }, () =>
				effect(() => {
					// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
					obj.count
				})
			)

			const cleanupResult = profileSync(
				() => {
					for (const stop of effects) {
						stop()
					}
				},
				{ name: 'Bulk effect cleanup', iterations: 1 }
			)

			console.log(cleanupResult)
		})
	})
})

