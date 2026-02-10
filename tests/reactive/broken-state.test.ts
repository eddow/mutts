import { describe, it, expect, afterEach } from 'vitest'
import { effect, onEffectThrow, reset } from '../../src/reactive/effects'
import { reactive } from '../../src/reactive/proxy'
import { ReactiveError, ReactiveErrorCode, options } from '../../src/reactive/types'

const originalCycleHandling = options.cycleHandling
const originalMaxEffectChain = options.maxEffectChain

afterEach(() => {
	reset()
	options.cycleHandling = originalCycleHandling
	options.maxEffectChain = originalMaxEffectChain
})

describe('broken state and reset', () => {
	it('should enter broken state when an unrecoverable error escapes a batch', () => {
		const state = reactive({ value: 0 })

		effect(() => {
			if (state.value === 1) throw new Error('Unrecoverable')
		})

		// The unrecoverable error escapes the batch
		expect(() => {
			state.value = 1
		}).toThrow('Unrecoverable')

		// System is now broken — any reactive mutation should throw BrokenEffects
		expect(() => {
			state.value = 2
		}).toThrow(ReactiveError)

		try {
			state.value = 3
		} catch (e: unknown) {
			expect(e).toBeInstanceOf(ReactiveError)
			expect((e as ReactiveError).code).toBe(ReactiveErrorCode.BrokenEffects)
		}
	})

	it('should recover after reset()', () => {
		const state = reactive({ value: 0 })

		effect(() => {
			if (state.value === 1) throw new Error('Unrecoverable')
		})

		expect(() => {
			state.value = 1
		}).toThrow('Unrecoverable')

		// System is broken
		expect(() => {
			state.value = 2
		}).toThrow(ReactiveError)

		// Reset brings system back
		reset()

		// New effects work after reset
		const results: number[] = []
		const state2 = reactive({ count: 0 })
		effect(() => {
			results.push(state2.count)
		})
		expect(results).toEqual([0])

		state2.count = 42
		expect(results).toEqual([0, 42])
	})

	it('should NOT enter broken state when error is recovered by onEffectThrow', () => {
		const state = reactive({ value: 0 })
		let caught = false

		effect(() => {
			onEffectThrow(() => {
				caught = true
			})
			if (state.value === 1) throw new Error('Recoverable')
		})

		// Error is caught by onEffectThrow — batch continues, no broken state
		state.value = 1
		expect(caught).toBe(true)

		// System should still work
		const state2 = reactive({ x: 0 })
		const values: number[] = []
		effect(() => {
			values.push(state2.x)
		})
		state2.x = 10
		expect(values).toEqual([0, 10])
	})

	it('should NOT enter broken state when parent catches child error', () => {
		const state = reactive({ value: 0 })
		let parentCaught = false

		effect(() => {
			onEffectThrow(() => {
				parentCaught = true
			})

			effect(() => {
				if (state.value === 1) throw new Error('Child error')
			})
		})

		state.value = 1
		expect(parentCaught).toBe(true)

		// System should still work
		state.value = 0
		state.value = 2
	})

	it('should enter broken state on cycle detection (unrecoverable)', () => {
		const state = reactive({ a: 0, b: 0 })

		effect(() => {
			state.b = state.a + 1
		})

		expect(() => {
			effect(() => {
				state.a = state.b + 1
			})
		}).toThrow(/cycle detected/i)

		// System is broken
		expect(() => {
			const s = reactive({ x: 0 })
			effect(() => void s.x)
		}).toThrow(ReactiveError)
	})

	it('should enter broken state on maxEffectChain exceeded', () => {
		options.cycleHandling = 'production'
		options.maxEffectChain = 5

		const state = reactive({ a: 0, b: 0 })

		effect(() => {
			state.b = state.a + 1
		})

		// The second effect's initial run triggers the cycle immediately
		expect(() => {
			effect(() => {
				state.a = state.b + 1
			})
		}).toThrow(/Max effect chain/)

		// System is broken
		expect(() => {
			const s = reactive({ y: 0 })
			effect(() => void s.y)
		}).toThrow(ReactiveError)
	})
})
