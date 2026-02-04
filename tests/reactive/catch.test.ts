import { describe, it, expect } from 'vitest'
import { effect, onEffectThrow, reactive } from 'mutts'
import { forwardThrow } from '../../src/reactive/types'

describe('onEffectThrow', () => {
	it('should catch basic errors', () => {
		const state = reactive({ value: 0 })
		let caught = false
		let errorValue: any = null

		effect(() => {
			onEffectThrow((err) => {
				caught = true
				errorValue = err
			})

			if (state.value === 1) throw new Error('Test error')
		})

		state.value = 1

		expect(caught).toBe(true)
		expect(errorValue?.message).toBe('Test error')
	})

	it('should stop at first successful handler', () => {
		const state = reactive({ value: 0 })
		let handler1 = false
		let handler2 = false

		effect(() => {
			onEffectThrow(() => {
				handler1 = true
				// Success - returns without throwing
			})
			onEffectThrow(() => {
				handler2 = true
				// Should not run
			})

			if (state.value === 1) throw new Error('Test error')
		})

		state.value = 1

		expect(handler1).toBe(true)
		expect(handler2).toBe(false)
	})

	it('should try next handler if first fails', () => {
		const state = reactive({ value: 0 })
		let handler1 = false
		let handler2 = false

		effect(() => {
			onEffectThrow(() => {
				handler1 = true
				throw new Error('Handler 1 failed')
			})
			onEffectThrow(() => {
				handler2 = true
				// Success
			})

			if (state.value === 1) throw new Error('Test error')
		})

		state.value = 1

		expect(handler1).toBe(true)
		expect(handler2).toBe(true)
	})

	it('should propagate to parent when child throws', () => {
		const state = reactive({ value: 0 })
		let parentCaught = false
		let childError: any = null

		effect(() => {
			onEffectThrow((err) => {
				parentCaught = true
				childError = err
			})

			effect(() => {
				if (state.value === 1) throw new Error('Child error')
			})
		})

		state.value = 1

		expect(parentCaught).toBe(true)
		expect(childError?.message).toBe('Child error')
	})

	it('should call cleanup returned from catch handler on effect stop', () => {
		const state = reactive({ value: 0 })
		let cleanupCalled = false
		let catchRan = false

		const stop = effect(() => {
			onEffectThrow(() => {
				catchRan = true
				return () => {
					cleanupCalled = true
				}
			})

			if (state.value === 1) throw new Error('Test error')
		})

		state.value = 1
		expect(catchRan).toBe(true)

		stop()
		expect(cleanupCalled).toBe(true)
	})

	it('should allow effect to continue after catch', () => {
		const state = reactive({ value: 0 })
		let runCount = 0
		let catchCount = 0

		effect(() => {
			onEffectThrow(() => {
				catchCount++
			})

			runCount++
			if (state.value > 0) throw new Error(`Error ${state.value}`)
		})

		state.value = 1 // Throws
		state.value = 2 // Should re-run and throw again
		state.value = 0 // Should re-run successfully

		expect(runCount).toBe(4)
		expect(catchCount).toBe(2)
	})

	it('should propagate uncaught errors to root', () => {
		const state = reactive({ value: 0 })

		effect(() => {
			effect(() => {
				if (state.value === 1) throw new Error('Uncaught')
			})
		})

		expect(() => {
			state.value = 1
		}).toThrow('Uncaught')
	})
})
