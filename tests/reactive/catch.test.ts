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

describe('onEffectThrow - zone re-entry bug', () => {
	it('should handle child throwing during parent first run without zone re-entry error', () => {
		const state = reactive({ triggerError: false })
		let parentCaught = false
		let parentRunCount = 0

		const stop = effect(() => {
			parentRunCount++
			
			onEffectThrow((err) => {
				parentCaught = true
				console.log('Parent caught:', err.message)
			})
			void state.triggerError
			// Child effect created synchronously during parent execution
			effect(() => {
				if (state.triggerError) {
					throw new Error('Child error on first run')
				}
			})
		})

		// First run: parent runs, child created and runs successfully
		expect(parentRunCount).toBe(1)
		expect(parentCaught).toBe(false)

		// Trigger child to throw - this should propagate to parent
		state.triggerError = true
		expect(parentCaught).toBe(true)
		expect(parentRunCount).toBe(2)

		// This should work without "ZoneHistory: re-entering historical zone" error
		state.triggerError = false
		expect(parentRunCount).toBe(3)

		stop()
	})

	it('should handle child throwing on first run during parent first run', () => {
		let parentCaught = false
		let errorMessage = ''

		const stop = effect(() => {
			onEffectThrow((err) => {
				parentCaught = true
				errorMessage = err.message
			})

			// Child throws immediately on first run
			effect(() => {
				throw new Error('Child throws on first run')
			})
		})

		expect(parentCaught).toBe(true)
		expect(errorMessage).toBe('Child throws on first run')

		stop()
	})

	it('should handle multiple child effects throwing during parent execution', () => {
		const state = reactive({ value: 0 })
		let parentCaughtCount = 0
		const errors: string[] = []

		const stop = effect(() => {
			onEffectThrow((err) => {
				parentCaughtCount++
				errors.push(err.message)
			})

			// Multiple children created during parent execution
			effect(() => {
				if (state.value === 1) throw new Error('Child 1 error')
			})

			effect(() => {
				if (state.value === 1) throw new Error('Child 2 error')
			})
		})

		state.value = 1

		// Both children should throw and parent should catch both
		expect(parentCaughtCount).toBe(2)
		expect(errors).toContain('Child 1 error')
		expect(errors).toContain('Child 2 error')

		// Parent should be able to re-run without zone re-entry error
		state.value = 2
		state.value = 0

		stop()
	})

	it('should handle nested parent-child-grandchild error propagation', () => {
		const state = reactive({ value: 0 })
		let parentCaught = false
		let childCaught = false

		const stop = effect(() => {
			onEffectThrow((err) => {
				parentCaught = true
			})

			effect(() => {
				onEffectThrow((err) => {
					childCaught = true
					// Re-throw to propagate to parent
					throw err
				})

				effect(() => {
					if (state.value === 1) throw new Error('Grandchild error')
				})
			})
		})

		state.value = 1

		expect(childCaught).toBe(true)
		expect(parentCaught).toBe(true)

		// Should be able to re-run without zone issues
		state.value = 0
		state.value = 2

		stop()
	})

	it('should handle parent catching error then setting reactive state', () => {
		const state = reactive({ triggerError: false })
		const errorState = reactive({ hasError: false, message: '' })
		let parentRunCount = 0

		const stop = effect(() => {
			parentRunCount++
			
			onEffectThrow((err) => {
				// Setting reactive state in catch handler
				errorState.hasError = true
				errorState.message = err.message
			})
			void state.triggerError
			effect(() => {
				if (state.triggerError) {
					throw new Error('Child error')
				}
			})
		})

		expect(parentRunCount).toBe(1)
		expect(errorState.hasError).toBe(false)

		// Trigger error - parent catches and sets reactive state
		state.triggerError = true
		expect(errorState.hasError).toBe(true)
		expect(errorState.message).toBe('Child error')

		// Parent should be able to re-run
		state.triggerError = false
		expect(parentRunCount).toBeGreaterThan(2)

		stop()
	})
})
