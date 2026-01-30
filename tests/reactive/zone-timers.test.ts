import { effect, reactive } from '../../src/reactive/index'
import { asyncZoneManager } from '../../src/zone'

describe('Zone: Timer and async entry point preservation', () => {
	beforeAll(() => {
		asyncZoneManager.hook()
	})

	afterAll(() => {
		asyncZoneManager.unhook()
	})

	it('should preserve effect context in setTimeout callbacks', async () => {
		const state = reactive({ count: 0 })
		const results: number[] = []

		effect(() => {
			setTimeout(() => {
				// Should automatically track without manual tracked() wrapper
				results.push(state.count)
			}, 10)
		})

		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(results).toContain(0)

		// Change count - should trigger effect again
		state.count = 5
		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(results).toContain(5)
	})

	it('should preserve effect context in setInterval callbacks', async () => {
		const state = reactive({ count: 0 })
		const results: number[] = []

		effect(() => {
			const intervalId = setInterval(() => {
				// Should automatically track
				results.push(state.count)
			}, 10)

			// Clean up interval
			return () => clearInterval(intervalId)
		})

		await new Promise((resolve) => setTimeout(resolve, 50))
		// Should have collected at least one result
		expect(results.length).toBeGreaterThan(0)
		expect(results[0]).toBe(0)
	})

	it('should preserve effect context in queueMicrotask callbacks', async () => {
		if (typeof queueMicrotask === 'undefined') {
			// Skip if queueMicrotask is not available
			return
		}

		const state = reactive({ count: 0 })
		let trackedCount: number | null = null

		effect(() => {
			queueMicrotask(() => {
				// Should automatically track
				trackedCount = state.count
			})
		})

		// Wait for microtask to execute
		await new Promise((resolve) => setTimeout(resolve, 10))

		expect(trackedCount).toBe(0)
	})

	it('should work with nested async operations', async () => {
		const state = reactive({ count: 0 })
		const results: number[] = []

		effect(() => {
			setTimeout(() => {
				// First async boundary
				const value = state.count
				Promise.resolve(value).then((v) => {
					// Second async boundary
					setTimeout(() => {
						// Third async boundary
						results.push(v)
					}, 10)
				})
			}, 10)
		})

		await new Promise((resolve) => setTimeout(resolve, 100))

		expect(results).toContain(0)
	})
})

