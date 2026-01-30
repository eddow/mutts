/**
 * Profiling tests for proxy operations
 * These tests measure the performance overhead of reactive proxy operations
 * Run with: npm run test:profile
 */
import { reactive } from 'mutts'
import {
	compareProfiles,
	formatComparison,
	formatProfileResult,
	profileSync,
} from './helpers'

describe('Proxy Performance Profiling', () => {
	describe('Property Access Overhead', () => {
		it('benchmark: reactive vs plain object property access', () => {
			const plainObj = { count: 0, name: 'test', nested: { value: 42 } }
			const reactiveObj = reactive({ count: 0, name: 'test', nested: { value: 42 } })

			const plainResult = profileSync(
				() => {
					// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
					plainObj.count
				},
				{ name: 'Plain object access', iterations: 1000000 }
			)

			const reactiveResult = profileSync(
				() => {
					// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
					reactiveObj.count
				},
				{ name: 'Reactive object access', iterations: 1000000 }
			)

			const comparison = compareProfiles([plainResult, reactiveResult])

			console.log(formatComparison(comparison))
			console.log(
				`Overhead: ${((reactiveResult.avgTime / plainResult.avgTime - 1) * 100).toFixed(2)}%`
			)

			// Track overhead for monitoring (reactive proxies have overhead, which is expected)
			// Typical overhead is 10-30x for property access due to proxy + dependency tracking
			const overhead = reactiveResult.avgTime / plainResult.avgTime
			console.log(`Reactive overhead: ${overhead.toFixed(2)}x`)
			// Ensure overhead is reasonable (< 50x) - adjust threshold if needed based on performance goals
			expect(overhead).toBeLessThan(50)
		})

		it('benchmark: nested property access overhead', () => {
			const plainObj = { nested: { deep: { value: 42 } } }
			const reactiveObj = reactive({ nested: { deep: { value: 42 } } })

			const plainResult = profileSync(
				() => {
					// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
					plainObj.nested.deep.value
				},
				{ name: 'Plain nested access', iterations: 500000 }
			)

			const reactiveResult = profileSync(
				() => {
					// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
					reactiveObj.nested.deep.value
				},
				{ name: 'Reactive nested access', iterations: 500000 }
			)

			const comparison = compareProfiles([plainResult, reactiveResult])
			console.log(formatComparison(comparison))
		})

		it('benchmark: property writes overhead', () => {
			const plainObj: any = { count: 0 }
			const reactiveObj: any = reactive({ count: 0 })

			const plainResult = profileSync(
				() => {
					plainObj.count = Math.random()
				},
				{ name: 'Plain object write', iterations: 500000 }
			)

			const reactiveResult = profileSync(
				() => {
					reactiveObj.count = Math.random()
				},
				{ name: 'Reactive object write', iterations: 500000 }
			)

			const comparison = compareProfiles([plainResult, reactiveResult])
			console.log(formatComparison(comparison))
		})
	})

	describe('Reactive Object Creation', () => {
		it('benchmark: reactive() creation overhead', () => {
			const objects = Array.from({ length: 10000 }, () => ({ count: 0, name: 'test' }))

			const plainResult = profileSync(
				() => {
					for (const obj of objects) {
						// Just reference to avoid optimization
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.count
					}
				},
				{ name: 'Plain object iteration', iterations: 100 }
			)

			const reactiveResult = profileSync(
				() => {
					for (const obj of objects) {
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						reactive(obj).count
					}
				},
				{ name: 'Reactive() creation', iterations: 100 }
			)

			const comparison = compareProfiles([plainResult, reactiveResult])
			console.log(formatComparison(comparison))
		})

		it('benchmark: repeated reactive() calls on same object', () => {
			const obj = { count: 0 }
			const reactive1 = reactive(obj)
			const reactive2 = reactive(obj)
			const reactive3 = reactive(obj)

			// All should return the same proxy
			expect(reactive1).toBe(reactive2)
			expect(reactive2).toBe(reactive3)

			const result = profileSync(
				() => {
					reactive(obj)
				},
				{ name: 'Reactive() cache lookup', iterations: 1000000 }
			)

			console.log(formatProfileResult(result))
			// Cached lookup should be very fast
			expect(result.avgTime).toBeLessThan(0.001) // Less than 1 microsecond
		})
	})

	describe('Prototype Chain Traversal', () => {
		it('benchmark: inherited property access', () => {
			class Base {
				baseProp = 'base'
			}
			class Derived extends Base {
				derivedProp = 'derived'
			}

			const plain = new Derived()
			const reactiveObj = reactive(new Derived())

			const plainResult = profileSync(
				() => {
					// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
					plain.baseProp
				},
				{ name: 'Plain inherited access', iterations: 500000 }
			)

			const reactiveResult = profileSync(
				() => {
					// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
					reactiveObj.baseProp
				},
				{ name: 'Reactive inherited access', iterations: 500000 }
			)

			const comparison = compareProfiles([plainResult, reactiveResult])
			console.log(formatComparison(comparison))
		})
	})
})

