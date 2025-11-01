import { atomic, effect, reactive } from 'mutts/reactive'

describe('@atomic decorator', () => {
	describe('basic functionality', () => {
		it('should batch effects when method is called', () => {
			const state = reactive({ a: 0, b: 0, c: 0 })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.a
				state.b
				state.c
			})

			class TestClass {
				@atomic
				updateMultiple() {
					state.a = 1
					state.b = 2
					state.c = 3
				}
			}

			const instance = new TestClass()

			expect(effectCount).toBe(1) // Initial effect run

			instance.updateMultiple()
			expect(effectCount).toBe(2) // Only one additional run despite 3 changes
			expect(state.a).toBe(1)
			expect(state.b).toBe(2)
			expect(state.c).toBe(3)
		})

		it('should work with reactive class instances', () => {
			@reactive
			class Counter {
				value = 0
				multiplier = 1

				@atomic
				updateBoth(newValue: number, newMultiplier: number) {
					this.value = newValue
					this.multiplier = newMultiplier
				}
			}

			const counter = new Counter()
			let effectCount = 0

			effect(() => {
				effectCount++
				counter.value
				counter.multiplier
			})

			expect(effectCount).toBe(1)

			counter.updateBoth(5, 2)
			expect(effectCount).toBe(2) // Only one additional run despite 2 changes
			expect(counter.value).toBe(5)
			expect(counter.multiplier).toBe(2)
		})

		it('should batch effects from nested reactive objects', () => {
			const state = reactive({
				user: { name: 'John', age: 30 },
				settings: { theme: 'dark', notifications: true },
			})

			let userEffectCount = 0
			let settingsEffectCount = 0

			effect(() => {
				userEffectCount++
				state.user.name
				state.user.age
			})

			effect(() => {
				settingsEffectCount++
				state.settings.theme
				state.settings.notifications
			})

			class TestClass {
				updateUser() {
					state.user.name = 'Jane'
					state.user.age = 25
				}

				updateSettings() {
					state.settings.theme = 'light'
					state.settings.notifications = false
				}

				@atomic
				updateBoth() {
					// Call non-atomic methods to batch all changes together
					this.updateUser()
					this.updateSettings()
				}
			}

			const instance = new TestClass()

			expect(userEffectCount).toBe(1)
			expect(settingsEffectCount).toBe(1)

			instance.updateBoth()
			expect(userEffectCount).toBe(2) // Only one additional run
			expect(settingsEffectCount).toBe(2) // Only one additional run
		})
	})

	describe('effect batching behavior', () => {
		it('should execute function immediately but batch effects', () => {
			const state = reactive({ a: 0, b: 0 })
			const executionOrder: string[] = []

			effect(() => {
				executionOrder.push(`effect: a=${state.a}, b=${state.b}`)
			})

			class TestClass {
				@atomic
				updateAndLog() {
					executionOrder.push('before: a=0, b=0')
					state.a = 1
					executionOrder.push('after a=1')
					state.b = 2
					executionOrder.push('after b=2')
				}
			}

			const instance = new TestClass()

			expect(executionOrder).toEqual(['effect: a=0, b=0'])

			instance.updateAndLog()
			expect(executionOrder).toEqual([
				'effect: a=0, b=0',
				'before: a=0, b=0',
				'after a=1',
				'after b=2',
				'effect: a=1, b=2', // Effect runs after all changes are complete
			])
		})

		it('should handle cascading effects within atomic method', () => {
			const state = reactive({ a: 0, b: 0, c: 0 })

			// Create cascading effects
			effect(() => {
				state.b = state.a + 1
			})
			effect(() => {
				state.c = state.b + 1
			})

			let finalEffectCount = 0
			effect(() => {
				finalEffectCount++
				state.c
			})

			class TestClass {
				@atomic
				triggerCascade() {
					state.a = 5
				}
			}

			const instance = new TestClass()

			expect(state.a).toBe(0)
			expect(state.b).toBe(1)
			expect(state.c).toBe(2)
			expect(finalEffectCount).toBe(1)

			instance.triggerCascade()
			// All cascading effects should be batched
			expect(state.a).toBe(5)
			expect(state.b).toBe(6)
			expect(state.c).toBe(7)
			expect(finalEffectCount).toBe(2) // Only one additional run despite cascading changes
		})

		it('should batch effects when calling multiple atomic methods', () => {
			const state = reactive({ a: 0, b: 0, c: 0 })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.a
				state.b
				state.c
			})

			class TestClass {
				@atomic
				updateA() {
					state.a = 1
				}

				@atomic
				updateB() {
					state.b = 2
				}

				@atomic
				updateC() {
					state.c = 3
				}

				@atomic
				updateAll() {
					// This method batches all changes together
					state.a = 1
					state.b = 2
					state.c = 3
				}
			}

			const instance = new TestClass()

			expect(effectCount).toBe(1)

			// Call multiple atomic methods in sequence - each creates its own batch
			instance.updateA()
			expect(effectCount).toBe(2) // Each atomic method triggers its own effect run
			instance.updateB()
			expect(effectCount).toBe(3)
			instance.updateC()
			expect(effectCount).toBe(4)

			expect(state.a).toBe(1)
			expect(state.b).toBe(2)
			expect(state.c).toBe(3)

			// Reset and test a single atomic method that does all changes
			state.a = 0
			state.b = 0
			state.c = 0
			effectCount = 1 // Reset to initial state

			instance.updateAll()
			expect(effectCount).toBe(2) // Only one additional run despite 3 changes
		})
	})

	describe('nested atomic methods', () => {
		it('should handle nested atomic method calls', () => {
			const state = reactive({ a: 0, b: 0, c: 0 })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.a
				state.b
				state.c
			})

			class TestClass {
				updateA() {
					state.a = 1
				}

				updateB() {
					state.b = 2
				}

				@atomic
				updateAll() {
					// Call non-atomic methods to batch all changes together
					this.updateA()
					this.updateB()
					state.c = 3
				}
			}

			const instance = new TestClass()

			expect(effectCount).toBe(1)

			instance.updateAll()
			expect(effectCount).toBe(2) // Only one additional run despite multiple changes
			expect(state.a).toBe(1)
			expect(state.b).toBe(2)
			expect(state.c).toBe(3)
		})

		it('should handle deeply nested atomic method calls', () => {
			const state = reactive({ a: 0, b: 0, c: 0, d: 0 })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.a
				state.b
				state.c
				state.d
			})

			class TestClass {
				updateA() {
					state.a = 1
				}

				updateB() {
					state.b = 2
				}

				updateAB() {
					this.updateA()
					this.updateB()
				}

				updateCD() {
					state.c = 3
					state.d = 4
				}

				@atomic
				updateAll() {
					// Call non-atomic methods to batch all changes together
					this.updateAB()
					this.updateCD()
				}
			}

			const instance = new TestClass()

			expect(effectCount).toBe(1)

			instance.updateAll()
			expect(effectCount).toBe(2) // Only one additional run
			expect(state.a).toBe(1)
			expect(state.b).toBe(2)
			expect(state.c).toBe(3)
			expect(state.d).toBe(4)
		})
	})

	describe('error handling', () => {
		it('should handle errors in atomic methods', () => {
			const state = reactive({ a: 0, b: 0 })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.a
				state.b
			})

			class TestClass {
				@atomic
				updateWithError() {
					state.a = 1
					expect(effectCount).toBe(1) // Effects don't run during atomic method
					throw new Error('Test error')
					//biome-ignore lint/correctness/noUnreachable: This line should not execute
					state.b = 2
				}

				@atomic
				updateNormal() {
					state.b = 3
					expect(effectCount).toBe(1) // Effects don't run during atomic method
				}
			}

			const instance = new TestClass()

			expect(effectCount).toBe(1)

			// First method should throw error
			expect(() => {
				instance.updateWithError()
			}).toThrow('Test error')

			// Effects don't run when atomic method throws an error
			expect(effectCount).toBe(1)
			expect(state.a).toBe(1) // Change was made before error
			expect(state.b).toBe(0) // Should remain unchanged due to error

			// Second method should work normally
			instance.updateNormal()
			expect(effectCount).toBe(2) // Effects run after successful atomic method
			expect(state.b).toBe(3)
		})

		it('should handle errors in nested atomic methods', () => {
			const state = reactive({ a: 0, b: 0, c: 0 })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.a
				state.b
				state.c
			})

			class TestClass {
				updateA() {
					state.a = 1
				}

				updateBWithError() {
					state.b = 2
					throw new Error('Nested error')
				}

				@atomic
				outerUpdate() {
					this.updateA()
					this.updateBWithError()
					state.c = 3
				}
			}

			const instance = new TestClass()

			expect(effectCount).toBe(1)

			expect(() => instance.outerUpdate()).toThrow('Nested error')
			// Only changes before error should be applied
			expect(state.a).toBe(1)
			expect(state.b).toBe(2)
			expect(state.c).toBe(0)
			expect(effectCount).toBe(1)
		})
	})
})
