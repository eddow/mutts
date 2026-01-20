/**
 * Memory profiling tests for reactive operations
 * Measures memory overhead of various reactive operations
 * Run with: npm run test:profile
 */
import { effect } from 'mutts/reactive/effects'
import { reactive } from 'mutts/reactive/proxy'
import { profileMemory, formatMemoryProfile } from './helpers'

describe('Memory Performance Profiling', () => {
	describe('Object Creation Memory', () => {
		it('benchmark: reactive object creation memory overhead', () => {
			const memoryProfile = profileMemory(
				() => {
					const obj = reactive({ count: 0, name: 'test', items: [1, 2, 3] })
					// Force proxy creation
					// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
					obj.count
				},
				{ iterations: 10000 }
			)

			console.log(formatMemoryProfile(memoryProfile, 'Reactive object creation'))
			// Reactive objects should have minimal memory overhead
			expect(memoryProfile.delta / 1024).toBeLessThan(10) // Less than 10KB per object
		})

		it('benchmark: plain object creation vs reactive', () => {
			const plainMemory = profileMemory(
				() => {
					const obj = { count: 0, name: 'test', items: [1, 2, 3] }
					// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
					obj.count
				},
				{ iterations: 10000 }
			)

			const reactiveMemory = profileMemory(
				() => {
					const obj = reactive({ count: 0, name: 'test', items: [1, 2, 3] })
					// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
					obj.count
				},
				{ iterations: 10000 }
			)

			console.log(formatMemoryProfile(plainMemory, 'Plain object creation'))
			console.log(formatMemoryProfile(reactiveMemory, 'Reactive object creation'))
			
			const overhead = reactiveMemory.delta / plainMemory.delta
			console.log(`Memory overhead: ${overhead.toFixed(2)}x`)
			
			// Reactive should have reasonable overhead (< 5x)
			expect(overhead).toBeLessThan(5)
		})
	})

	describe('Effect Memory', () => {
		it('benchmark: effect creation and cleanup memory', () => {
			const obj = reactive({ count: 0 })

			const memoryProfile = profileMemory(
				() => {
					const stop = effect(() => {
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.count
					})
					stop()
				},
				{ iterations: 1000 }
			)

			console.log(formatMemoryProfile(memoryProfile, 'Effect lifecycle'))
			// Effects should cleanup properly
			expect(memoryProfile.delta / 1024).toBeLessThan(50) // Less than 50KB per effect
		})

		it('benchmark: multiple effects memory overhead', () => {
			const obj = reactive({ count: 0, name: 'test', items: [1, 2, 3] })

			const memoryProfile = profileMemory(
				() => {
					const stops: (() => void)[] = []
					for (let i = 0; i < 10; i++) {
						stops.push(
							effect(() => {
								// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
								obj.count
								// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
								obj.name
								// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
								obj.items.length
							})
						)
					}
					for (const stop of stops) stop()
				},
				{ iterations: 100 }
			)

			console.log(formatMemoryProfile(memoryProfile, 'Multiple effects'))
			expect(memoryProfile.delta / 1024).toBeLessThan(100) // Less than 100KB per 10 effects
		})
	})

	describe('Array Memory', () => {
		it('benchmark: reactive array operations memory', () => {
			const memoryProfile = profileMemory(
				() => {
					const arr: any[] = reactive([1, 2, 3, 4, 5])
					arr.push(6)
					arr.pop()
					arr.unshift(0)
					arr.shift()
				},
				{ iterations: 1000 }
			)

			console.log(formatMemoryProfile(memoryProfile, 'Array operations'))
			expect(memoryProfile.delta / 1024).toBeLessThan(20) // Less than 20KB per operation batch
		})
	})

	describe('Dependency Tracking Memory', () => {
		it('benchmark: dependency tracking memory overhead', () => {
			const obj = reactive({ a: 1, b: 2, c: 3, d: 4, e: 5 })

			const memoryProfile = profileMemory(
				() => {
					effect(() => {
						// Access multiple properties to create dependencies
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.a
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.b
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.c
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.d
						// biome-ignore lint/style/noUnusedExpressions: Intentional for profiling
						obj.e
					})()
				},
				{ iterations: 1000 }
			)

			console.log(formatMemoryProfile(memoryProfile, 'Dependency tracking'))
			expect(memoryProfile.delta / 1024).toBeLessThan(30) // Less than 30KB per effect with dependencies
		})
	})
})

