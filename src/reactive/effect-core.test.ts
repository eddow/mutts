import { effect, reactive, untracked } from './index'

describe('effect', () => {
	describe('basic effect functionality', () => {
		it('should run effect immediately', () => {
			let count = 0
			const reactiveObj = reactive({ value: 0 })

			effect(() => {
				count++
				reactiveObj.value
			})

			expect(count).toBe(1)
		})

		it('should track dependencies', () => {
			let effectCount = 0
			const reactiveObj = reactive({ count: 0 })

			effect(() => {
				effectCount++
				reactiveObj.count
			})

			expect(effectCount).toBe(1)

			reactiveObj.count = 5
			expect(effectCount).toBe(2)
		})

		it('should only track accessed properties', () => {
			let effectCount = 0
			const reactiveObj = reactive({ count: 0, name: 'test' })

			effect(() => {
				effectCount++
				reactiveObj.count // Only access count
			})

			expect(effectCount).toBe(1)

			reactiveObj.name = 'new name' // Change name
			expect(effectCount).toBe(1) // Should not trigger effect

			reactiveObj.count = 5 // Change count
			expect(effectCount).toBe(2) // Should trigger effect
		})
	})

	describe('cascading effects', () => {
		it('should properly handle cascading effects', () => {
			const reactiveObj = reactive({ a: 0, b: 0, c: 0 })

			effect(() => {
				reactiveObj.b = reactiveObj.a + 1
			})
			effect(() => {
				reactiveObj.c = reactiveObj.b + 1
			})

			expect(reactiveObj.a).toBe(0)
			expect(reactiveObj.b).toBe(1)
			expect(reactiveObj.c).toBe(2)

			reactiveObj.b = 5
			expect(reactiveObj.a).toBe(0)
			expect(reactiveObj.b).toBe(5)
			expect(reactiveObj.c).toBe(6)

			reactiveObj.a = 3
			expect(reactiveObj.a).toBe(3)
			expect(reactiveObj.b).toBe(4)
			expect(reactiveObj.c).toBe(5)
		})

		it('should allow re-entrant effects (create inner effect inside outer via untracked)', () => {
			const state = reactive({ a: 0, b: 0 })
			let outerRuns = 0
			let innerRuns = 0

			const stopOuter = effect(() => {
				outerRuns++
				state.a
				// Create/refresh inner effect each time outer runs (re-entrancy)
				// Use untracked to avoid nested-effect guard and dependency coupling
				let stopInner: (() => void) | undefined
				untracked(() => {
					stopInner = effect(() => {
						innerRuns++
						state.b
					})
				})

				state.b = state.a

				// Clean up previous inner effect when outer re-runs
				return () => stopInner?.()
			})

			expect(outerRuns).toBe(1)
			expect(innerRuns).toBe(1)

			state.a = 1
			expect(outerRuns).toBe(2)
			expect(innerRuns).toBe(3)

			state.b = 2
			expect(outerRuns).toBe(2)
			expect(innerRuns).toBe(4)

			// Stop outer effect
			stopOuter()
			state.a = 3
			state.b = 3
			expect(outerRuns).toBe(2)
			expect(innerRuns).toBe(4)
		})
	})

	describe('effect cleanup', () => {
		it('should return unwatch function', () => {
			const reactiveObj = reactive({ count: 0 })
			let effectCount = 0

			const stop = effect(() => {
				effectCount++
				reactiveObj.count
			})

			expect(effectCount).toBe(1)

			reactiveObj.count = 5
			expect(effectCount).toBe(2)

			stop()
			reactiveObj.count = 10
			expect(effectCount).toBe(2)
		})

		it('should stop tracking when unwatched', () => {
			const reactiveObj = reactive({ count: 0 })
			let effectCount = 0

			const stop = effect(() => {
				effectCount++
				reactiveObj.count
			})

			reactiveObj.count = 5
			expect(effectCount).toBe(2)

			stop()
			reactiveObj.count = 10
			expect(effectCount).toBe(2)
		})

		it('should clean up dependencies on re-run', () => {
			const state = reactive({ a: true, b: 0, c: 0 })
			let effectCount = 0

			const stop = effect(() => {
				effectCount++
				if (state.a) state.b
				else state.c
			})

			expect(effectCount).toBe(1)

			state.a = false
			expect(effectCount).toBe(2)

			state.b = 1
			expect(effectCount).toBe(2)

			state.c = 1
			expect(effectCount).toBe(3)

			stop()
		})
	})
})
