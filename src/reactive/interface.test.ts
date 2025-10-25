import { computed, effect, reactive, unwrap, watch } from './index'

describe('computed', () => {
	it('returns computed value and caches it', () => {
		const state = reactive({ a: 1, b: 2 })
		let runs = 0
		const getter = () => {
			runs++
			return state.a + state.b
		}

		const v1 = computed(getter)
		expect(v1).toBe(3)
		expect(runs).toBe(1)

		const v2 = computed(getter)
		expect(v2).toBe(3)
		// still cached, no re-run
		expect(runs).toBe(1)
	})

	it('recomputes after a dependency change (at least once)', () => {
		const state = reactive({ a: 1, b: 2 })
		let runs = 0
		const getter = () => {
			runs++
			return state.a + state.b
		}

		// initial compute
		expect(computed(getter)).toBe(3)
		expect(runs).toBe(1)

		// mutate dependency -> internal effect should refresh cache once
		state.a = 5
		expect(computed(getter)).toBe(7)
		// getter should have run again exactly once
		expect(runs).toBe(2)
	})

	it('flows with the effects', () => {
		const state = reactive({ a: 1, b: 2 })
		let runs = 0
		const getter = () => {
			runs++
			return state.b + 1
		}

		effect(() => {
			state.a = computed(getter) + 1
		})
		// initial compute
		expect(computed(getter)).toBe(3)
		expect(runs).toBe(1)

		// mutate dependency -> internal effect should refresh cache once
		state.b = 3
		expect(state.a).toBe(5)
		// getter should have run again exactly once
		expect(runs).toBe(2)
		expect(computed(getter)).toBe(4)
		// getter should have not run again
		expect(runs).toBe(2)
	})

	it('should properly track dependencies when computed is called within an effect', () => {
		const state = reactive({ a: 1, b: 2, c: 0 })
		let effectRuns = 0
		let computedRuns = 0

		const getter = () => {
			computedRuns++
			return state.a + state.b
		}

		effect(() => {
			effectRuns++
			// This should properly track the computed's dependencies
			state.c = computed(getter)
		})

		// Initial run
		expect(effectRuns).toBe(1)
		expect(computedRuns).toBe(1)
		expect(state.c).toBe(3)

		// Change a dependency of the computed
		state.a = 5
		// The effect should re-run because it depends on the computed
		expect(effectRuns).toBe(2)
		expect(computedRuns).toBe(2)
		expect(state.c).toBe(7)

		// Change another dependency
		state.b = 10
		expect(effectRuns).toBe(3)
		expect(computedRuns).toBe(3)
		expect(state.c).toBe(15)
	})

	it('should properly invalidate computed cache when dependencies change within effect', () => {
		const state = reactive({ a: 1, b: 2, result: 0 })
		let effectRuns = 0
		let computedRuns = 0

		const getter = () => {
			computedRuns++
			return state.a * state.b
		}

		effect(() => {
			effectRuns++
			// The computed should be properly tracked and invalidated
			state.result = computed(getter)
		})

		// Initial run
		expect(effectRuns).toBe(1)
		expect(computedRuns).toBe(1)
		expect(state.result).toBe(2)

		// Change dependency - effect should re-run and computed should re-execute
		state.a = 3
		expect(effectRuns).toBe(2)
		expect(computedRuns).toBe(2)
		expect(state.result).toBe(6)

		// Change another dependency
		state.b = 4
		expect(effectRuns).toBe(3)
		expect(computedRuns).toBe(3)
		expect(state.result).toBe(12)
	})

	it('doubles computed', () => {
		const source: any = reactive({})
		class DecoratedClass {
			@computed
			get doubled() {
				source.a ??= 1
				return source.a * 2
			}
			@computed
			get quadrupled() {
				return this.doubled * 2
			}
		}
		const obj = new DecoratedClass()
		expect(obj.quadrupled).toBe(4)
		source.a = 2
		expect(obj.quadrupled).toBe(8)
	})

	describe('computed call count verification', () => {
		it('should cache computed values and not re-execute unnecessarily', () => {
			const state = reactive({ a: 1, b: 2, c: 3 })
			let getterRuns = 0
			let effectRuns = 0

			const getter = () => {
				getterRuns++
				return state.a + state.b + state.c
			}

			// Test multiple accesses without dependency changes
			expect(computed(getter)).toBe(6)
			expect(getterRuns).toBe(1)

			expect(computed(getter)).toBe(6)
			expect(getterRuns).toBe(1) // Should still be 1 - cached

			expect(computed(getter)).toBe(6)
			expect(getterRuns).toBe(1) // Should still be 1 - cached

			// Test with effect that uses computed
			effect(() => {
				effectRuns++
				computed(getter)
			})

			expect(effectRuns).toBe(1)
			expect(getterRuns).toBe(1) // Should still be 1 - computed is cached

			// Change dependency - should invalidate cache
			state.a = 5
			expect(computed(getter)).toBe(10)
			expect(getterRuns).toBe(2) // Should be 2 now - cache invalidated

			expect(computed(getter)).toBe(10)
			expect(getterRuns).toBe(2) // Should still be 2 - cached again
		})

		it('should properly track dependencies and invalidate cache when dependencies change', () => {
			const state = reactive({ x: 1, y: 2, z: 3 })
			let getterRuns = 0

			const getter = () => {
				getterRuns++
				return state.x * state.y + state.z
			}

			// Initial computation
			expect(computed(getter)).toBe(5) // 1*2 + 3 = 5
			expect(getterRuns).toBe(1)

			// Access again - should be cached
			expect(computed(getter)).toBe(5)
			expect(getterRuns).toBe(1)

			// Change x - should invalidate
			state.x = 3
			expect(computed(getter)).toBe(9) // 3*2 + 3 = 9
			expect(getterRuns).toBe(2)

			// Change y - should invalidate
			state.y = 4
			expect(computed(getter)).toBe(15) // 3*4 + 3 = 15
			expect(getterRuns).toBe(3)

			// Change z - should invalidate
			state.z = 1
			expect(computed(getter)).toBe(13) // 3*4 + 1 = 13
			expect(getterRuns).toBe(4)

			// Multiple accesses after change - should be cached
			expect(computed(getter)).toBe(13)
			expect(getterRuns).toBe(4)
			expect(computed(getter)).toBe(13)
			expect(getterRuns).toBe(4)
		})

		it('should handle computed within effects with proper call counting', () => {
			const state = reactive({ a: 1, b: 2, result: 0 })
			let computedRuns = 0
			let effectRuns = 0

			const getter = () => {
				computedRuns++
				return state.a + state.b
			}

			effect(() => {
				effectRuns++
				const result = computed(getter)
				state.result = result
			})

			// Initial run
			expect(effectRuns).toBe(1)
			expect(computedRuns).toBe(1)
			expect(state.result).toBe(3)

			// Change dependency
			state.a = 5
			expect(effectRuns).toBe(2)
			expect(computedRuns).toBe(2)
			expect(state.result).toBe(7)

			// Change another dependency
			state.b = 10
			expect(effectRuns).toBe(3)
			expect(computedRuns).toBe(3)
			expect(state.result).toBe(15)
		})

		it('should handle multiple computed values with independent caching', () => {
			const state = reactive({ x: 1, y: 2, z: 3 })
			let getter1Runs = 0
			let getter2Runs = 0

			const getter1 = () => {
				getter1Runs++
				return state.x + state.y
			}

			const getter2 = () => {
				getter2Runs++
				return state.y + state.z
			}

			// Compute both
			expect(computed(getter1)).toBe(3)
			expect(computed(getter2)).toBe(5)
			expect(getter1Runs).toBe(1)
			expect(getter2Runs).toBe(1)

			// Access again - both should be cached
			expect(computed(getter1)).toBe(3)
			expect(computed(getter2)).toBe(5)
			expect(getter1Runs).toBe(1)
			expect(getter2Runs).toBe(1)

			// Change x - only getter1 should re-run
			state.x = 5
			expect(computed(getter1)).toBe(7)
			expect(computed(getter2)).toBe(5)
			expect(getter1Runs).toBe(2)
			expect(getter2Runs).toBe(1) // Should still be 1

			// Change y - both should re-run
			state.y = 10
			expect(computed(getter1)).toBe(15)
			expect(computed(getter2)).toBe(13)
			expect(getter1Runs).toBe(3)
			expect(getter2Runs).toBe(2)

			// Change z - only getter2 should re-run
			state.z = 20
			expect(computed(getter1)).toBe(15)
			expect(computed(getter2)).toBe(30)
			expect(getter1Runs).toBe(3) // Should still be 3
			expect(getter2Runs).toBe(3)
		})

		it('should handle nested computed values with proper call counting', () => {
			const state = reactive({ a: 1, b: 2, c: 3 })
			let baseRuns = 0
			let derivedRuns = 0
			let finalRuns = 0

			const baseGetter = () => {
				baseRuns++
				return state.a + state.b
			}

			const derivedGetter = () => {
				derivedRuns++
				return computed(baseGetter) * 2
			}

			const finalGetter = () => {
				finalRuns++
				return computed(derivedGetter) + state.c
			}

			// Compute final value
			expect(computed(finalGetter)).toBe(9) // (1+2)*2 + 3 = 9
			expect(baseRuns).toBe(1)
			expect(derivedRuns).toBe(1)
			expect(finalRuns).toBe(1)

			// Access again - all should be cached
			expect(computed(finalGetter)).toBe(9)
			expect(baseRuns).toBe(1)
			expect(derivedRuns).toBe(1)
			expect(finalRuns).toBe(1)

			// Change a - all should re-run
			state.a = 5
			expect(computed(finalGetter)).toBe(17) // (5+2)*2 + 3 = 17
			expect(baseRuns).toBe(2)
			expect(derivedRuns).toBe(2)
			expect(finalRuns).toBe(2)

			// Change c - only final should re-run
			state.c = 10
			expect(computed(finalGetter)).toBe(24) // (5+2)*2 + 10 = 24
			expect(baseRuns).toBe(2) // Should still be 2
			expect(derivedRuns).toBe(2) // Should still be 2
			expect(finalRuns).toBe(3)
		})

		it('should handle computed with complex dependency chains', () => {
			const state = reactive({ a: 1, b: 2, c: 3, d: 4 })
			let step1Runs = 0
			let step2Runs = 0
			let step3Runs = 0
			let finalRuns = 0

			const step1 = () => {
				step1Runs++
				return state.a + state.b
			}

			const step2 = () => {
				step2Runs++
				return computed(step1) * state.c
			}

			const step3 = () => {
				step3Runs++
				return computed(step2) - state.d
			}

			const final = () => {
				finalRuns++
				return computed(step3) * 2
			}

			// Compute final value: ((1+2)*3 - 4) * 2 = (3*3 - 4) * 2 = (9 - 4) * 2 = 10
			expect(computed(final)).toBe(10)
			expect(step1Runs).toBe(1)
			expect(step2Runs).toBe(1)
			expect(step3Runs).toBe(1)
			expect(finalRuns).toBe(1)

			// Access again - all cached
			expect(computed(final)).toBe(10)
			expect(step1Runs).toBe(1)
			expect(step2Runs).toBe(1)
			expect(step3Runs).toBe(1)
			expect(finalRuns).toBe(1)

			// Change a - all should re-run
			state.a = 5
			expect(computed(final)).toBe(34) // ((5+2)*3 - 4) * 2 = (7*3 - 4) * 2 = (21 - 4) * 2 = 34
			expect(step1Runs).toBe(2)
			expect(step2Runs).toBe(2)
			expect(step3Runs).toBe(2)
			expect(finalRuns).toBe(2)

			// Change c - step2, step3, final should re-run
			state.c = 2
			expect(computed(final)).toBe(20) // ((5+2)*2 - 4) * 2 = (7*2 - 4) * 2 = (14 - 4) * 2 = 20
			expect(step1Runs).toBe(2) // Should still be 2
			expect(step2Runs).toBe(3)
			expect(step3Runs).toBe(3)
			expect(finalRuns).toBe(3)

			// Change d - step3, final should re-run
			state.d = 6
			expect(computed(final)).toBe(16) // ((5+2)*2 - 6) * 2 = (7*2 - 6) * 2 = (14 - 6) * 2 = 16
			expect(step1Runs).toBe(2) // Should still be 2
			expect(step2Runs).toBe(3) // Should still be 3
			expect(step3Runs).toBe(4)
			expect(finalRuns).toBe(4)
		})

		it('should handle computed with array dependencies', () => {
			const state = reactive({ items: [1, 2, 3], multiplier: 2 })
			let getterRuns = 0

			const getter = () => {
				getterRuns++
				return state.items.reduce((sum, item) => sum + item, 0) * state.multiplier
			}

			// Initial computation
			expect(computed(getter)).toBe(12) // (1+2+3) * 2 = 12
			expect(getterRuns).toBe(1)

			// Access again - cached
			expect(computed(getter)).toBe(12)
			expect(getterRuns).toBe(1)

			// Change array element
			state.items[0] = 5
			expect(computed(getter)).toBe(20) // (5+2+3) * 2 = 20
			expect(getterRuns).toBe(2)

			// Change multiplier
			state.multiplier = 3
			expect(computed(getter)).toBe(30) // (5+2+3) * 3 = 30
			expect(getterRuns).toBe(3)

			// Push to array
			state.items.push(4)
			expect(computed(getter)).toBe(42) // (5+2+3+4) * 3 = 42
			expect(getterRuns).toBe(4)
		})

		it('should handle computed with object property dependencies', () => {
			const state = reactive({
				user: { name: 'John', age: 30 },
				settings: { theme: 'dark', lang: 'en' },
			})
			let getterRuns = 0

			const getter = () => {
				getterRuns++
				return `${state.user.name} (${state.user.age}) - ${state.settings.theme}/${state.settings.lang}`
			}

			// Initial computation
			expect(computed(getter)).toBe('John (30) - dark/en')
			expect(getterRuns).toBe(1)

			// Access again - cached
			expect(computed(getter)).toBe('John (30) - dark/en')
			expect(getterRuns).toBe(1)

			// Change nested property
			state.user.name = 'Jane'
			expect(computed(getter)).toBe('Jane (30) - dark/en')
			expect(getterRuns).toBe(2)

			// Change another nested property
			state.user.age = 25
			expect(computed(getter)).toBe('Jane (25) - dark/en')
			expect(getterRuns).toBe(3)

			// Change settings
			state.settings.theme = 'light'
			expect(computed(getter)).toBe('Jane (25) - light/en')
			expect(getterRuns).toBe(4)
		})

		it('should handle computed with conditional dependencies', () => {
			const state = reactive({ a: 1, b: 2, useA: true })
			let getterRuns = 0

			const getter = () => {
				getterRuns++
				return state.useA ? state.a : state.b
			}

			// Initial computation
			expect(computed(getter)).toBe(1)
			expect(getterRuns).toBe(1)

			// Access again - cached
			expect(computed(getter)).toBe(1)
			expect(getterRuns).toBe(1)

			// Change a (should invalidate because useA is true)
			state.a = 5
			expect(computed(getter)).toBe(5)
			expect(getterRuns).toBe(2)

			// Change b (should not invalidate because useA is true)
			state.b = 10
			expect(computed(getter)).toBe(5)
			expect(getterRuns).toBe(2) // Should still be 2

			// Change useA (should invalidate and now depend on b)
			state.useA = false
			expect(computed(getter)).toBe(10)
			expect(getterRuns).toBe(3)

			// Now changing a should not invalidate
			state.a = 20
			expect(computed(getter)).toBe(10)
			expect(getterRuns).toBe(3) // Should still be 3

			// But changing b should invalidate
			state.b = 30
			expect(computed(getter)).toBe(30)
			expect(getterRuns).toBe(4)
		})

		it('should handle computed with multiple effects using the same computed', () => {
			const state = reactive({ a: 1, b: 2, result1: 0, result2: 0 })
			let getterRuns = 0
			let effect1Runs = 0
			let effect2Runs = 0

			const getter = () => {
				getterRuns++
				return state.a + state.b
			}

			effect(() => {
				effect1Runs++
				state.result1 = computed(getter)
			})

			effect(() => {
				effect2Runs++
				state.result2 = computed(getter) * 2
			})

			// Initial runs
			expect(effect1Runs).toBe(1)
			expect(effect2Runs).toBe(1)
			expect(getterRuns).toBe(1) // Should only run once, shared between effects
			expect(state.result1).toBe(3)
			expect(state.result2).toBe(6)

			// Change dependency - both effects should re-run, but getter should only run once
			state.a = 5
			expect(effect1Runs).toBe(2)
			expect(effect2Runs).toBe(2)
			expect(getterRuns).toBe(2) // Should be 2 now
			expect(state.result1).toBe(7)
			expect(state.result2).toBe(14)

			// Access computed directly - should be cached
			expect(computed(getter)).toBe(7)
			expect(getterRuns).toBe(2) // Should still be 2
		})

		it('should handle computed with side effects in getter', () => {
			const state = reactive({ a: 1, b: 2, sideEffectCount: 0 })
			let getterRuns = 0
			let sideEffectRuns = 0

			const getter = () => {
				getterRuns++
				sideEffectRuns++
				state.sideEffectCount = sideEffectRuns
				return state.a + state.b
			}

			// Initial computation
			expect(computed(getter)).toBe(3)
			expect(getterRuns).toBe(1)
			expect(sideEffectRuns).toBe(1)
			expect(state.sideEffectCount).toBe(1)

			// Access again - should be cached, no side effects
			expect(computed(getter)).toBe(3)
			expect(getterRuns).toBe(1)
			expect(sideEffectRuns).toBe(1)
			expect(state.sideEffectCount).toBe(1)

			// Change dependency - should re-run with side effects
			state.a = 5
			expect(computed(getter)).toBe(7)
			expect(getterRuns).toBe(2)
			expect(sideEffectRuns).toBe(2)
			expect(state.sideEffectCount).toBe(2)
		})

		it('should handle computed with async-like behavior (promises)', () => {
			const state = reactive({ a: 1, b: 2 })
			let getterRuns = 0

			const getter = () => {
				getterRuns++
				// Simulate async computation by returning a promise
				return Promise.resolve(state.a + state.b)
			}

			// Initial computation
			const result1 = computed(getter)
			expect(result1).toBeInstanceOf(Promise)
			expect(getterRuns).toBe(1)

			// Access again - should be cached
			const result2 = computed(getter)
			expect(result2).toBeInstanceOf(Promise)
			expect(getterRuns).toBe(1) // Should still be 1

			// Change dependency - should re-run
			state.a = 5
			const result3 = computed(getter)
			expect(result3).toBeInstanceOf(Promise)
			expect(getterRuns).toBe(2)
		})

		it('should handle computed with circular dependencies gracefully', () => {
			const state = reactive({ a: 1, b: 2 })
			let getter1Runs = 0
			let getter2Runs = 0

			// Create circular dependency
			const getter1 = () => {
				getter1Runs++
				return state.a + (state.b > 0 ? computed(getter2) : 0)
			}

			const getter2 = () => {
				getter2Runs++
				return state.b + (state.a > 0 ? computed(getter1) : 0)
			}

			// This should not cause infinite recursion
			expect(() => computed(getter1)).toThrow()
		})

		it('should handle computed with undefined/null dependencies', () => {
			const state: { a: number; b: number | undefined; c: number | null } = reactive({
				a: 1,
				b: undefined,
				c: null,
			})
			let getterRuns = 0

			const getter = () => {
				getterRuns++
				return state.a + (state.b || 0) + (state.c || 0)
			}

			// Initial computation
			expect(computed(getter)).toBe(1)
			expect(getterRuns).toBe(1)

			// Access again - cached
			expect(computed(getter)).toBe(1)
			expect(getterRuns).toBe(1)

			// Change undefined to number
			state.b = 5
			expect(computed(getter)).toBe(6)
			expect(getterRuns).toBe(2)

			// Change null to number
			state.c = 10
			expect(computed(getter)).toBe(16)
			expect(getterRuns).toBe(3)
		})
	})
})

describe('watch', () => {
	describe('watch with value function', () => {
		it('should watch a specific value and trigger on changes', () => {
			const state = reactive({ count: 0, name: 'John' })
			let newValue: number | undefined
			let oldValue: number | undefined
			let callCount = 0

			const stop = watch(
				() => state.count,
				(newVal, oldVal) => {
					newValue = newVal
					oldValue = oldVal
					callCount++
				}
			)

			expect(callCount).toBe(0) // Should not trigger on setup

			state.count = 5
			expect(callCount).toBe(1)
			expect(newValue).toBe(5)
			expect(oldValue).toBe(0)

			state.count = 10
			expect(callCount).toBe(2)
			expect(newValue).toBe(10)
			expect(oldValue).toBe(5)

			// Changing other properties should not trigger
			state.name = 'Jane'
			expect(callCount).toBe(2) // Should remain 2

			stop()
		})

		it('should not trigger when watching non-reactive values', () => {
			const state = reactive({ count: 0 })
			let callCount = 0

			const stop = watch(
				() => 42, // Non-reactive value
				() => {
					callCount++
				}
			)

			state.count = 5
			expect(callCount).toBe(0) // Should not trigger

			stop()
		})

		it('should handle multiple watchers on the same value', () => {
			const state = reactive({ count: 0 })
			let watcher1Calls = 0
			let watcher2Calls = 0

			const stop1 = watch(
				() => state.count,
				() => {
					watcher1Calls++
				}
			)

			const stop2 = watch(
				() => state.count,
				() => {
					watcher2Calls++
				}
			)

			state.count = 5
			expect(watcher1Calls).toBe(1)
			expect(watcher2Calls).toBe(1)

			state.count = 10
			expect(watcher1Calls).toBe(2)
			expect(watcher2Calls).toBe(2)

			stop1()
			stop2()
		})

		it('should stop watching when cleanup is called', () => {
			const state = reactive({ count: 0 })
			let callCount = 0

			const stop = watch(
				() => state.count,
				() => {
					callCount++
				}
			)

			state.count = 5
			expect(callCount).toBe(1)

			stop()

			state.count = 10
			expect(callCount).toBe(1) // Should not increment after stop
		})

		it('should handle computed values in watch', () => {
			const state = reactive({ a: 1, b: 2 })
			let callCount = 0
			let lastValue: number | undefined

			const stop = watch(
				() => state.a + state.b,
				(newValue) => {
					lastValue = newValue
					callCount++
				}
			)

			state.a = 3
			expect(callCount).toBe(1)
			expect(lastValue).toBe(5)

			state.b = 4
			expect(callCount).toBe(2)
			expect(lastValue).toBe(7)

			stop()
		})

		it('should watch computed properties that return new objects (simplified)', () => {
			// Simplified test: watching a computed property that returns a new object each time
			// The bug occurs when modifying existing objects, not just adding new ones
			@reactive
			class TestClass {
				public slots: { item: string; count: number }[] = []

				addItem(item: string) {
					this.slots.push({ item, count: 1 })
				}

				incrementCount(item: string) {
					const slot = this.slots.find((s) => s.item === item)
					if (slot) slot.count++
				}

				//@computed
				get summary(): { [k: string]: number } {
					const result: { [k: string]: number } = {}
					for (const slot of this.slots) {
						result[slot.item] = slot.count
					}
					return result
				}
			}

			const obj = new TestClass()
			let callCount = 0

			const stop = watch(
				() => obj.summary,
				() => callCount++,
				{ deep: true }
			)

			expect(callCount).toBe(0)

			// First change should trigger
			obj.addItem('wood')
			expect(callCount).toBe(1)

			// Second change should trigger
			obj.addItem('stone')
			expect(callCount).toBe(2)

			// Third change should trigger but doesn't (this is the bug)
			// Modifying existing object property doesn't trigger the watch
			obj.incrementCount('wood')
			expect(callCount).toBe(3)

			stop()
		})

		it('should watch computed properties that return new objects (with computed)', () => {
			// This test shows the same issue but with @computed for comparison
			@reactive
			class TestClass {
				public slots: { item: string; count: number }[] = []

				addItem(item: string) {
					this.slots.push({ item, count: 1 })
				}

				incrementCount(item: string) {
					const slot = this.slots.find((s) => s.item === item)
					if (slot) slot.count++
				}

				@computed
				get summary(): { [k: string]: number } {
					const result: { [k: string]: number } = {}
					for (const slot of this.slots) {
						result[slot.item] = slot.count
					}
					return result
				}
			}

			const obj = new TestClass()
			let callCount = 0

			// Watch the computed property that returns new objects
			const stop = watch(
				() => obj.summary,
				() => callCount++,
				{ deep: true }
			)

			expect(callCount).toBe(0)

			// First change should trigger
			obj.addItem('wood')
			expect(callCount).toBe(1)

			// Second change should trigger
			obj.addItem('stone')
			expect(callCount).toBe(2)

			// Third change should trigger but doesn't (this is the bug)
			obj.incrementCount('wood')
			expect(callCount).toBe(3)

			stop()
		})
	})

	describe('watch object properties', () => {
		it('should watch any property change on a reactive object', () => {
			const user = reactive({
				name: 'John',
				age: 30,
				email: 'john@example.com',
			})
			let callCount = 0
			let lastUser: any

			const stop = watch(user, () => {
				callCount++
				lastUser = { ...user }
			})

			expect(callCount).toBe(0) // Should not trigger on setup

			user.name = 'Jane'
			expect(callCount).toBe(1)
			expect(lastUser.name).toBe('Jane')

			user.age = 31
			expect(callCount).toBe(2)
			expect(lastUser.age).toBe(31)

			user.email = 'jane@example.com'
			expect(callCount).toBe(3)
			expect(lastUser.email).toBe('jane@example.com')

			stop()
		})
		it('should watch nested object property changes', () => {
			const state = reactive({
				user: {
					name: 'John',
					profile: { age: 30 },
				},
			})
			let callCount = 0

			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			state.user.name = 'Jane'
			expect(callCount).toBe(1)

			state.user.profile.age = 31
			expect(callCount).toBe(2)

			stop()
		})

		it('should watch array changes when object contains arrays', () => {
			const state = reactive({
				items: [1, 2, 3],
				name: 'test',
			})
			let callCount = 0

			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			state.items.push(4)
			expect(callCount).toBe(1)

			state.items[0] = 10
			expect(callCount).toBe(2)

			state.name = 'updated'
			expect(callCount).toBe(3)

			stop()
		})
		it('should handle multiple watchers on the same object', () => {
			const user = reactive({ name: 'John', age: 30 })
			let watcher1Calls = 0
			let watcher2Calls = 0

			const stop1 = watch(user, () => {
				watcher1Calls++
			})

			const stop2 = watch(user, () => {
				watcher2Calls++
			})

			user.name = 'Jane'
			expect(watcher1Calls).toBe(1)
			expect(watcher2Calls).toBe(1)

			user.age = 31
			expect(watcher1Calls).toBe(2)
			expect(watcher2Calls).toBe(2)

			stop1()
			stop2()
		})

		it('should stop watching when cleanup is called', () => {
			const user = reactive({ name: 'John', age: 30 })
			let callCount = 0

			const stop = watch(user, () => {
				callCount++
			})

			user.name = 'Jane'
			expect(callCount).toBe(1)

			stop()

			user.age = 31
			expect(callCount).toBe(1) // Should not increment after stop
		})

		it('should handle non-reactive objects gracefully', () => {
			const plainObject = { name: 'John', age: 30 }
			let callCount = 0

			// This should not throw but also not trigger
			const stop = watch(plainObject, () => {
				callCount++
			})

			plainObject.name = 'Jane'
			expect(callCount).toBe(0) // Should not trigger for non-reactive objects

			stop()
		})

		it('should watch property additions and deletions', () => {
			const state = reactive({ name: 'John' }) as any
			let callCount = 0

			const stop = watch(state, () => {
				callCount++
			})

			// Add new property
			state.age = 30
			expect(callCount).toBe(1)

			// Delete property
			delete state.age
			expect(callCount).toBe(2)

			stop()
		})

		it('should watch reactive array mutations (currently fails)', () => {
			const state = reactive([1, 2, 3])
			let callCount = 0

			const stop = watch(state, () => {
				callCount++
			})

			// These should trigger watch but currently don't
			state.push(4)
			expect(callCount).toBe(1)

			state[0] = 10
			expect(callCount).toBe(2)

			state[5] = 10
			expect(callCount).toBe(3)

			stop()
		})

		it('should watch reactive array length changes (currently fails)', () => {
			const state = reactive([1, 2, 3])
			let callCount = 0

			const stop = watch(state, () => {
				callCount++
			})

			state.length = 2
			expect(callCount).toBe(1)

			stop()
		})

		it('should watch nested object properties in arrays (simplified)', () => {
			// This test demonstrates the core deep watch bug: nested object property changes in arrays
			@reactive
			class TestClass {
				public items: { name: string; count: number }[] = []

				addItem(name: string) {
					this.items.push({ name, count: 1 })
				}

				incrementCount(name: string) {
					const item = this.items.find((i) => i.name === name)
					if (item) item.count++
				}
			}

			const obj = new TestClass()
			let callCount = 0

			const stop = watch(
				() => obj.items,
				() => callCount++,
				{ deep: true }
			)

			expect(callCount).toBe(0)

			// Adding new items works
			obj.addItem('wood')
			expect(callCount).toBe(1)

			// But modifying existing object properties doesn't trigger deep watch
			obj.incrementCount('wood')
			expect(callCount).toBe(2) // This fails - deep watch doesn't detect nested property changes

			stop()
		})
		it('should watch computed properties that return new objects (without computed)', () => {
			// This test shows the same issue but with @computed for comparison
			@reactive
			class TestClass {
				public slots: { item: string; count: number }[] = []

				addItem(item: string) {
					this.slots.push({ item, count: 1 })
				}

				incrementCount(item: string) {
					const slot = this.slots.find((s) => s.item === item)
					if (slot) slot.count++
				}

				get summary(): { [k: string]: number } {
					const result: { [k: string]: number } = {}
					for (const slot of this.slots) {
						result[slot.item] = slot.count
					}
					return result
				}
			}

			const obj = new TestClass()
			let callCount = 0

			// Watch the computed property that returns new objects
			const stop = watch(
				() => obj.summary,
				() => callCount++,
				{ deep: true }
			)

			expect(callCount).toBe(0)

			// First change should trigger
			obj.addItem('wood')
			expect(callCount).toBe(1)

			// Second change should trigger
			obj.addItem('stone')
			expect(callCount).toBe(2)

			// Third change should trigger but doesn't (this is the bug)
			obj.incrementCount('wood')
			expect(callCount).toBe(3)

			stop()
		})

		it('should watch nested object properties in objects (not arrays)', () => {
			// Test if the issue is specific to arrays or also affects nested objects
			@reactive
			class TestClass {
				public data: { wood: { count: number }; stone: { count: number } } = {
					wood: { count: 1 },
					stone: { count: 1 },
				}

				incrementCount(item: string) {
					if (this.data[item as keyof typeof this.data]) {
						this.data[item as keyof typeof this.data].count++
					}
				}
			}

			const obj = new TestClass()
			let callCount = 0

			const stop = watch(
				() => obj.data,
				() => callCount++,
				{ deep: true }
			)

			expect(callCount).toBe(0)

			// This should trigger the watch
			obj.incrementCount('wood')
			expect(callCount).toBe(1) // Does this work with nested objects?

			stop()
		})

		it('should watch array property changes with direct access (not methods)', () => {
			// Test if the issue is about method calls vs direct property access
			@reactive
			class TestClass {
				public items: { name: string; count: number }[] = []
			}

			const obj = new TestClass()
			let callCount = 0

			const stop = watch(
				() => obj.items,
				() => callCount++,
				{ deep: true }
			)

			expect(callCount).toBe(0)

			// Add item directly (not through method)
			obj.items.push({ name: 'wood', count: 1 })
			expect(callCount).toBe(1)

			// Modify property directly (not through method)
			obj.items[0].count++
			expect(callCount).toBe(2) // Does this work with direct access?

			stop()
		})

		it('should watch array element access vs find method (hypothesis test)', () => {
			// Test the hypothesis: find() method doesn't track individual elements
			@reactive
			class TestClass {
				public items: { name: string; count: number }[] = []

				addItem(name: string) {
					this.items.push({ name, count: 1 })
				}

				// Method 1: Using find() - should fail
				incrementWithFind(name: string) {
					const item = this.items.find((i) => i.name === name)
					if (item) item.count++
				}

				// Method 2: Using direct index access - should work
				incrementWithIndex(name: string) {
					const index = this.items.findIndex((i) => i.name === name)
					if (index >= 0) this.items[index].count++
				}
			}

			const obj = new TestClass()
			obj.addItem('wood')
			obj.addItem('stone')

			let callCount = 0

			const stop = watch(
				() => obj.items,
				() => callCount++,
				{ deep: true }
			)

			expect(callCount).toBe(0)

			// This should fail (find() doesn't track individual elements)
			obj.incrementWithFind('wood')
			expect(callCount).toBe(1) // This will likely fail

			// This should work (direct index access tracks the element)
			obj.incrementWithIndex('stone')
			expect(callCount).toBe(2) // This should pass

			stop()
		})

		it('should watch new added objects', () => {
			const state = reactive({ x: null }) as any
			let callCount = 0
			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)
			state.x = { y: 1 }
			expect(callCount).toBe(1)
			state.x.y = 2
			expect(callCount).toBe(2)
			stop()
		})
	})

	describe('watch edge cases', () => {
		it('should handle undefined and null values', () => {
			const state = reactive({ value: undefined as any })
			let callCount = 0
			let lastValue: any

			const stop = watch(
				() => state.value,
				(newValue) => {
					lastValue = newValue
					callCount++
				}
			)

			state.value = null
			expect(callCount).toBe(1)
			expect(lastValue).toBe(null)

			state.value = 'test'
			expect(callCount).toBe(2)
			expect(lastValue).toBe('test')

			stop()
		})

		it('should handle circular references in object watching', () => {
			const state = reactive({ name: 'John' }) as any
			state.self = state // Create circular reference
			let callCount = 0

			const stop = watch(state, () => {
				callCount++
			})

			state.name = 'Jane'
			expect(callCount).toBe(1)

			stop()
		})

		it('should handle rapid successive changes', () => {
			const state = reactive({ count: 0 })
			let callCount = 0
			let lastValue: number | undefined

			const stop = watch(
				() => state.count,
				(newValue) => {
					lastValue = newValue
					callCount++
				}
			)

			// Rapid changes
			state.count = 1
			state.count = 2
			state.count = 3
			state.count = 4
			state.count = 5

			expect(callCount).toBe(5)
			expect(lastValue).toBe(5)

			stop()
		})

		it('should handle watching during effect execution', () => {
			const state = reactive({ count: 0, multiplier: 2 })
			let watchCalls = 0
			let effectCalls = 0

			const stopWatch = watch(
				() => state.multiplier,
				() => {
					watchCalls++
				}
			)

			const stopEffect = effect(() => {
				effectCalls++
				// Change watched value during effect
				state.count = state.count + 1
			})

			expect(effectCalls).toBe(1)
			expect(watchCalls).toBe(0) // Should trigger once during effect

			state.multiplier = 3
			expect(effectCalls).toBe(1)
			expect(watchCalls).toBe(1) // Should trigger again

			stopWatch()
			stopEffect()
		})
	})
})

describe('deep watch via watch({ deep: true })', () => {
	describe('basic deep watching functionality', () => {
		it('should watch nested object property changes', () => {
			const state = reactive({
				user: {
					name: 'John',
					profile: { age: 30 },
				},
			})
			let callCount = 0

			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			state.user.name = 'Jane'
			expect(callCount).toBe(1)

			state.user.profile.age = 31
			expect(callCount).toBe(2)

			stop()
		})

		it('should watch array changes when object contains arrays', () => {
			const state = reactive({
				items: [1, 2, 3],
				name: 'test',
			})
			let callCount = 0

			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			state.items.push(4)
			expect(callCount).toBe(1)

			state.items[0] = 10
			expect(callCount).toBe(2)

			state.name = 'updated'
			expect(callCount).toBe(3)

			stop()
		})

		it('should handle object replacement correctly', () => {
			const state = reactive({
				user: {
					name: 'John',
					profile: { age: 30 },
				},
			})
			let callCount = 0

			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			// Replace the entire user object
			state.user = { name: 'Jane', profile: { age: 25 } }
			expect(callCount).toBe(1)

			// Changes to the new user object should trigger
			state.user.name = 'Bob'
			expect(callCount).toBe(2)

			state.user.profile.age = 26
			expect(callCount).toBe(3)

			stop()
		})

		it('should handle immediate option', () => {
			const state = reactive({
				user: {
					name: 'John',
					profile: { age: 30 },
				},
			})
			let callCount = 0

			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ immediate: true, deep: true }
			)

			// Should trigger immediately
			expect(callCount).toBe(1)

			state.user.name = 'Jane'
			expect(callCount).toBe(2)

			stop()
		})

		it('should handle multiple deep watchers on the same object', () => {
			const state = reactive({
				user: {
					name: 'John',
					profile: { age: 30 },
				},
			})
			let watcher1Calls = 0
			let watcher2Calls = 0

			const stop1 = watch(
				state,
				() => {
					watcher1Calls++
				},
				{ deep: true }
			)

			const stop2 = watch(
				state,
				() => {
					watcher2Calls++
				},
				{ deep: true }
			)

			state.user.name = 'Jane'
			expect(watcher1Calls).toBe(1)
			expect(watcher2Calls).toBe(1)

			state.user.profile.age = 31
			expect(watcher1Calls).toBe(2)
			expect(watcher2Calls).toBe(2)

			stop1()
			stop2()
		})

		it('should stop watching when cleanup is called', () => {
			const state = reactive({
				user: {
					name: 'John',
					profile: { age: 30 },
				},
			})
			let callCount = 0

			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			state.user.name = 'Jane'
			expect(callCount).toBe(1)

			stop()

			state.user.profile.age = 31
			expect(callCount).toBe(1) // Should not increment after stop
		})

		it('should handle circular references', () => {
			const state = reactive({ name: 'John' }) as any
			state.self = state // Create circular reference
			let callCount = 0

			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			state.name = 'Jane'
			expect(callCount).toBe(1)

			stop()
		})

		it('should handle deeply nested objects', () => {
			const state = reactive({
				level1: {
					level2: {
						level3: {
							level4: {
								value: 'deep',
							},
						},
					},
				},
			})
			let callCount = 0

			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			state.level1.level2.level3.level4.value = 'deeper'
			expect(callCount).toBe(1)

			stop()
		})
	})

	describe('performance and edge cases', () => {
		it('should handle large object graphs efficiently', () => {
			// Create a large object graph
			const state = reactive({ items: [] as any[] })
			for (let i = 0; i < 100; i++) {
				state.items.push({ id: i, nested: { value: i * 2 } })
			}

			let callCount = 0
			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			// Change one item
			state.items[50].nested.value = 999
			// deep reactivity should be in touch, not `set`
			expect(callCount).toBe(1)

			stop()
		})

		it('should trigger deep watch when pushing objects to reactive array', () => {
			const state = reactive({ items: [] as any[] })

			let callCount = 0
			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			// Push an object with nested properties
			state.items.push({ id: 1, nested: { value: 'test' } })

			// This should trigger deep watch because we're adding a new object to the array
			// If this fails, it means push() is not properly tracking deep changes
			expect(callCount).toBe(1)

			state.items[0].nested.value = 'updated'
			expect(callCount).toBe(2)

			stop()
		})

		it('should trigger deep watch when pushing nested objects to reactive array', () => {
			const state = reactive({ items: [] as any[] })

			let callCount = 0
			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			// Push a nested object
			state.items.push({
				id: 1,
				data: {
					config: {
						enabled: true,
					},
				},
			})

			// This should trigger deep watch because we're adding a deeply nested object
			// If this fails, it means push() is not properly tracking deep changes for nested objects
			expect(callCount).toBe(1)

			stop()
		})

		it('should handle native operations', () => {
			// Create a large object graph
			const state = reactive({ items: [] as any[] })

			let callCount = 0
			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			expect(callCount).toBe(0)
			state.items.push({ nested: { value: 0 } })

			expect(callCount).toBe(1)
			// Change one item
			state.items[0].nested.value = 999
			// deep reactivity should be in touch, not `set`
			expect(callCount).toBe(2)

			stop()
		})

		it('should follow native operations', () => {
			// Create a large object graph
			const state = reactive({ items: [] as any[] })
			const item = reactive({ value: 0 })

			let callCount = 0
			const stop = watch(
				state,
				() => {
					callCount++
				},
				{ deep: true }
			)

			expect(callCount).toBe(0)

			state.items.push(item)
			//state.items[0] = item

			expect(callCount).toBe(1)
			// Change one item
			item.value = 999
			// deep reactivity should be in touch, not `set`
			expect(callCount).toBe(2)

			stop()
		})

		it('should handle non-reactive objects gracefully', () => {
			const plainObject = {
				user: {
					name: 'John',
					profile: { age: 30 },
				},
			}
			let callCount = 0

			// This should not throw but also not trigger
			const stop = watch(
				plainObject as any,
				() => {
					callCount++
				},
				{ deep: true }
			)

			plainObject.user.name = 'Jane'
			expect(callCount).toBe(0) // Should not trigger for non-reactive objects

			stop()
		})
	})

	describe('minimal deep watch failure example', () => {
		it('MINIMAL: watch should detect array mutations', () => {
			const state = reactive({
				items: [1, 2, 3],
			})

			let callCount = 0

			// This is the minimal failing case
			const stopWatch = watch(
				state,
				() => {
					callCount++
				},
				{ immediate: true, deep: true }
			)

			expect(callCount).toBe(1) // Initial call

			// This should trigger the watch but doesn't
			state.items.push(4)
			expect(callCount).toBe(2) // FAILS: Expected 2, Received 1

			stopWatch()
		})

		it('MINIMAL: deep watch should detect array mutations', () => {
			const state = reactive({
				items: [1, 2, 3],
			})

			let callCount = 0

			// Even with deep: true, this fails
			const stopWatch = watch(
				state,
				() => {
					callCount++
				},
				{ immediate: true, deep: true }
			)

			expect(callCount).toBe(1) // Initial call

			// This should trigger the deep watch but doesn't
			state.items.push(4)
			expect(callCount).toBe(2) // FAILS: Expected 2, Received 1

			stopWatch()
		})

		it('COMPARISON: effect with length DOES detect array mutations', () => {
			const state = reactive({
				items: [1, 2, 3],
			})

			let effectCount = 0

			// This works - effect detects array mutations when we access length
			const stopEffect = effect(() => {
				effectCount++
				state.items.length // Access the array length
			})

			expect(effectCount).toBe(1) // Initial call

			// This DOES trigger the effect because push changes length
			state.items.push(4)
			expect(effectCount).toBe(2) // Should PASS

			stopEffect()
		})

		it('DEBUG: what happens with just array access', () => {
			const state = reactive({
				items: [1, 2, 3],
			})

			let effectCount = 0

			// What happens when we just access the array reference?
			const stopEffect = effect(() => {
				effectCount++
				state.items // Just access the array reference
			})

			expect(effectCount).toBe(1) // Initial call

			// Does this trigger? It shouldn't, because we didn't access any properties
			state.items.push(4)
			expect(effectCount).toBe(1) // Should stay 1

			stopEffect()
		})
	})

	describe('deep watching Sets and Maps', () => {
		it('should detect Set mutations with deep watch', () => {
			const state = reactive({
				mySet: new Set([1, 2, 3]),
			})

			let callCount = 0

			const stopWatch = watch(
				state,
				() => {
					callCount++
				},
				{ immediate: true, deep: true }
			)

			expect(callCount).toBe(1) // Initial call

			// Test Set mutations
			state.mySet.add(4)
			expect(callCount).toBe(2) // Might fail

			state.mySet.delete(1)
			expect(callCount).toBe(3) // Might fail

			stopWatch()
		})

		it('should detect Map mutations with deep watch', () => {
			const state = reactive({
				myMap: new Map([
					['a', 1],
					['b', 2],
				]),
			})

			let callCount = 0

			const stopWatch = watch(
				state,
				() => {
					callCount++
				},
				{ immediate: true, deep: true }
			)

			expect(callCount).toBe(1) // Initial call

			// Test Map mutations
			state.myMap.set('c', 3)
			expect(callCount).toBe(2) // Might fail

			state.myMap.delete('a')
			expect(callCount).toBe(3) // Might fail

			stopWatch()
		})

		it('should detect Map value changes with deep watch', () => {
			const state = reactive({
				myMap: new Map([
					['a', 1],
					['b', 2],
				]),
			})

			let callCount = 0

			const stopWatch = watch(
				state,
				() => {
					callCount++
				},
				{ immediate: true, deep: true }
			)

			expect(callCount).toBe(1) // Initial call

			// Test Map value changes
			state.myMap.set('a', 10)
			expect(callCount).toBe(2) // Might fail

			stopWatch()
		})

		it('should detect nested Set/Map mutations with deep watch', () => {
			const state = reactive({
				container: {
					mySet: new Set([1, 2, 3]),
					myMap: new Map([
						['x', 1],
						['y', 2],
					]),
				},
			})

			let callCount = 0

			const stopWatch = watch(
				state,
				() => {
					callCount++
				},
				{ immediate: true, deep: true }
			)

			expect(callCount).toBe(1) // Initial call

			// Test nested Set mutations
			state.container.mySet.add(4)
			expect(callCount).toBe(2) // Might fail

			// Test nested Map mutations
			state.container.myMap.set('z', 3)
			expect(callCount).toBe(3) // Might fail

			stopWatch()
		})

		// Note: WeakSet and WeakMap cannot be deeply reactive because they don't support iteration
		// They can only have shallow reactivity (tracking when the collection itself changes)
	})

	describe('computed.values', () => {
		it('should create a reactive mapped array', () => {
			const input = reactive([1, 2, 3])
			const mapped = computed.values(input, ({ value }) => value * 2)

			expect(unwrap(mapped)).toEqual([2, 4, 6])
			expect(Array.isArray(mapped)).toBe(true)
		})

		it('should update when input array changes', () => {
			const input = reactive([1, 2, 3])
			const mapped = computed.values(input, ({ value }) => value * 2)

			expect(unwrap(mapped)).toEqual([2, 4, 6])

			input.push(4)
			expect(unwrap(mapped)).toEqual([2, 4, 6, 8])

			input[0] = 10
			expect(unwrap(mapped)).toEqual([20, 4, 6, 8])
		})

		it('should provide index in compute function', () => {
			const input = reactive([10, 20, 30])
			const mapped = computed.values(input, ({ value, index }) => `[${index}]: ${value}`)

			expect(unwrap(mapped)).toEqual(['[0]: 10', '[1]: 20', '[2]: 30'])

			input.push(40)
			expect(mapped[3]).toBe('[3]: 40')
		})

		it('should provide array reference in compute function', () => {
			const input = reactive([1, 2, 3])
			const mapped = computed.values(
				input,
				({ value, array }) => `${value} (total: ${array.length})`
			)

			expect(unwrap(mapped)).toEqual(['1 (total: 3)', '2 (total: 3)', '3 (total: 3)'])

			input.push(4)
			expect(unwrap(mapped)).toEqual([
				'1 (total: 4)',
				'2 (total: 4)',
				'3 (total: 4)',
				'4 (total: 4)',
			])
		})

		it('should handle empty arrays', () => {
			const input = reactive([])
			const mapped = computed.values(input, ({ value }) => value * 2)

			expect(unwrap(mapped)).toEqual([])
			expect(mapped.length).toBe(0)
		})

		it('should track compute function call count', () => {
			const input = reactive([1, 2, 3])
			let computeCount = 0
			const mapped = computed.values(input, ({ value }) => {
				computeCount++
				return value * 2
			})

			expect(unwrap(mapped)).toEqual([2, 4, 6])
			expect(computeCount).toBe(3) // Initial computation for 3 items

			// Modify one item - should recompute only that item
			input[0] = 10
			expect(mapped[0]).toBe(20)
			expect(computeCount).toBe(4) // One more computation

			// Modify another item
			input[1] = 20
			expect(mapped[1]).toBe(40)
			expect(computeCount).toBe(5) // One more computation
		})

		it('should track effect count when input array length changes', () => {
			const input = reactive([1, 2, 3])
			let computeCount = 0
			let effectCount = 0

			const mapped = computed.values(input, ({ value }) => {
				computeCount++
				return value * 2
			})

			// Track effects that watch the mapped array
			effect(() => {
				effectCount++
				mapped.length // Access length to track it
			})

			expect(computeCount).toBe(3) // Initial computation
			expect(effectCount).toBe(1) // Initial effect

			// Add item should trigger effect
			input.push(4)
			expect(computeCount).toBe(4) // One more computation for new item
			expect(effectCount).toBe(2) // Effect triggered by length change

			// Remove item should trigger effect
			input.pop()
			expect(computeCount).toBe(4) // Nothing computed
			expect(effectCount).toBe(3) // Effect triggered by length change
		})

		it('should track effect count when watching mapped values', () => {
			const input = reactive([1, 2, 3])
			let computeCount = 0
			let effectCount = 0

			const mapped = computed.values(input, ({ value }) => {
				computeCount++
				return value * 2
			})

			// Track effects that watch the mapped values
			effect(() => {
				effectCount++
				// Access mapped values to track them
				mapped.forEach((v) => v)
			})

			expect(computeCount).toBe(3) // Initial computation
			expect(effectCount).toBe(1) // Initial effect

			// Modify input should trigger effect
			input[0] = 10
			expect(computeCount).toBe(4) // One more computation
			expect(effectCount).toBe(2) // Effect triggered by value change

			// Modify another input should trigger effect
			input[1] = 20
			expect(computeCount).toBe(5) // One more computation
			expect(effectCount).toBe(3) // Effect triggered by value change
		})

		it('should track effect count for complex transformations', () => {
			const users = reactive([
				{ name: 'John', age: 30 },
				{ name: 'Jane', age: 25 },
			])
			let computeCount = 0
			let effectCount = 0

			const mapped = computed.values(users, ({ value: user }) => {
				computeCount++
				return `${user.name} (${user.age})`
			})

			effect(() => {
				effectCount++
				mapped.forEach((v) => v)
			})

			expect(computeCount).toBe(2) // Initial computation for 2 users
			expect(effectCount).toBe(1) // Initial effect

			// Modify user property
			users[0].age = 31
			expect(computeCount).toBe(3) // One more computation for modified user
			expect(effectCount).toBe(2) // Effect triggered by value change

			// Add new user
			users.push({ name: 'Bob', age: 35 })
			expect(computeCount).toBe(4) // One more computation for new user
			expect(effectCount).toBe(3) // Effect triggered by length change
		})
	})
})
