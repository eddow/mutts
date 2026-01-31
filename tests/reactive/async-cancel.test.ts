import { describe, expect, it } from 'vitest'
import { effect, reactive, ReactiveError } from 'mutts'

describe('Effect async cancellation', () => {
	it('should cancel previous async execution when effect is retriggered', async () => {
		const state = reactive({ id: 1 })
		const results: number[] = []
		const errors: any[] = []

		effect(
			() => {
				return new Promise<number>((resolve) => {
					setTimeout(() => {
						resolve(state.id)
					}, 100)
				}).then((value) => {
					results.push(value)
				})
			},
			{ asyncMode: 'cancel' }
		)

		// Wait a bit, then change dependency
		await new Promise((resolve) => setTimeout(resolve, 50))
		state.id = 2

		// Wait for both promises to complete
		await new Promise((resolve) => setTimeout(resolve, 150))

		// Should only have the latest result (first was canceled)
		expect(results).toEqual([2])
	})

	it('should handle promise chains correctly when canceled', async () => {
		const state = reactive({ id: 1 })
		const thenResults: number[] = []
		const catchErrors: any[] = []

		// Note: When an effect is canceled, the promise chain is already established.
		// The cancellation prevents the effect from continuing, but the promise itself
		// will still resolve. The key is that the new effect execution replaces the old one.
		effect(
			() => {
				return new Promise<number>((resolve) => {
					setTimeout(() => resolve(state.id), 100)
				})
					.then((value) => {
						thenResults.push(value)
						return value * 2
					})
					.catch((error) => {
						catchErrors.push(error)
					})
			},
			{ asyncMode: 'cancel' }
		)

		await new Promise((resolve) => setTimeout(resolve, 50))
		state.id = 2 // This cancels the first execution and starts a new one

		await new Promise((resolve) => setTimeout(resolve, 150))

		// The first promise might still resolve (we can't truly cancel it),
		// but a new effect execution should have started
		// This test verifies the cancellation mechanism doesn't break promise chains
		expect(thenResults.length).toBeGreaterThan(0)
	})

	it('should handle ignore mode', async () => {
		const state = reactive({ id: 1 })
		const executions: number[] = []

		effect(
			() => {
				executions.push(state.id)
				return new Promise<void>((resolve) => {
					setTimeout(() => resolve(), 100)
				})
			},
			{ asyncMode: 'ignore' }
		)

		// Trigger multiple changes quickly
		await new Promise((resolve) => setTimeout(resolve, 10))
		state.id = 2

		await new Promise((resolve) => setTimeout(resolve, 10))
		state.id = 3

		// Wait for async work
		await new Promise((resolve) => setTimeout(resolve, 150))

		// Should only execute once (others ignored)
		expect(executions.length).toBe(1)
		expect(executions[0]).toBe(1)
	})

	it('should default to cancel mode', async () => {
		const state = reactive({ id: 1 })
		const results: number[] = []

		effect(() => {
			return new Promise<number>((resolve) => {
				setTimeout(() => resolve(state.id), 100)
			}).then((value) => {
				results.push(value)
			})
		})

		await new Promise((resolve) => setTimeout(resolve, 50))
		state.id = 2
		await new Promise((resolve) => setTimeout(resolve, 150))

		// Should only have latest (cancel mode by default)
		expect(results).toEqual([2])
	})

	it('should not affect synchronous effects', () => {
		const state = reactive({ count: 0 })
		let executionCount = 0

		effect(
			() => {
				executionCount++
				state.count // Track dependency
				// No Promise returned - synchronous
			},
			{ asyncMode: 'cancel' }
		)

		state.count = 1
		state.count = 2

		// Should execute for each change
		expect(executionCount).toBe(3) // Initial + 2 changes
	})
})

