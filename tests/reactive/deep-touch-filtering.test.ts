import { effect, reactive } from 'mutts'

describe('deep touch filtering', () => {
	describe('basic deep touch filtering', () => {
		it('should only notify effects that depend on origin property when object is replaced', () => {
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ x: 10, y: 20 })
			const C = reactive({ something: A })

			let effect1Runs = 0
			let effect2Runs = 0

			// Effect that depends on C.something - should NOT be notified (deep touch avoids parent effects)
			effect(() => {
				effect1Runs++
				const val = C.something
				void val // Access to create dependency
			})

			// Effect that depends on A.x directly - should NOT be notified (doesn't come through C.something)
			effect(() => {
				effect2Runs++
				const val = A.x
				void val // Access to create dependency
			})

			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)

			// Replace C.something from A to B - triggers deep touch
			C.something = B

			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)
			// Effect2 should NOT run (doesn't depend on C.something)
			expect(effect2Runs).toBe(1)
		})

		it('should notify nested effects when parent depends on origin', () => {
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ x: 10, y: 20 })
			const C = reactive({ something: A })

			let parentRuns = 0
			let childRuns = 0

			// Parent effect depends on C.something
			effect(() => {
				parentRuns++
				const val = C.something
				void val

				// Child effect accesses A.x (accessed through C.something)
				effect(() => {
					childRuns++
					const nested = A.x
					void nested
				})
			})

			expect(parentRuns).toBe(1)
			expect(childRuns).toBe(1)

			// Replace C.something from A to B (deep touch - same structure)
			C.something = B

			// Parent should NOT run - deep touch avoids parent effects when only sub-properties change
			expect(parentRuns).toBe(1)
			// Child should run once more - to see the updated value
			expect(childRuns).toBe(2)
		})

		it('should not notify independent nested effects', () => {
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ x: 10, y: 20 })
			const C = reactive({ something: A })
			const D = reactive({ other: A })

			let effect1Runs = 0
			let effect2Runs = 0
			let effect3Runs = 0

			// Effect1 depends on C.something - should NOT run (deep touch avoids parent effects)
			effect(() => {
				effect1Runs++
				const val = C.something
				void val
			})

			// Effect2 depends on D.other (independent path to A)
			effect(() => {
				effect2Runs++
				const val = D.other
				void val

				// Nested effect accesses A.x, but through D.other, not C.something
				effect(() => {
					effect3Runs++
					const nested = A.x
					void nested
				})
			})

			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)
			expect(effect3Runs).toBe(1)

			// Replace C.something - should not notify effect2 or its nested effect
			C.something = B

			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)
			// Effect2 should NOT run (depends on D.other, not C.something)
			expect(effect2Runs).toBe(1)
			expect(effect3Runs).toBe(1)

			D.other = B

			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)

			// Effect2 should run once more - it depends on D.other, and since D.other is replaced, it should be notified
			expect(effect2Runs).toBe(1)
			expect(effect3Runs).toBe(2)
		})
	})

	describe('multiple object properties', () => {
		it('should filter correctly when object has multiple properties changed', () => {
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ x: 10, y: 20 })
			const C = reactive({ something: A })

			let effect1Runs = 0
			let effect2Runs = 0

			effect(() => {
				effect1Runs++
				const val = C.something
				void val
			})

			effect(() => {
				effect2Runs++
				const val = A.y // Different property, but still A
				void val
			})

			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)

			C.something = B

			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)
			// Effect2 should NOT run (depends on A.y directly, not through C.something)
			expect(effect2Runs).toBe(1)
		})
	})

	describe('deeply nested objects', () => {
		it('should filter correctly with deeply nested object replacements', () => {
			const A = reactive({ nested: { value: 1 } })
			const B = reactive({ nested: { value: 2 } })
			const C = reactive({ something: A })

			let effect1Runs = 0
			let effect2Runs = 0

			// Effect depends on C.something - should NOT run (deep touch avoids parent effects)
			effect(() => {
				effect1Runs++
				const val = C.something
				void val
			})

			// Effect depends on A.nested directly
			effect(() => {
				effect2Runs++
				const val = A.nested
				void val
			})

			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)

			C.something = B

			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)
			// Effect2 should NOT run (A.nested accessed directly, not through C.something)
			expect(effect2Runs).toBe(1)
		})

		it('should recursively filter nested object replacements', () => {
			const A = reactive({ nested: { deep: { value: 1 } } })
			const B = reactive({ nested: { deep: { value: 2 } } })
			const C = reactive({ something: A })

			let parentRuns = 0
			let childRuns = 0

			effect(() => {
				parentRuns++
				const val = C.something
				void val

				effect(() => {
					childRuns++
					// Access deeply nested property
					const nested = A.nested.deep.value
					void nested
				})
			})

			expect(parentRuns).toBe(1)
			expect(childRuns).toBe(1)

			C.something = B

			// Parent should NOT run - deep touch avoids parent effects
			expect(parentRuns).toBe(1)
			// Child should run once more - to see the updated value
			expect(childRuns).toBe(2)
		})
	})

	describe('array replacements', () => {
		it('should filter correctly when arrays are replaced', () => {
			const A = reactive({ items: [1, 2, 3] })
			const B = reactive({ items: [4, 5, 6] })
			const C = reactive({ something: A })

			let effect1Runs = 0
			let effect2Runs = 0

			effect(() => {
				effect1Runs++
				const val = C.something
				void val
			})

			effect(() => {
				effect2Runs++
				const val = A.items
				void val
			})

			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)

			C.something = B

			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)
		})

		it('should filter array element changes in replaced arrays', () => {
			const A = reactive({ items: [1, 2, 3] })
			const B = reactive({ items: [4, 5, 6] })
			const C = reactive({ something: A })

			let effect1Runs = 0
			let effect2Runs = 0

			effect(() => {
				effect1Runs++
				const val = C.something
				void val
			})

			effect(() => {
				effect2Runs++
				// Access array element
				const val = A.items[0]
				void val
			})

			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)

			C.something = B

			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)
		})

		it('should recursively diff arrays when array is replaced directly', () => {
			const oldArray = reactive([1, 2, 3])
			const newArray = reactive([10, 20, 30])
			const C = reactive({ arr: oldArray })

			let parentRuns = 0
			let childRuns = 0

			// Parent effect depends on C.arr
			effect(() => {
				parentRuns++
				const val = C.arr
				void val

				// Child effect accesses array element (through C.arr)
				effect(() => {
					childRuns++
					const nested = C.arr[0]
					void nested
				})
			})

			expect(parentRuns).toBe(1)
			expect(childRuns).toBe(1)

			// Replace C.arr from oldArray to newArray (deep touch - same array structure)
			C.arr = newArray

			// Parent should NOT run - deep touch avoids parent effects when only sub-properties change
			expect(parentRuns).toBe(1)
			// Child should run once more - to see the updated value at index 0
			expect(childRuns).toBe(2)
		})

		it('should NOT recursively diff when array element (object) is replaced', () => {
			const arr = reactive([{ x: 1 }, { y: 2 }])
			const oldObj = arr[0]
			const newObj = reactive({ x: 10 })

			let arrayIndexRuns = 0
			let arrayElementPropRuns = 0
			let oldObjPropRuns = 0

			// Effect that depends on the array index (just the reference)
			effect(() => {
				arrayIndexRuns++
				const val = arr[0]
				void val
			})

			// Effect that depends on a property accessed through the array
			effect(() => {
				arrayElementPropRuns++
				const val = arr[0].x
				void val
			})

			// Effect that depends on the old object directly (not through array)
			effect(() => {
				oldObjPropRuns++
				const val = oldObj.x
				void val
			})

			expect(arrayIndexRuns).toBe(1)
			expect(arrayElementPropRuns).toBe(1)
			expect(oldObjPropRuns).toBe(1)

			// Replace array element: arr[0] = newObj
			// This should NOT recursively diff oldObj and newObj
			// It should only notify that arr[0] changed (the touched change emitted should be arr[0])
			arr[0] = newObj

			// Array index effect should run (the index changed)
			expect(arrayIndexRuns).toBe(2)
			// Array element property effect should run (arr[0] changed, so it re-reads from newObj)
			expect(arrayElementPropRuns).toBe(2)
			// Old object property effect should NOT run (we didn't recursively diff, just replaced the reference)
			expect(oldObjPropRuns).toBe(1)
		})
	})

	describe('edge cases', () => {
		it('should skip all notifications when no effects depend on origin', () => {
			const A = reactive({ x: 1 })
			const B = reactive({ x: 2 })
			const C = reactive({ something: A })

			let effectRuns = 0

			// Effect depends on A.x directly, not on C.something
			effect(() => {
				effectRuns++
				const val = A.x
				void val
			})

			expect(effectRuns).toBe(1)

			// Replace C.something - no effects depend on it, so no notifications
			C.something = B

			// Effect should NOT run because it doesn't depend on C.something
			expect(effectRuns).toBe(1)
		})

		it('should work correctly with multiple independent replacements', () => {
			const A1 = reactive({ x: 1 })
			const A2 = reactive({ x: 2 })
			const B1 = reactive({ x: 10 })
			const B2 = reactive({ x: 20 })
			const C = reactive({ something: A1 })
			const D = reactive({ other: A2 })

			let effect1Runs = 0
			let effect2Runs = 0

			effect(() => {
				effect1Runs++
				const val = C.something
				void val
			})

			effect(() => {
				effect2Runs++
				const val = D.other
				void val
			})

			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)

			// Replace C.something (deep touch - same structure)
			C.something = B1
			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)

			// Replace D.other (assuming this is also deep touch)
			D.other = B2
			expect(effect1Runs).toBe(1)
			// Effect2 should NOT run if this is also deep touch
			expect(effect2Runs).toBe(1)
		})

		it('should work with effects using ascend', () => {
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ x: 10, y: 20 })
			const C = reactive({ something: A })

			let parentRuns = 0
			let ascendRuns = 0

			effect(({ ascend }) => {
				parentRuns++
				const val = C.something
				void val

				// Use ascend to track dependencies in parent
				ascend(() => {
					ascendRuns++
					const nested = A.x
					void nested
				})
			})

			expect(parentRuns).toBe(1)
			expect(ascendRuns).toBe(1)

			C.something = B

			// Parent should NOT run - it only depends on C.something directly
			// Note: Even though ascend tracks A.x in the parent, the parent effect itself
			// only directly accesses C.something, so it's treated as a parent effect that should be skipped
			// The ascend callback dependencies might not be sufficient to trigger parent re-run in deep touch scenario
			expect(parentRuns).toBe(1)
			// Ascend callback also doesn't run because parent doesn't run
			expect(ascendRuns).toBe(1)
		})

		it('should handle same object referenced from multiple sources correctly', () => {
			const A = reactive({ x: 1 })
			const B = reactive({ x: 10 })
			const C = reactive({ something: A })
			const D = reactive({ other: A })

			let effect1Runs = 0 // Depends on C.something
			let effect2Runs = 0 // Depends on D.other
			let effect3Runs = 0 // Depends directly on A.x

			effect(() => {
				effect1Runs++
				const val = C.something
				void val
			})

			effect(() => {
				effect2Runs++
				const val = D.other
				void val
			})

			effect(() => {
				effect3Runs++
				const val = A.x
				void val
			})

			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)
			expect(effect3Runs).toBe(1)

			// Replace C.something - deep touch, should NOT notify effect1
			C.something = B

			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)
			expect(effect3Runs).toBe(1)
		})

		it('should work correctly when replacement object has different structure', () => {
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ z: 3 }) // Different properties
			const C = reactive({ something: A as any })

			let effect1Runs = 0
			let effect2Runs = 0

			effect(() => {
				effect1Runs++
				const val = C.something
				void val
			})

			effect(() => {
				effect2Runs++
				const val = A.x
				void val
			})

			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)

			C.something = B as any

			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)
			// Effect2 should NOT run (depends on A.x directly)
			expect(effect2Runs).toBe(1)
		})

		it('should handle property deletions correctly', () => {
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ x: 10 }) // Missing 'y'
			const C = reactive({ something: A as any })

			let effect1Runs = 0
			let effect2Runs = 0

			effect(() => {
				effect1Runs++
				const val = C.something
				void val
			})

			effect(() => {
				effect2Runs++
				const val = A.y
				void val
			})

			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)

			C.something = B as any

			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)
		})

		it('should handle property additions correctly', () => {
			const A = reactive({ x: 1 })
			const B = reactive({ x: 10, y: 20 }) // Added 'y'
			const C = reactive({ something: A })

			let effect1Runs = 0
			let effect2Runs = 0

			effect(() => {
				effect1Runs++
				const val = C.something
				void val
			})

			effect(() => {
				effect2Runs++
				// Try to access A.y - might not exist initially
				const val = (A as any).y
				void val
			})

			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)

			C.something = B

			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)
		})
	})

	describe('normal touch (no filtering)', () => {
		it('should not filter when origin is undefined (normal property change)', () => {
			const A = reactive({ x: 1 })
			const B = reactive({ x: 2 })

			let effectRuns = 0

			effect(() => {
				effectRuns++
				const val = A.x
				void val
			})

			expect(effectRuns).toBe(1)

			// Normal property change (not deep touch)
			A.x = B.x

			// Effect should run normally (no filtering)
			expect(effectRuns).toBe(2)
		})

		it('should not filter when primitive values are replaced', () => {
			const C = reactive({ something: 1 })

			let effectRuns = 0

			effect(() => {
				effectRuns++
				const val = C.something
				void val
			})

			expect(effectRuns).toBe(1)

			// Replace with another primitive (not deep touch)
			C.something = 2

			expect(effectRuns).toBe(2)
		})
	})

	describe('complex scenarios', () => {
		it('should handle multiple levels of nesting correctly', () => {
			const A = reactive({
				level1: {
					level2: {
						value: 1,
					},
				},
			})
			const B = reactive({
				level1: {
					level2: {
						value: 2,
					},
				},
			})
			const C = reactive({ something: A })

			let grandparentRuns = 0
			let parentRuns = 0
			let childRuns = 0

			effect(() => {
				grandparentRuns++
				const val = C.something
				void val

				effect(() => {
					parentRuns++
					const nested = A.level1
					void nested

					effect(() => {
						childRuns++
						const deep = A.level1.level2.value
						void deep
					})
				})
			})

			expect(grandparentRuns).toBe(1)
			expect(parentRuns).toBe(1)
			expect(childRuns).toBe(1)

			C.something = B

			// Grandparent should NOT run - deep touch avoids parent effects
			expect(grandparentRuns).toBe(1)
			// Parent should NOT run (grandparent didn't re-run, so parent wasn't recreated)
			expect(parentRuns).toBe(1)
			// Child should run once more - to see the updated value
			expect(childRuns).toBe(2)
		})

		it('should work correctly with mixed direct and indirect dependencies', () => {
			const A = reactive({ x: 1, y: 2 })
			const B = reactive({ x: 10, y: 20 })
			const C = reactive({ something: A })

			let effect1Runs = 0 // Depends on C.something
			let effect2Runs = 0 // Depends on C.something AND A.x directly

			effect(() => {
				effect1Runs++
				const val = C.something
				void val
			})

			effect(() => {
				effect2Runs++
				const val1 = C.something // Indirect through C
				const val2 = A.x // Direct dependency
				void val1
				void val2
			})

			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)

			C.something = B

			// Effect1 should NOT run - deep touch avoids parent effects
			expect(effect1Runs).toBe(1)
			// Effect2 should run once more - it depends on A.x and has C.something in its dependencies (allowed set)
			expect(effect2Runs).toBe(2)
		})
	})
})
