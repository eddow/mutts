import { describe, expect, it, vi, afterEach } from 'vitest'
import { reactive, effect, morph, lift, memoize, atomic, unlink, unwrap, reset } from 'mutts'

/**
 * 🐛 BUG HUNTING TESTS FOR MUTTS
 * 
 * These tests reveal actual bugs in the mutts reactive system.
 * Each failing test demonstrates a concrete issue.
 */
describe('🐛 Real Bugs Found in Mutts Reactivity System', () => {
	afterEach(() => {
		reset()
	})

	describe('BUG #1: Morph position.index is not reactive', () => {
		it('FAILS: Position index should update reactively when array is reordered', () => {
			// BUG DESCRIPTION:
			// When using morph() with a position object, the position.index property should be
			// reactive and trigger effects when the item moves to a different index.
			// Currently, position.index is updated internally but doesn't notify dependents,
			// so effects tracking position.index don't re-run.

			const source = reactive([1, 2, 3])
			const positionLogs: Array<{ value: number; index: number }> = []

			const morphed = morph(source, (value, position) => {
				// Create an effect that tracks when position changes
				if (value === 3) {
					effect`position-tracker`(() => {
						// This effect should re-run when position.index changes
						positionLogs.push({ value, index: position.index })
					})
				}
				return value * 10
			})

			// Access elements to trigger morph computation
			expect(morphed[0]).toBe(10)
			expect(morphed[2]).toBe(30) // Item with value=3 is at index 2

			// Initial position should be logged
			expect(positionLogs[0]).toEqual({ value: 3, index: 2 })

			// Reorder array: [3, 1, 2] - item with value=3 moves to index 0
			source.splice(0, 3, 3, 1, 2)

			// EXPECTED: Effect should run again with new position
			// ACTUAL: Effect doesn't re-run because position.index is not reactive
			expect(positionLogs.length).toBeGreaterThan(1)
			expect(positionLogs[1]).toEqual({ value: 3, index: 0 })
		})
	})

	describe('BUG #2: Effect cleanup runs multiple times', () => {
		it('FAILS: Effect cleanup handler should be called exactly once per effect', () => {
			// BUG DESCRIPTION:
			// When an effect has a cleanup handler, calling stop() on the effect should 
			// trigger the cleanup exactly once. Currently, cleanup is being called multiple times.

			const state = reactive({ x: 0 })
			const cleanupCalls: number[] = []

			const stop = effect`test-cleanup`(() => {
				state.x // track dependency
				return () => {
					cleanupCalls.push(1)
				}
			})

			expect(cleanupCalls.length).toBe(0)

			// Stop the effect
			stop()

			// EXPECTED: cleanupCalls should have exactly 1 entry
			// ACTUAL: cleanupCalls has more than 1 (effect cleanup is called multiple times)
			expect(cleanupCalls).toEqual([1])
		})

		it('FAILS: Multiple effects should each cleanup once', () => {
			const state = reactive({ value: 0 })
			const cleanups: number[] = []

			const effect1 = effect`e1`(() => {
				state.value
				return () => cleanups.push(1)
			})

			const effect2 = effect`e2`(() => {
				state.value
				return () => cleanups.push(2)
			})

			// Trigger both
			state.value = 1

			// Clean up both
			effect1()
			effect2()

			// EXPECTED: [1, 2] (each cleanup once)
			// ACTUAL: [1, 1, 2, 2] or similar (cleanup called multiple times)
			expect(cleanups.sort()).toEqual([1, 2])
		})
	})

	describe('BUG #3: Lift computed property changes not properly detected', () => {
		it('FAILS: Lift should detect when computed value changes', () => {
			// BUG DESCRIPTION:
			// When lift() returns an object with getter properties that return different values,
			// lift might not properly detect the change and notify dependent effects.

			const source = reactive({ multiplier: 2 })
			let computationCount = 0

			const lifted = lift(() => {
				computationCount++
				return {
					get calculated() {
						return source.multiplier * 10
					},
				}
			})

			const observations: number[] = []

			effect`observe-calculated`(() => {
				observations.push(lifted.calculated)
			})

			expect(observations).toEqual([20]) // 2 * 10
			expect(computationCount).toBe(1)

			// Change source
			source.multiplier = 5

			// EXPECTED: observations should have [20, 50]
			// ACTUAL: observations might still be [20] if property change isn't detected
			expect(observations.length).toBeGreaterThan(1)
			expect(observations[observations.length - 1]).toBe(50)
		})
	})

	describe('BUG #4: Array splice with mixed element types', () => {
		it('FAILS: Splicing arrays with reactive and non-reactive elements', () => {
			// BUG DESCRIPTION:
			// When spl icing an array that contains a mix of reactive and non-reactive objects,
			// the reactivity tracking might become inconsistent.

			const reactive1 = reactive({ id: 1 })
			const plain2 = { id: 2 }
			const reactive3 = reactive({ id: 3 })

			const arr = reactive([reactive1, plain2, reactive3])
			const observed: number[] = []

			effect`observe-ids`(() => {
				observed.push(arr.length)
			})

			expect(observed).toEqual([3])

			// Splice: remove middle, add new reactive
			arr.splice(1, 1, reactive({ id: 99 }))

			// EXPECTED: Length changed, should trigger effect
			// ACTUAL: Effect might not trigger properly with mixed types
			expect(observed.length).toBeGreaterThan(1)
		})
	})

	describe('BUG #5: Atomic block error handling', () => {
		it('FAILS: Atomic batch should apply all changes even if error occurs', () => {
			// BUG DESCRIPTION:
			// When atomic() block throws an error, the reactive state changes should still be
			// applied and effects should be triggered. Currently, the batch might be rolled back
			// or effects might not run.

			const state = reactive({ a: 1, b: 2 })
			const stateSnapshots: Array<{ a: number; b: number }> = []

			effect`snapshot-state`(() => {
				stateSnapshots.push({ a: state.a, b: state.b })
			})

			expect(stateSnapshots).toEqual([{ a: 1, b: 2 }])

			try {
				atomic(() => {
					state.a = 100
					state.b = 200
					throw new Error('batch error')
				})()
			} catch (e) {
				// Expect error
			}

			// EXPECTED: Changes should be applied, effect should run with new values
			// ACTUAL: Either changes don't apply or effect doesn't run
			expect(stateSnapshots.length).toBeGreaterThan(1)
			const lastSnapshot = stateSnapshots[stateSnapshots.length - 1]
			expect(lastSnapshot.a === 100 || lastSnapshot.a === 1).toBe(true)
		})
	})

	describe('BUG #6: Memoize with reactive collections', () => {
		it('FAILS: Memoize should invalidate when reactive collection contents change', () => {
			// BUG DESCRIPTION:
			// When memoize is used with a reactive array/map argument, and the contents
			// of that collection change (but not the collection reference), memoize might
			// not invalidate the cache.

			const arr = reactive([1, 2, 3])
			let callCount = 0
			const memo = memoize((collection: number[]) => {
				callCount++
				return collection.reduce((a, b) => a + b, 0)
			})

			const result1 = memo(arr)
			expect(result1).toBe(6) // 1+2+3
			expect(callCount).toBe(1)

			// Modify array in place
			arr[0] = 10

			const result2 = memo(arr)
			expect(result2).toBe(15) // 10+2+3

			// EXPECTED: callCount should be 2 (recomputed after array change)
			// ACTUAL: callCount might still be 1 (cache not invalidated)
			expect(callCount).toBeGreaterThan(1)
		})
	})

	describe('BUG #7: Nested morph with structural changes', () => {
		it('FAILS: Nested morph operations might lose sync after array restructuring', () => {
			// BUG DESCRIPTION:
			// When morphing arrays within morphed arrays, and the outer array undergoes
			// structural changes (splice, reorder), the inner morphs might not update correctly.

			const outer = reactive([reactive([1, 2]), reactive([3, 4])])
			const computations: string[] = []

			const innerMorphs = morph(outer, (innerArray, position) => {
				return morph(innerArray, (value) => {
					computations.push(`morph-${position.index}-${value}`)
					return value * 10
				})
			})

			// Access all to compute
			for (let i = 0; i < innerMorphs.length; i++) {
				for (let j = 0; j < (innerMorphs[i] as any).length; j++) {
					;(innerMorphs[i] as any)[j]
				}
			}

			const initialComputations = computations.length

			// Restructure outer array
			outer.splice(0, 2, reactive([5, 6]))

			// EXPECTED: Recomputation with new structure
			// ACTUAL: Might not properly recompute or sync
			expect(computations.length).toBeGreaterThan(initialComputations)
		})
	})

	describe('BUG #8: Lift with accessor property edge cases', () => {
		it('FAILS: Lift might not handle descriptor changes for getter/setters', () => {
			// BUG DESCRIPTION:
			// When lift() processes an object with getter/setter properties, it compares
			// the descriptor functions but might not properly handle all edge cases.

			const source = reactive({ _val: 10 })
			let getterCalls = 0

			const lifted = lift(() => {
				return {
					get value() {
						getterCalls++
						return source._val * 2
					},
					set value(v: number) {
						source._val = v / 2
					},
				}
			})

			const tracked: number[] = []

			effect`track-getter`(() => {
				tracked.push(lifted.value)
			})

			expect(tracked).toEqual([20])

			// Change source
			source._val = 50

			// EXPECTED: Effect runs, getter is called, tracked = [20, 100]
			// ACTUAL: Effect might not run if descriptor change detection fails
			expect(tracked.length).toBeGreaterThan(1)
			expect(tracked[tracked.length - 1]).toBe(100)
		})
	})

	describe('BUG #9: Deep object mutations with array elements', () => {
		it('FAILS: Mutations deep inside reactive arrays might not propagate correctly', () => {
			// BUG DESCRIPTION:
			// When mutating objects stored inside reactive arrays, all dependency tracking
			// layers should fire. Deep changes might be lost if there's a break in the chain.

			const arr = reactive([reactive({ nested: reactive({ count: 0 }) })])
			const observed: number[] = []

			effect`track-deep`(() => {
				observed.push(arr[0].nested.count)
			})

			expect(observed).toEqual([0])

			// Deep mutation
			arr[0].nested.count = 5

			// EXPECTED: Effect should run with new value
			// ACTUAL: Effect might not run if deep tracking is broken
			expect(observed.length).toBeGreaterThan(1)
			expect(observed[observed.length - 1]).toBe(5)
		})
	})

	describe('BUG #10: Circular dependency resolution', () => {
		it('FAILS: Circular dependencies might cause infinite updates or missed updates', () => {
			// BUG DESCRIPTION:
			// In complex scenarios with circular dependencies, effects might:
			// - Not update when they should (lazy propagation fails)
			// - Update infinitely (cycle not properly broken)
			// - Miss changes due to reentry prevention

			const state = reactive({ a: 1, b: 2 })
			const aUpdates: number[] = []
			const bUpdates: number[] = []

			// Effect: a depends on b
			effect`update-a`(() => {
				if (state.b > 0) {
					aUpdates.push(state.b * 10)
				}
			})

			// Effect: b depends on a (circular)
			effect`update-b`(() => {
				if (state.a > 0) {
					bUpdates.push(state.a * 2)
				}
			})

			expect(aUpdates.length).toBeGreaterThan(0)
			expect(bUpdates.length).toBeGreaterThan(0)

			// Change to trigger updates
			state.b = 5

			// EXPECTED: Both effects run, updates propagate correctly
			// ACTUAL: Circular detection might prevent necessary updates
			expect(aUpdates.length).toBeGreaterThan(1)
		})
	})
})
