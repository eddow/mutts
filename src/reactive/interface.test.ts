import {
	computed,
	effect,
	reactive,
	watch,
} from './index'

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

			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

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

			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

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

			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

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

			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

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

			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

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

			const stop1 = watch(state, () => {
				watcher1Calls++
			}, { deep: true })

			const stop2 = watch(state, () => {
				watcher2Calls++
			}, { deep: true })

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

			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

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

			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

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

			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

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
			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

			// Change one item
			state.items[50].nested.value = 999
			// deep reactivity should be in touch, not `set`
			expect(callCount).toBe(1)

			stop()
		})

		it('should trigger deep watch when pushing objects to reactive array', () => {
			const state = reactive({ items: [] as any[] })

			let callCount = 0
			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

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
			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

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
			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

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
			const stop = watch(state, () => {
				callCount++
			}, { deep: true })

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
			const stop = watch(plainObject as any, () => {
				callCount++
			}, { deep: true })

			plainObject.user.name = 'Jane'
			expect(callCount).toBe(0) // Should not trigger for non-reactive objects

			stop()
		})
	})
})
