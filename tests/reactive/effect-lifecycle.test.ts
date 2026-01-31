import { effect, reactive } from 'mutts'

describe('effect reaction result', () => {
	it('should support recording the computed result each run (via effect return cleanup)', () => {
		const state = reactive({ a: 1, b: 2 })

		const received: number[] = []
		const stop = effect(() => {
			const sum = state.a + state.b
			received.push(sum)
			return () => {}
		})

		// initial run
		expect(received).toEqual([3])

		// update triggers rerun and new result
		state.a = 5
		expect(received).toEqual([3, 7])

		// another update
		state.b = 10
		expect(received).toEqual([3, 7, 15])

		stop()
	})
})

describe('effect cleanup timing', () => {
	it('should run previous cleanup before the next execution', () => {
		const state = reactive({ v: 1 })

		const calls: string[] = []
		effect(() => {
			calls.push(`run:${state.v}`)
			return () => calls.push(`cleanup:${state.v}`)
		})

		// initial
		expect(calls).toEqual(['run:1'])

		state.v = 2
		// cleanup for previous run must happen before new run is recorded
		// cleanup logs the current value at cleanup time (already updated)
		expect(calls).toEqual(['run:1', 'cleanup:2', 'run:2'])

		state.v = 3
		expect(calls).toEqual(['run:1', 'cleanup:2', 'run:2', 'cleanup:3', 'run:3'])
	})
})

describe('automatic effect cleanup', () => {
	function tick(ms: number = 100) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
// TODO: Make sure gc is tested at least on one side (node I guess)
	// const gc = typeof globalThis.gc === 'function' ? globalThis.gc : undefined
    const itGarbageCollection = typeof globalThis.gc === 'function' ? it : it.skip

	async function collectGarbages() {
		await tick()
		globalThis.gc?.()
		await tick()
	}

	describe('parent-child effect cleanup', () => {
		it('should automatically clean up child effects when parent is cleaned up', () => {
			const state = reactive({ a: 1, b: 2 })
			const cleanupCalls: string[] = []

			const stopParent = effect(() => {
				state.a

				// Create child effect
				effect(() => {
					state.b
					return () => cleanupCalls.push('child cleanup')
				})

				return () => cleanupCalls.push('parent cleanup')
			})

			expect(cleanupCalls).toEqual([])

			// Stop parent effect - should clean up both parent and child
			stopParent()
			expect(cleanupCalls).toEqual(['parent cleanup', 'child cleanup'])
		})

		it('should clean up all nested child effects when parent is cleaned up', () => {
			const state = reactive({ a: 1, b: 2, c: 3 })
			const cleanupCalls: string[] = []

			const stopParent = effect(() => {
				state.a

				// Create child effect
				effect(() => {
					state.b

					// Create grandchild effect
					effect(() => {
						state.c
						return () => cleanupCalls.push('grandchild cleanup')
					})

					return () => cleanupCalls.push('child cleanup')
				})

				return () => cleanupCalls.push('parent cleanup')
			})

			expect(cleanupCalls).toEqual([])

			// Stop parent effect - should clean up all nested effects
			stopParent()
			expect(cleanupCalls).toEqual(['parent cleanup', 'child cleanup', 'grandchild cleanup'])
		})

		it('should allow child effects to be cleaned up independently', () => {
			const state = reactive({ a: 1, b: 2 })
			const cleanupCalls: string[] = []

			const stopParent = effect(() => {
				state.a

				// Create child effect and store its cleanup
				const stopChild = effect(() => {
					state.b
					return () => cleanupCalls.push('child cleanup')
				})

				// Clean up child independently
				stopChild()

				return () => cleanupCalls.push('parent cleanup')
			})

			expect(cleanupCalls).toEqual(['child cleanup'])

			// Stop parent effect - should only clean up parent
			stopParent()
			expect(cleanupCalls).toEqual(['child cleanup', 'parent cleanup'])
		})

		it('should clean up multiple child effects when parent is cleaned up', () => {
			const state = reactive({ a: 1, b: 2, c: 3 })
			const cleanupCalls: string[] = []

			const stopParent = effect(() => {
				state.a

				// Create multiple child effects
				effect(() => {
					state.b
					return () => cleanupCalls.push('child1 cleanup')
				})

				effect(() => {
					state.c
					return () => cleanupCalls.push('child2 cleanup')
				})

				return () => cleanupCalls.push('parent cleanup')
			})

			expect(cleanupCalls).toEqual([])

			// Stop parent effect - should clean up all children and parent
			stopParent()
			expect(cleanupCalls).toEqual(['parent cleanup', 'child1 cleanup', 'child2 cleanup'])
		})
	})

	describe('garbage collection cleanup', () => {
		itGarbageCollection('should clean up unreferenced top-level effects via GC', async () => {
			const state = reactive({ value: 1 })
			let cleanupCalled = false

			// Create effect in a scope that will be garbage collected
			;(() => {
				const _x = effect(() => {
					state.value
					return () => {
						cleanupCalled = true
					}
				})
			})()

			expect(cleanupCalled).toBe(false)

			// Force garbage collection
			await collectGarbages()
			expect(cleanupCalled).toBe(true)
		})

		itGarbageCollection('should clean up parent and child effects when both are unreferenced', async () => {
			const state = reactive({ a: 1, b: 2 })
			const cleanupCalls: string[] = []

			// Create parent effect that creates a child, both unreferenced
			;(() => {
				effect(() => {
					state.a

					// Create child effect
					effect(() => {
						state.b
						return () => cleanupCalls.push('child cleanup')
					})

					return () => cleanupCalls.push('parent cleanup')
				})
			})()

			expect(cleanupCalls).toEqual([])

			// Force garbage collection
			await collectGarbages()

			// Both parent and child should be cleaned up
			expect(cleanupCalls).toContain('parent cleanup')
			expect(cleanupCalls).toContain('child cleanup')
			expect(cleanupCalls).toHaveLength(2)
		})

		itGarbageCollection('should clean up orphaned child effects when parent is unreferenced', async () => {
			const state = reactive({ a: 1, b: 2 })
			const cleanupCalls: string[] = []

			// Create parent effect that creates a child, both unreferenced
			;(() => {
				effect(() => {
					state.a

					// Create child effect
					effect(() => {
						state.b
						return () => cleanupCalls.push('child cleanup')
					})

					return () => cleanupCalls.push('parent cleanup')
				})
			})()

			expect(cleanupCalls).toEqual([])

			// Force garbage collection - both should be cleaned up
			await collectGarbages()

			expect(cleanupCalls).toContain('parent cleanup')
			expect(cleanupCalls).toContain('child cleanup')
			expect(cleanupCalls).toHaveLength(2)
		})

		itGarbageCollection('should handle child effect referenced but parent unreferenced', async () => {
			const state = reactive({ a: 1, b: 2 })
			const cleanupCalls: string[] = []

			// Create parent effect that creates a child, but only keep reference to child
			let stopChild: (() => void) | undefined
			const createParentWithChild = () => {
				effect(() => {
					state.a

					// Create child effect and store itGarbageCollections cleanup function
					stopChild = effect(() => {
						state.b
						return () => cleanupCalls.push('child cleanup')
					})
				})
			}

			createParentWithChild()

			expect(cleanupCalls).toEqual([])
			expect(stopChild).toBeDefined()

			// Force garbage collection - parent should be cleaned up, child should remain
			await collectGarbages()

			// Explicitly clean up child if it's still alive
			if (stopChild) {
				stopChild()
				expect(cleanupCalls).toContain('child cleanup')
			}
		})

		it('should handle mixed explicit and GC cleanup', () => {
			const state = reactive({ a: 1, b: 2, c: 3 })
			const cleanupCalls: string[] = []

			// Create parent effect
			const stopParent = effect(() => {
				state.a

				// Create child that will be explicitly cleaned up
				const stopChild = effect(() => {
					state.b
					return () => cleanupCalls.push('explicit child cleanup')
				})

				// Create child that will be GC cleaned up
				effect(() => {
					state.c
					return () => cleanupCalls.push('gc child cleanup')
				})

				// Explicitly clean up first child
				stopChild()

				return () => cleanupCalls.push('parent cleanup')
			})

			expect(cleanupCalls).toEqual(['explicit child cleanup'])

			// Stop parent - should clean up parent and all remaining children
			stopParent()
			expect(cleanupCalls).toEqual(['explicit child cleanup', 'parent cleanup', 'gc child cleanup'])
		})
	})

	describe('cleanup behavior documentation', () => {
		it('should demonstrate that cleanup is optional but recommended for side effects', () => {
			const state = reactive({ value: 1 })
			let sideEffectExecuted = false

			// Effect with side effect that should be cleaned up
			const stopEffect = effect(() => {
				state.value

				// Simulate side effect (e.g., DOM manipulation, timers, etc.)
				const intervalId = setInterval(() => {
					sideEffectExecuted = true
				}, 100)

				// Return cleanup function to prevent memory leaks
				return () => {
					clearInterval(intervalId)
				}
			})

			// Effect is running, side effect should be active
			expect(sideEffectExecuted).toBe(false)

			// Stop effect - cleanup should be called
			stopEffect()

			// Wait a bit to ensure interval would have fired
			setTimeout(() => {
				expect(sideEffectExecuted).toBe(false) // Should still be false due to cleanup
			}, 150)
		})

		it('should show that effects can be stored and remembered for later cleanup', () => {
			const state = reactive({ value: 1 })
			const activeEffects: (() => void)[] = []
			const cleanupCalls: string[] = []

			// Create multiple effects and store their cleanup functions
			for (let i = 0; i < 3; i++) {
				const stopEffect = effect(() => {
					state.value
					return () => cleanupCalls.push(`effect ${i} cleanup`)
				})
				activeEffects.push(stopEffect)
			}

			expect(cleanupCalls).toEqual([])

			// Clean up all effects at once
			activeEffects.forEach((stop) => stop())

			expect(cleanupCalls).toHaveLength(3)
			expect(cleanupCalls).toContain('effect 0 cleanup')
			expect(cleanupCalls).toContain('effect 1 cleanup')
			expect(cleanupCalls).toContain('effect 2 cleanup')
		})
	})
})
