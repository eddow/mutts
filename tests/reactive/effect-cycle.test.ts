import { effect, reactive, reactiveOptions as options } from 'mutts/reactive'

describe('effect cycle detection and ordering', () => {
	describe('cycle detection', () => {
		it('should throw error when cycle is detected (default)', () => {
			const state = reactive({ a: 0, b: 0 })

			// Create a cycle: effectA sets b, effectB sets a
			let effectA: (() => void) | undefined

			effectA = effect(() => {
				state.b = state.a + 1
			})

			// Initial execution of effectA should work
			expect(state.b).toBe(1)

			// Creating effectB will trigger effectA, which will try to trigger effectB again
			// This creates a cycle that should be detected
			expect(() => {
				effect(() => {
					state.a = state.b + 1
				})
			}).toThrow(/Cycle detected/)

			// Cleanup
			effectA?.()
		})

		it('should warn when cycle is detected (warn mode)', () => {
			const originalCycleHandling = options.cycleHandling
			const warnSpy = jest.spyOn(options, 'warn').mockImplementation(() => {})

			try {
				options.cycleHandling = 'warn'

				const state = reactive({ a: 0, b: 0 })

				let effectA: (() => void) | undefined

				effectA = effect(() => {
					state.b = state.a + 1
				})

				// Creating effectB will trigger effectA, which will try to trigger effectB again
				// This should warn but not throw
				effect(() => {
					state.a = state.b + 1
				})

				// Should have warned about cycle
				expect(warnSpy).toHaveBeenCalledWith(
					expect.stringContaining('Cycle detected')
				)

				// Should still execute (cycle broken)
				expect(state.a).toBeGreaterThan(0)
				expect(state.b).toBeGreaterThan(0)

				effectA?.()
			} finally {
				options.cycleHandling = originalCycleHandling
				warnSpy.mockRestore()
			}
		})

		it('should silently break cycle (break mode)', () => {
			const originalCycleHandling = options.cycleHandling
			const warnSpy = jest.spyOn(options, 'warn').mockImplementation(() => {})

			try {
				options.cycleHandling = 'break'

				const state = reactive({ a: 0, b: 0 })

				let effectA: (() => void) | undefined

				effectA = effect(() => {
					state.b = state.a + 1
				})

				// Should not throw
				expect(() => {
					effect(() => {
						state.a = state.b + 1
					})
				}).not.toThrow()

				// Should not warn
				expect(warnSpy).not.toHaveBeenCalled()

				// Should still execute (cycle broken)
				expect(state.a).toBeGreaterThan(0)
				expect(state.b).toBeGreaterThan(0)

				effectA?.()
			} finally {
				options.cycleHandling = originalCycleHandling
				warnSpy.mockRestore()
			}
		})

		it('should detect complex cycles (A -> B -> C -> A)', () => {
			const state = reactive({ a: 0, b: 0, c: 0 })

			const effects: (() => void)[] = []

			// A -> B -> C -> A cycle
			effects.push(
				effect(() => {
					state.b = state.a + 1
				})
			)

			effects.push(
				effect(() => {
					state.c = state.b + 1
				})
			)

			// Creating the third effect should detect the cycle
			expect(() => {
				effects.push(
					effect(() => {
						state.a = state.c + 1
					})
				)
			}).toThrow(/Cycle detected/)

			// Cleanup
			effects.forEach((stop) => stop())
		})
	})

	describe('topological ordering', () => {
		it('should execute effects in dependency order', () => {
			const state = reactive({ a: 0, b: 0, c: 0 })
			const executionOrder: string[] = []

			// Create a chain: A -> B -> C
			// Effects write to properties that others read
			effect(() => {
				executionOrder.push('C')
				state.c = state.b + 1 // Read b, write c
			})

			effect(() => {
				executionOrder.push('B')
				state.b = state.a + 1 // Read a, write b
			})

			// Clear initial execution
			executionOrder.length = 0

			// Trigger from A - B and C will be in batch
			state.a = 5

			// Should execute in dependency order: B -> C
			expect(executionOrder).toEqual(['B', 'C'])
		})

		it('should handle parallel effects correctly', () => {
			const state = reactive({ a: 0, b: 0, c: 0, d: 0 })
			const executionOrder: string[] = []

			// C depends on A (reads a, writes c), D depends on B (reads b, writes d)
			// A and B are independent sources
			effect(() => {
				executionOrder.push('C')
				state.c = state.a + 1 // Read a, write c
			})

			effect(() => {
				executionOrder.push('D')
				state.d = state.b + 1 // Read b, write d
			})

			// Clear initial execution
			executionOrder.length = 0

			// Trigger both A and B - C and D should execute
			state.a = 5
			state.b = 5

			// Both C and D should execute
			expect(executionOrder).toContain('C')
			expect(executionOrder).toContain('D')
		})

		it('should handle transitive dependencies (A -> B -> C)', () => {
			const state = reactive({ a: 0, b: 0, c: 0 })
			const executionOrder: string[] = []

			// A -> B -> C chain: effects read properties in a chain
			// C reads b, B reads a - when a changes, both are triggered
			// The graph will have B -> C (B triggers C when B writes to b)
			effect(() => {
				executionOrder.push('C')
				const val = state.b // Read b (will depend on B if B writes to b)
			})

			effect(() => {
				executionOrder.push('B')
				const val = state.a // Read a
				// Note: If B writes to b, it will trigger C, creating B -> C dependency
			})

			// Clear initial execution
			executionOrder.length = 0

			// Both B and C read a, so both will be triggered
			state.a = 10

			// Both should execute
			expect(executionOrder.length).toBeGreaterThan(0)
		})

		it('should not detect ghost cycles when effects are created in different order', () => {
			const state = reactive({ a: 0, b: 0, c: 0, d: 0 })
			const executionOrder: string[] = []

			// Create effects in reverse order: D, C, B
			// This is a valid chain B -> C -> D, not a cycle
			// The order of creation shouldn't matter
			effect(() => {
				executionOrder.push('D')
				state.d = state.c + 1 // Read c, write d
			})

			effect(() => {
				executionOrder.push('B')
				state.b = state.a + 1 // Read a, write b
			})

			effect(() => {
				executionOrder.push('C')
				state.c = state.b + 1 // Read b, write c
			})

			// Clear initial execution
			executionOrder.length = 0

			// Change A - should trigger B, then C, then D in order
			// Should NOT throw a cycle error
			expect(() => {
				state.a = 5
			}).not.toThrow()

			// Should execute in dependency order: B -> C -> D
			expect(executionOrder).toEqual(['B', 'C', 'D'])
			expect(state.b).toBe(6) // a + 1
			expect(state.c).toBe(7) // b + 1
			expect(state.d).toBe(8) // c + 1
		})

		it('should optimize execution order for cascading effects', () => {
			const state = reactive({ a: 0, b: 0, c: 0, d: 0 })
			const executionOrder: string[] = []

			// Create a chain: B -> C -> D (valid chain, not a cycle)
			// Effects read from one property and write to another
			// B reads a and writes b, C reads b and writes c, D reads c and writes d
			effect(() => {
				executionOrder.push('B')
				state.b = state.a + 1 // Read a, write b
			})

			effect(() => {
				executionOrder.push('C')
				state.c = state.b + 1 // Read b, write c
			})

			effect(() => {
				executionOrder.push('D')
				state.d = state.c + 1 // Read c, write d
			})

			// Clear initial execution
			executionOrder.length = 0

			// Change A - should trigger B, then C, then D in order
			state.a = 5

			// Should execute in dependency order: B -> C -> D
			// This demonstrates the topological ordering optimization
			expect(executionOrder).toEqual(['B', 'C', 'D'])
			expect(state.b).toBe(6) // a + 1
			expect(state.c).toBe(7) // b + 1
			expect(state.d).toBe(8) // c + 1
		})
	})

	describe('cycle detection with ordering', () => {
		it('should detect cycle even with correct initial ordering', () => {
			const state = reactive({ a: 0, b: 0, c: 0 })

			// Create effects that form a cycle: A -> B -> C -> A
			effect(() => {
				state.b = state.a + 1 // A triggers B
			})

			effect(() => {
				state.c = state.b + 1 // B triggers C
			})

			// Creating the third effect should detect the cycle
			expect(() => {
				effect(() => {
					state.a = state.c + 1 // C would trigger A, completing the cycle
				})
			}).toThrow(/Cycle detected/)
		})
	})
	describe('ghost cycle detection', () => {
		it('should not detect ghost cycle when effects are created in reverse order', () => {
			const state = reactive({ a: 0, b: 0, c: 0, d: 0 })
			const executionOrder: string[] = []

			// Create effects in reverse order: D, C, B
			// This creates a valid chain B -> C -> D, NOT a cycle
			// The order of creation shouldn't cause false cycle detection
			effect(() => {
				executionOrder.push('D')
				state.d = state.c + 1
			})

			effect(() => {
				executionOrder.push('C')
				state.c = state.b + 1
			})

			effect(() => {
				executionOrder.push('B')
				state.b = state.a + 1
			})

			// Clear initial execution
			executionOrder.length = 0

			// This should NOT throw - it's not a cycle, just a chain
			expect(() => {
				state.a = 5
			}).not.toThrow()

			// Should execute in order: B -> C -> D
			expect(executionOrder).toEqual(['B', 'C', 'D'])
		})
	})


})

