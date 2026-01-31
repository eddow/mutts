/**
 * Profiling tests for deep watching functionality
 * Measures the overhead of deep watch traversal and back-reference management
 * Run with: npm run test:profile
 */
import { deepWatch } from 'mutts'
import { reactive } from 'mutts'
import { profileSync, profileMemory, formatMemoryProfile } from './helpers'

describe('Deep Watch Performance', () => {
	describe('Deep Watch Setup', () => {
		it('benchmark: deep watch traversal time', () => {
			// Create nested object structure
			const createNested = (depth: number, width: number): any => {
				if (depth === 0) {
					return { value: Math.random() }
				}
				const obj: any = {}
				for (let i = 0; i < width; i++) {
					obj[`prop${i}`] = createNested(depth - 1, width)
				}
				return obj
			}

			const obj = reactive(createNested(3, 5)) // 3 levels, 5 properties each

			const result = profileSync(
				() => {
					const stop = deepWatch(obj, () => {})
					stop?.()
				},
				{ name: 'Deep watch setup (3 levels, 5 props)', iterations: 100 }
			)

			console.log(result)
		})

		it('benchmark: deep watch on large arrays', () => {
			const arr: any[] = reactive(
				Array.from({ length: 1000 }, (_, i) => ({
					id: i,
					value: Math.random(),
					nested: { count: i * 2 },
				}))
			)

			const result = profileSync(
				() => {
					const stop = deepWatch(arr, () => {})
					stop?.()
				},
				{ name: 'Deep watch on array[1000]', iterations: 10, warmup: 10 }
			)

			console.log(result)
		}, 30000)
	})

	describe('Deep Watch Memory', () => {
		it('benchmark: memory overhead of deep watching', () => {
			const createLargeObject = () => {
				const obj: any = {}
				for (let i = 0; i < 100; i++) {
					obj[`prop${i}`] = {
						value: Math.random(),
						nested: { count: i },
					}
				}
				return reactive(obj)
			}

			const memoryProfile = profileMemory(
				() => {
					const obj = createLargeObject()
					const stop = deepWatch(obj, () => {})
					stop?.()
				},
				{ iterations: 100 }
			)

			console.log(formatMemoryProfile(memoryProfile, 'Deep watch overhead'))
			// Deep watching should have reasonable memory overhead
			expect(memoryProfile.deltaPercent).toBeLessThan(200) // Less than 200% increase
		})
	})

	describe('Deep Watch Change Detection', () => {
		it('benchmark: nested property change detection', () => {
			const obj: any = reactive({
				user: {
					profile: {
						name: 'John',
						age: 30,
						settings: {
							theme: 'dark',
							notifications: true,
						},
					},
				},
			})

			let callCount = 0
			const stop = deepWatch(obj, () => {
				callCount++
			})

			const result = profileSync(
				() => {
					obj.user.profile.age++
				},
				{ name: 'Deep watch change detection', iterations: 1000 }
			)

			stop?.()

			console.log(result)
			console.log(`Deep watch triggered ${callCount} times`)
		})

		it('benchmark: deep watch with multiple nested changes', () => {
			const obj: any = reactive({
				items: Array.from({ length: 100 }, (_, i) => ({
					id: i,
					value: Math.random(),
				})),
			})

			let callCount = 0
			const stop = deepWatch(obj, () => {
				callCount++
			})

			const result = profileSync(
				() => {
					for (let i = 0; i < 10; i++) {
						obj.items[i].value = Math.random()
					}
				},
				{ name: 'Multiple nested changes', iterations: 100 }
			)

			stop?.()

			console.log(result)
		}, 30000)
	})
})

