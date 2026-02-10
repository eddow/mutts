import { describe, it, expect, afterEach } from 'vitest'
import { effect, memoize, onEffectThrow, reactive, reset } from 'mutts'
import { ReactiveError, ReactiveErrorCode } from '../../src/reactive/types'

afterEach(() => {
	reset()
})

/* TODO:
The async effect tests are expecting promise rejections to be caught by onEffectThrow, but looking at the implementation, the runningPromise is created but not actually awaited or have its rejection handled. The promise rejections won't automatically trigger the error handlers.

Issues I found:

Async Error Tests: The tests expect promise rejections to be caught by onEffectThrow, but the implementation doesn't attach a .catch() handler to the runningPromise. Promise rejections in async effects are not automatically propagated to the error handlers.
Cleanup Error Test: The test expects cleanup errors to be handled gracefully, but cleanup functions are called in an untracked() block which might not have the same error handling context.
Before I suggest corrections, could you clarify:

Should async effect promise rejections be caught by onEffectThrow? (This would require implementation changes)
Or should the tests be written to expect that promise rejections are NOT caught by onEffectThrow?
For cleanup errors, should they be silently ignored or should they have their own error handling mechanism?
The current implementation suggests that async effects create promises but don't handle their rejections through the error propagation system.
*/
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

describe('Error Propagation - Additional Tests', () => {
	describe('Async Effect Errors', () => {
		it('should catch promise rejections in onEffectThrow', async () => {
			const state = reactive({ shouldReject: false })
			let caughtError: any = null
			let effectRan = false

			effect(() => {
				onEffectThrow((err) => {
					caughtError = err
				})

				effectRan = true
				return new Promise((resolve, reject) => {
					if (state.shouldReject) {
						reject(new Error('Async rejection'))
					} else {
						resolve(undefined)
					}
				})
			})

			// Initial run should succeed
			expect(effectRan).toBe(true)
			expect(caughtError).toBe(null)

			// Trigger rejection
			state.shouldReject = true
			
			// Wait for promise to reject
			await new Promise(resolve => setTimeout(resolve, 10))
			
			expect(caughtError).toBeInstanceOf(Error)
			expect(caughtError.message).toBe('Async rejection')
		})

		it('should propagate async errors to parent effects', async () => {
			const state = reactive({ shouldReject: false })
			let parentCaughtError: any = null

			effect(() => {
				onEffectThrow((err) => {
					parentCaughtError = err
				})

				effect(() => {
					return new Promise((resolve, reject) => {
						if (state.shouldReject) {
							reject(new Error('Child async error'))
						} else {
							resolve(undefined)
						}
					})
				})
			})

			state.shouldReject = true
			await new Promise(resolve => setTimeout(resolve, 10))

			expect(parentCaughtError).toBeInstanceOf(Error)
			expect(parentCaughtError.message).toBe('Child async error')
		})
	})

	describe('Memoize Error Handling', () => {
		it('should propagate errors from memoized computations', () => {
			const state = reactive({ value: 1 })
			let caughtError: any = null

			const memoized = memoize(() => {
				if (state.value === 2) {
					throw new Error('Memoize error')
				}
				return state.value * 2
			})

			effect(() => {
				onEffectThrow((err) => {
					caughtError = err
				})
				memoized()
			})

			expect(caughtError).toBe(null)

			state.value = 2
			expect(caughtError).toBeInstanceOf(Error)
			expect(caughtError.message).toBe('Memoize error')
		})

		it('should handle errors in memoized dependencies', () => {
			const state = reactive({ value: 1 })
			let caughtError: any = null

			const memoized1 = memoize(() => {
				if (state.value === 2) {
					throw new Error('Dependency error')
				}
				return state.value
			})

			const memoized2 = memoize(() => {
				return memoized1() * 2
			})

			effect(() => {
				onEffectThrow((err) => {
					caughtError = err
				})
				memoized2()
			})

			state.value = 2
			expect(caughtError).toBeInstanceOf(Error)
			expect(caughtError.message).toBe('Dependency error')
		})
	})

	describe('Project Error Handling', () => {
		it('should handle errors in projection callbacks', () => {
			const source = reactive({ items: [1, 3, 4] })
			const target = reactive({ results: [] as number[] })
			let caughtError: any = null

			effect(() => {
				onEffectThrow((err) => {
					caughtError = err
				})
				
				target.results = []
				for (const item of source.items) {
					if (item === 2) {
						throw new Error('Projection error')
					}
					target.results.push(item * 2)
				}
			})

			expect(caughtError).toBe(null)

			source.items = [1, 2, 3, 4]
			expect(caughtError).toBeInstanceOf(Error)
			expect(caughtError.message).toBe('Projection error')
		})
	})

	describe('Error Recovery Patterns', () => {
		it('should allow effect to continue after handling error', () => {
			const state = reactive({ value: 0, attempts: 0 })
			const results: string[] = []

			effect(() => {
				onEffectThrow((err) => {
					results.push(`caught: ${err.message}`)
					state.attempts++
					if (state.attempts >= 3) {
						state.value = 99 // Success condition
					}
				})

				if (state.value === 99) {
					results.push('success')
					return
				}

				results.push(`trying: ${state.value}`)
				
				if (state.value > 0 && state.value < 99) {
					throw new Error(`Attempt ${state.value} failed`)
				}

				results.push('null')
			})

			expect(results).toEqual(['trying: 0', 'null'])

			state.value = 1
			expect(results).toEqual(['trying: 0', 'null', 'trying: 1', 'caught: Attempt 1 failed'])

			state.value = 2
			expect(results).toEqual(['trying: 0', 'null', 'trying: 1', 'caught: Attempt 1 failed', 'trying: 2', 'caught: Attempt 2 failed'])

			state.value = 99
			expect(results).toEqual(['trying: 0', 'null', 'trying: 1', 'caught: Attempt 1 failed', 'trying: 2', 'caught: Attempt 2 failed', 'success'])
		})

		it('should handle cleanup errors gracefully', () => {
			const state = reactive({ value: 0 })
			let caughtError: any = null
			let cleanupCalled = false

			const stop = effect(() => {
				onEffectThrow((err) => {
					caughtError = err
				})

				return () => {
					cleanupCalled = true
					throw new Error('Cleanup error')
				}
			})

			// Trigger effect to run
			state.value = 1

			// Stop effect - should handle cleanup error
			expect(() => stop()).not.toThrow()
			
			// Cleanup should have been called
			expect(cleanupCalled).toBe(true)
			// Error should not propagate out of stop
			expect(caughtError).toBe(null)
		})
	})

	describe('Structured Error Codes', () => {
		it('should provide ReactiveError with proper error codes', () => {
			const state = reactive({ a: 0, b: 0 })
			let caughtError: any = null

			// Create a cycle to trigger CycleDetected error
			effect(() => {
				onEffectThrow((err) => {
					caughtError = err
				})
				
				if (state.a === 1) {
					state.b = 1
				}
			})

			effect(() => {
				if (state.b === 1) {
					state.a = 2
				}
			})

			expect(() => {
				state.a = 1
			}).toThrow(ReactiveError)

			// Reset broken state, recreate the cycle, then verify error codes
			reset()

			const state2 = reactive({ a: 0, b: 0 })
			effect(() => {
				if (state2.a === 1) {
					state2.b = 1
				}
			})
			effect(() => {
				if (state2.b === 1) {
					state2.a = 2
				}
			})

			try {
				state2.a = 1
			} catch (e: any) {
				expect(e).toBeInstanceOf(ReactiveError)
				expect(e.code).toBe(ReactiveErrorCode.CycleDetected)
				expect(e.debugInfo).toBeDefined()
				expect(e.debugInfo.code).toBe(ReactiveErrorCode.CycleDetected)
			}
		})
	})
})
