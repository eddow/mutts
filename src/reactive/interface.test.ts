import { computed, effect, reactive, watch } from './index'

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
})
