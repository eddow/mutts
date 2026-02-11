import { reactive, when } from 'mutts'

describe('when', () => {
	it('resolves immediately if predicate is already truthy', async () => {
		const state = reactive({ ready: true })
		const result = await when(() => state.ready)
		expect(result).toBe(true)
	})

	it('resolves when predicate becomes truthy', async () => {
		const state = reactive({ count: 0 })
		const promise = when(() => state.count >= 3 && state.count)
		state.count = 1
		state.count = 2
		state.count = 3
		const result = await promise
		expect(result).toBe(3)
	})

	it('resolves with the truthy return value', async () => {
		const state = reactive({ user: null as { name: string } | null })
		const promise = when(() => state.user)
		state.user = { name: 'Alice' }
		const result = await promise
		expect(result).toEqual({ name: 'Alice' })
	})

	it('cleans up the effect after resolving', async () => {
		const state = reactive({ done: false })
		let runs = 0
		const promise = when(() => {
			runs++
			return state.done
		})
		expect(runs).toBe(1)
		state.done = true
		await promise
		const runsAfterResolve = runs
		state.done = false
		state.done = true
		expect(runs).toBe(runsAfterResolve)
	})

	it('rejects on timeout', async () => {
		const state = reactive({ ready: false })
		await expect(when(() => state.ready, 50)).rejects.toThrow('timed out')
	})

	it('does not reject if resolved before timeout', async () => {
		const state = reactive({ ready: false })
		const promise = when(() => state.ready, 500)
		state.ready = true
		await expect(promise).resolves.toBe(true)
	})
})
