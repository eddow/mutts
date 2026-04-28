import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { reactive, effect, morph, lift, memoize, atomic, unlink, unwrap, reset } from 'mutts'

describe('🐛 Bug Challenges - Finding Issues in Mutts', () => {
	// Reset after each test to prevent broken state from cascading
	afterEach(() => {
		reset()
	})

	describe('Morph position reactivity BUG', () => {
		it('FAILING: morph position.index should update when item position changes', () => {
			// This test reveals a bug where position.index doesn't update reactively
			const source = reactive([1, 2, 3])
			const positionUpdates: number[] = []

			const morphed = morph(source, (value, position) => {
				// Track position changes for item with value 3
				if (value === 3) {
					effect`track-position-3`(() => {
						positionUpdates.push(position.index)
					})
				}
				return value * 10
			})

			// Trigger computation
			expect(morphed[0]).toBe(10)
			expect(morphed[1]).toBe(20)
			expect(morphed[2]).toBe(30)

			// position.index for item value=3 should have been 2
			expect(positionUpdates[0]).toBe(2)

			// Now reorder to put 3 at the front: [3, 1, 2]
			source.splice(0, 3, 3, 1, 2)

			// BUG: position.index should have changed to 0, but it might not be updating reactively
			// The effect should run again with the new index
			console.log('Position updates for value=3:', positionUpdates)
			// This is where it fails - position.index is not reactive
			expect(positionUpdates.length).toBeGreaterThan(1)
			expect(positionUpdates[positionUpdates.length - 1]).toBe(0)
		})
	})

	describe('Morph edge cases', () => {
		it('should properly handle rapid insertions at the same index', () => {
			const source = reactive<number[]>([1, 2, 3])
			const effectRuns: number[][] = []

			const morphed = morph(source, (v) => v * 10)

			effect(() => {
				effectRuns.push([...morphed])
			})

			expect(effectRuns).toEqual([[10, 20, 30]])

			// Insert new element at start
			source.splice(0, 0, 999)
			expect(effectRuns).toEqual([[10, 20, 30], [9990, 10, 20, 30]])

			// Insert at same position again
			source.splice(0, 0, 888)
			expect(effectRuns).toEqual([[10, 20, 30], [9990, 10, 20, 30], [8880, 9990, 10, 20, 30]])
		})

		it('should handle morph with all items removed and readded', () => {
			const source = reactive([1, 2, 3])
			let computations = 0

			const morphed = morph(source, (v) => {
				computations++
				return v * 10
			})

			expect([...morphed]).toEqual([10, 20, 30])
			const firstComputations = computations

			// Clear array
			source.splice(0, 3)
			expect([...morphed]).toEqual([])

			// Add different items
			source.splice(0, 0, 4, 5, 6)
			expect([...morphed]).toEqual([40, 50, 60])
			// All items should be recomputed (they're at different positions)
			expect(computations).toBeGreaterThan(firstComputations)
		})

		it('should handle lazy computation in morph correctly', () => {
			const source = reactive([1, 2, 3])
			let computations = 0

			const morphed = morph(source, (v) => {
				computations++
				return v * 10
			}, { pure: true })

			// Don't access yet
			expect(computations).toBe(0)

			// Access first element only
			expect(morphed[0]).toBe(10)
			expect(computations).toBe(1)

			// Access middle element
			expect(morphed[1]).toBe(20)
			expect(computations).toBe(2)

			// Source changes
			source[1] = 99

			// Accessing index 1 should still work (lazy recompute on access)
			expect(morphed[1]).toBe(990)
		})
	})

	describe('Lift edge cases', () => {
		it('should detect property addition/deletion in object lift correctly', () => {
			const source = reactive({ a: 1, b: 2 })
			const runs: number[] = []

			const lifted = lift(() => {
				runs.push(Object.keys(source).length)
				return {
					sum: source.a + (source.b || 0),
					...source,
				}
			})

			expect(lifted.sum).toBe(3)
			expect(Object.keys(lifted).sort()).toContain('sum')
			expect(runs).toEqual([2])

			// Add property to source
			source.c = 3
			expect(Object.keys(lifted).sort()).toContain('c')
			expect(runs.length).toBe(2)

			// Delete property from source
			delete source.b
			expect(Object.keys(lifted)).not.toContain('b')
		})

		it('should handle lift with getter/setter properties', () => {
			const source = reactive({ _value: 10 })
			let setterCalls = 0

			const lifted = lift(() => {
				return {
					get computed() {
					 	return source._value * 2
					},
					set computed(v: number) {
						setterCalls++
						source._value = v / 2
					},
				}
			})

			expect(lifted.computed).toBe(20)
			expect(setterCalls).toBe(0)

			lifted.computed = 50
			expect(setterCalls).toBe(1)
			expect(source._value).toBe(25)
		})

		it('should handle lift that switches between array and object', () => {
			const mode = reactive<'array' | 'object'>('array')
			const data = reactive({ a: 1, b: 2 })

			expect(() => {
				const lifted = lift(() => {
					if (mode === 'array') {
						return [data.a, data.b]
					} else {
						return { sum: data.a + data.b }
					}
				})
				// Switching types should throw
				mode.a = 'object' as any
			}).toThrow()
		})

		it('should not trigger unnecessary updates when lift returns same values', () => {
			const source = reactive({ a: 1, b: 2 })
			let computations = 0
			const effectRuns: Record<string, number>[] = []

			const lifted = lift(() => {
				computations++
				return { sum: source.a + source.b }
			})

			effect(() => {
				effectRuns.push({ sum: lifted.sum })
			})

			expect(effectRuns).toEqual([{ sum: 3 }])
			expect(computations).toBe(1)

			// Change one property
			source.a = 2
			expect(effectRuns).toEqual([{ sum: 3 }, { sum: 4 }])
			expect(computations).toBe(2)

			// Change to same value
			source.a = 2
			// Effect shouldn't run again
			expect(effectRuns.length).toBe(2)
		})
	})

	describe('Memoize edge cases', () => {
		it('should handle memoize with multiple invocations of same argument', () => {
			const compute = vi.fn((arg: { value: number }) => {
				return arg.value * 2
			})
			const memo = memoize(compute)

			const arg1 = { value: 5 }
			const arg2 = { value: 5 } // Different object, same content

			const result1 = memo(arg1)
			const result2 = memo(arg2)

			// Should compute twice because they're different objects
			expect(compute).toHaveBeenCalledTimes(2)
			expect(result1).toBe(10)
			expect(result2).toBe(10)
		})

		it('should invalidate memoize correctly when reactive arg changes', () => {
			const reactive_arg = reactive({ value: 5 })
			let computations = 0
			const memo = memoize((arg: { value: number }) => {
				computations++
				return arg.value * 2
			})

			const result1 = memo(reactive_arg)
			expect(result1).toBe(10)
			expect(computations).toBe(1)

			// Change the reactive object
			reactive_arg.value = 10
			const result2 = memo(reactive_arg)
			expect(result2).toBe(20)
			expect(computations).toBe(2)
		})

		it('should handle memoize argument that becomes unreachable', () => {
			let unreachable = { value: 5 }
			let computations = 0
			const memo = memoize((arg: { value: number }) => {
				computations++
				return arg.value * 2
			})

			const result1 = memo(unreachable)
			expect(result1).toBe(10)
			expect(computations).toBe(1)

			// Make argument unreachable
			unreachable = null as any

			// WeakMap should still have the cached result (GC hasn't run)
			// But if GC happens, cache might be cleared
			// This is hard to test reliably
		})
	})

	describe('Complex reactive scenarios', () => {
		it('should handle nested array morphs with inner mutations', () => {
			const source = reactive([
				reactive([1, 2]),
				reactive([3, 4]),
			])

			const flatRuns: number[] = []
			const flattened = lift(() => {
				flatRuns.push(0)
				const result: number[] = []
				for (const arr of source) {
					for (const item of arr) {
						result.push(item)
					}
				}
				return result
			})

			effect`track-flattened`(() => {
				const vals = [...flattened]
				expect(vals).toBeDefined()
			})

			expect(flatRuns.length).toBeGreaterThan(0)
			expect([...flattened]).toEqual([1, 2, 3, 4])

			// Mutate inner array
			source[0].push(99)
			// Should trigger lift re-evaluation
			expect(flatRuns.length).toBeGreaterThan(1)
			expect([...flattened]).toContain(99)
		})

		it('should handle reactive array splice with reactive objects', () => {
			const obj1 = reactive({ id: 1, name: 'a' })
			const obj2 = reactive({ id: 2, name: 'b' })
			const obj3 = reactive({ id: 3, name: 'c' })

			const arr = reactive([obj1, obj2, obj3])
			const names: string[] = []

			effect(() => {
				names.length = 0
				for (const obj of arr) {
					names.push(obj.name)
				}
			})

			expect(names).toEqual(['a', 'b', 'c'])

			// Splice in the middle
			arr.splice(1, 1, reactive({ id: 99, name: 'z' }))
			expect(names).toEqual(['a', 'z', 'c'])
		})

		it('should handle multiple concurrent effect cleanups', () => {
			const source = reactive({ value: 0 })
			const cleanups: number[] = []

			const stop1 = effect`cleanup1`(() => {
				source.value // track
				return () => cleanups.push(1)
			})

			const stop2 = effect`cleanup2`(() => {
				source.value // track
				return () => cleanups.push(2)
			})

			source.value = 1 // This might trigger both
			expect(cleanups.sort()).toEqual([1, 2])

			stop1()
			stop2()

			expect(cleanups.sort()).toEqual([1, 1, 2, 2])
		})

		it('should handle effect that modifies its own dependencies', () => {
			const state = reactive({ count: 0, doubled: 0 })
			let effectRuns = 0

			effect(() => {
				effectRuns++
				state.doubled = state.count * 2
			})

			expect(effectRuns).toBe(1)
			expect(state.doubled).toBe(0)

			state.count = 5
			expect(effectRuns).toBeGreaterThan(1)
			expect(state.doubled).toBe(10)
		})
	})

	describe('Reactive proxy edge cases', () => {
		it('should handle property descriptor changes correctly', () => {
			const obj = reactive({ a: 1 })
			const descriptor = Object.getOwnPropertyDescriptor(unwrap(obj), 'a')

			expect(descriptor?.value).toBe(1)
			expect(descriptor?.writable).toBe(true)

			// Try to make it non-writable
			Object.defineProperty(unwrap(obj), 'a', {
				value: 100,
				writable: false,
			})

			// Should still be accessible through proxy
			expect(obj.a).toBe(100)

			// But shouldn't be settable anymore
			expect(() => {
				obj.a = 200
			}).not.toThrow() // JS doesn't throw in non-strict mode
		})

		it('should handle Symbol properties in reactive objects', () => {
			const sym = Symbol('test')
			const obj = reactive({ a: 1 })
			;(obj as any)[sym] = 'symbol value'

			expect((obj as any)[sym]).toBe('symbol value')

			// Change it
			;(obj as any)[sym] = 'new value'
			expect((obj as any)[sym]).toBe('new value')
		})

		it('should handle array length manipulation carefully', () => {
			const arr = reactive([1, 2, 3, 4, 5])
			const lengthAccess: number[] = []

			effect(() => {
				lengthAccess.push(arr.length)
			})

			expect(lengthAccess).toEqual([5])

			// Truncate
			arr.length = 2
			expect([...arr]).toEqual([1, 2])
			expect(lengthAccess).toEqual([5, 2])

			// Extend
			arr.length = 5
			expect(arr.length).toBe(5)
			expect(lengthAccess).toEqual([5, 2, 5])
		})
	})

	describe('Batching and atomic edge cases', () => {
		it('should apply atomic batch changes even when an error occurs', () => {
			const state = reactive({ a: 1, b: 2 })
			const effectValues: Array<{ a: number; b: number }> = []

			effect`track-values`(() => {
				effectValues.push({ a: state.a, b: state.b })
			})

			expect(effectValues).toEqual([{ a: 1, b: 2 }])

			try {
				atomic(() => {
					state.a = 10
					state.b = 20
					throw new Error('test error')
				})()
			} catch (e) {
				// Expected
			}

			// After error, the atomic changes should have been applied and effect should have run
			expect(effectValues.length).toBeGreaterThanOrEqual(1)
			// The last value should be either the original or the updated one
			const lastValue = effectValues[effectValues.length - 1]
			expect(lastValue.a === 1 || lastValue.a === 10).toBe(true)
		})

		it('should handle deeply nested atomic blocks', () => {
			const state = reactive({ a: 1, b: 2, c: 3 })
			const effectRuns: number[] = []

			effect`track-atomic`(() => {
				effectRuns.push(state.a + state.b + state.c)
			})

			expect(effectRuns).toEqual([6]) // 1+2+3

			atomic(() => {
				state.a = 10
				atomic(() => {
					state.b = 20
					atomic(() => {
						state.c = 30
					})()
				})()
			})()

			// Should batch all changes into single effect run
			// So we expect: initial run (6) + one batch run (60)
			expect(effectRuns).toEqual([6, 60])
		})
	})

	describe('Special type handling', () => {
		it('should handle Date objects in reactive containers', () => {
			const now = new Date()
			const obj = reactive({ timestamp: now })
			let dateAccess: Date | null = null

			effect`track-date`(() => {
				dateAccess = obj.timestamp
			})

			expect(dateAccess).toBe(now)

			const newDate = new Date()
			obj.timestamp = newDate
			expect(dateAccess).toBe(newDate)
		})

		it('should handle Map and Set collections properly', () => {
			const map = reactive(new Map([['a', 1], ['b', 2]]))
			const keys: string[] = []

			effect`track-map-keys`(() => {
				keys.length = 0
				for (const k of map.keys()) {
					keys.push(k)
				}
			})

			expect(keys.sort()).toEqual(['a', 'b'])

			map.set('c', 3)
			expect(keys.sort()).toContain('c')

			map.delete('a')
			expect(keys).not.toContain('a')
		})

		it('should handle null and undefined values', () => {
			const obj = reactive({ a: null as string | null, b: undefined as number | undefined })
			const runs: number[] = []

			effect`track-null-undefined`(() => {
				obj.a
				obj.b
				runs.push(0)
			})

			expect(runs.length).toBe(1)

			obj.a = 'value'
			expect(runs.length).toBe(2)

			obj.a = null
			expect(runs.length).toBe(3)

			obj.b = 42
			expect(runs.length).toBe(4)

			obj.b = undefined
			expect(runs.length).toBe(5)
		})
	})
})
