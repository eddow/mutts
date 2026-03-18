/**
 * Memory profiling tests for reactive operations
 * Measures memory overhead of various reactive operations
 * Run with: npm run test:profile
 */
import { effect } from 'mutts'
import { reactive } from 'mutts'
import { reactiveOptions } from 'mutts'
import { profileMemory, formatMemoryProfile } from './helpers'

const objectProfileOptions = { iterations: 10000 }
const effectProfileOptions = { iterations: 1000 }
const multipleEffectsProfileOptions = { iterations: 100, gcBetween: true }
const noIntrospection = undefined

describe('Memory Performance Profiling', () => {
	const originalIntrospection = reactiveOptions.introspection

	beforeAll(() => {
		reactiveOptions.introspection = noIntrospection
	})

	afterAll(() => {
		reactiveOptions.introspection = originalIntrospection
	})

	describe('Object Creation Memory', () => {
		it('benchmark: reactive object creation memory overhead', () => {
			const memoryProfile = profileMemory(
				() => {
					const obj = reactive({ count: 0, name: 'test', items: [1, 2, 3] })
					// Force proxy creation
					void obj.count
				},
				objectProfileOptions
			)

			console.log(formatMemoryProfile(memoryProfile, 'Reactive object creation'))
			// Reactive objects should have minimal memory overhead
			expect(memoryProfile.delta / 1024).toBeLessThan(10) // Less than 10KB per object
		})

		it('benchmark: plain object creation vs reactive', () => {
			const plainMemory = profileMemory(
				() => {
					const obj = { count: 0, name: 'test', items: [1, 2, 3] }
					void obj.count
				},
				objectProfileOptions
			)

			const reactiveMemory = profileMemory(
				() => {
					const obj = reactive({ count: 0, name: 'test', items: [1, 2, 3] })
					void obj.count
				},
				objectProfileOptions
			)

			console.log(formatMemoryProfile(plainMemory, 'Plain object creation'))
			console.log(formatMemoryProfile(reactiveMemory, 'Reactive object creation'))
			
			const overhead = reactiveMemory.delta / plainMemory.delta
			console.log(`Memory overhead: ${overhead.toFixed(2)}x`)
			
			// Reactive should have reasonable overhead (< 5x)
			expect(overhead).toBeLessThan(10)
		})
	})

	describe('Effect Memory', () => {
		it('benchmark: effect creation and cleanup memory', () => {
			const obj = reactive({ count: 0 })
			const runs: number[] = []
			for (let run = 0; run < 3; run++) {
				if (global.gc) global.gc()

				const memoryProfile = profileMemory(
					() => {
						const stop = effect(function effectCreationMemory() {
							void obj.count
						})
						stop()
					},
					effectProfileOptions
				)
				runs.push(memoryProfile.delta / 1024)
			}

			runs.sort((a, b) => a - b)
			const medianKB = runs[1]!

			console.log(`Effect lifecycle memory (3 runs): ${runs.map(r => r.toFixed(2)).join(', ')} KB`)
			console.log(`Median: ${medianKB.toFixed(2)} KB`)
			// Effects should cleanup properly
			expect(medianKB).toBeLessThan(50) // Less than 50KB per effect
		})

		it('benchmark: multiple effects memory overhead', () => {
			const obj = reactive({ count: 0, name: 'test', items: [1, 2, 3] })

			// Run 3 times and take median to reduce GC variance
			const runs: number[] = []
			for (let run = 0; run < 3; run++) {
				if (global.gc) global.gc()
				
				const memoryProfile = profileMemory(
					() => {
						const stops: (() => void)[] = []
						for (let i = 0; i < 10; i++) {
							stops.push(
								effect(function multipleEffectsMemory() {
									void obj.count
									void obj.name
									void obj.items.length
								})
							)
						}
						for (const stop of stops) stop()
					},
					multipleEffectsProfileOptions
				)
				runs.push(memoryProfile.delta / 1024)
			}
			
			// Use median to filter outliers
			runs.sort((a, b) => a - b)
			const medianKB = runs[1]!
			
			console.log(`Multiple effects memory (3 runs): ${runs.map(r => r.toFixed(2)).join(', ')} KB`)
			console.log(`Median: ${medianKB.toFixed(2)} KB`)
			
			// Warn if approaching threshold (80KB+), fail if excessive (300KB+)
			// Typical: 40-50KB in isolation. Full test suite causes heap pressure → 150-250KB.
			// Median filtering helps but doesn't eliminate test-order effects.
			if (medianKB >= 80) {
				console.warn(`⚠️  Memory overhead is ${medianKB.toFixed(2)}KB (typical: 40-50KB isolated, 150-250KB in suite, threshold: 300KB)`)
			}
			expect(medianKB).toBeLessThan(300) // Account for heap pressure from prior tests
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
				effectProfileOptions
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
					effect(function dependencyTrackingMemory() {
						// Access multiple properties to create dependencies
						void obj.a
						void obj.b
						void obj.c
						void obj.d
						void obj.e
					})()
				},
				effectProfileOptions
			)

			console.log(formatMemoryProfile(memoryProfile, 'Dependency tracking'))
			expect(memoryProfile.delta / 1024).toBeLessThan(30) // Less than 30KB per effect with dependencies
		})
	})
})

