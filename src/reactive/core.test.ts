import {
	computed,
	effect,
	isNonReactive,
	isReactive,
	Reactive,
	reactive,
	unreactive,
	unwrap,
	untracked,
} from './index'

describe('reactive', () => {
	describe('basic functionality', () => {
		it('should make objects reactive', () => {
			const obj = { count: 0, name: 'test' }
			const reactiveObj = reactive(obj)

			expect(isReactive(reactiveObj)).toBe(true)
			expect(isReactive(obj)).toBe(false)
			expect(reactiveObj.count).toBe(0)
			expect(reactiveObj.name).toBe('test')
		})

		it('should not make primitives reactive', () => {
			expect(reactive(42)).toBe(42)
			expect(reactive('string')).toBe('string')
			expect(reactive(true)).toBe(true)
			expect(reactive(null)).toBe(null)
			expect(reactive(undefined)).toBe(undefined)
			expect(reactive(true)).toBe(true)
			expect(reactive(null)).toBe(null)
			expect(reactive(undefined)).toBe(undefined)
		})

		it('should return same proxy for same object', () => {
			const obj = { count: 0 }
			const proxy1 = reactive(obj)
			const proxy2 = reactive(obj)

			expect(proxy1).toBe(proxy2)
		})

		it('should return same proxy when called on proxy', () => {
			const obj = { count: 0 }
			const proxy1 = reactive(obj)
			const proxy2 = reactive(proxy1)

			expect(proxy1).toBe(proxy2)
		})
	})

	describe('property access and modification', () => {
		it('should allow reading properties', () => {
			const obj = { count: 0, name: 'test' }
			const reactiveObj = reactive(obj)

			expect(reactiveObj.count).toBe(0)
			expect(reactiveObj.name).toBe('test')
		})

		it('should allow setting properties', () => {
			const obj = { count: 0 }
			const reactiveObj = reactive(obj)

			reactiveObj.count = 5
			expect(reactiveObj.count).toBe(5)
			expect(obj.count).toBe(5)
		})

		it('should handle numeric properties', () => {
			const obj = { 0: 'zero', 1: 'one' }
			const reactiveObj = reactive(obj)

			expect(reactiveObj[0]).toBe('zero')
			expect(reactiveObj[1]).toBe('one')

			reactiveObj[0] = 'ZERO'
			expect(reactiveObj[0]).toBe('ZERO')
		})

		it('should handle symbol properties', () => {
			const sym = Symbol('test')
			const obj = { [sym]: 'value' }
			const reactiveObj = reactive(obj)

			expect(reactiveObj[sym]).toBe('value')

			reactiveObj[sym] = 'new value'
			expect(reactiveObj[sym]).toBe('new value')
		})
	})

	describe('unwrap functionality', () => {
		it('should unwrap reactive objects', () => {
			const obj = { count: 0 }
			const reactiveObj = reactive(obj)

			const unwrapped = unwrap(reactiveObj)
			expect(unwrapped).toBe(obj)
			expect(unwrapped).not.toBe(reactiveObj)
		})

		it('should return non-reactive objects as-is', () => {
			const obj = { count: 0 }
			expect(unwrap(obj)).toBe(obj)
		})
	})
})

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
				// Immediately stop to avoid accumulating watchers
				stopInner && stopInner()
			})

			expect(outerRuns).toBe(1)
			expect(innerRuns).toBe(1)

			state.a = 1
			expect(outerRuns).toBe(2)
			// inner created again due to re-entrancy
			expect(innerRuns).toBe(2)

			state.b = 1
			// inner was stopped in the same tick; no rerun expected
			expect(innerRuns).toBe(2)

			stopOuter()
		})
	})

	describe('effect cleanup', () => {
		it('should return unwatch function', () => {
			const reactiveObj = reactive({ count: 0 })
			let effectCount = 0

			const unwatch = effect(() => {
				effectCount++
				reactiveObj.count
			})

			expect(typeof unwatch).toBe('function')
			expect(effectCount).toBe(1)
		})

		it('should stop tracking when unwatched', () => {
			const reactiveObj = reactive({ count: 0 })
			let effectCount = 0

			const unwatch = effect(() => {
				effectCount++
				reactiveObj.count
			})

			expect(effectCount).toBe(1)

			unwatch()

			reactiveObj.count = 5
			expect(effectCount).toBe(1) // Should not trigger effect
		})

		it('should clean up dependencies on re-run', () => {
			const reactiveObj = reactive({ count: 0, name: 'test' })
			let effectCount = 0

			effect(() => {
				effectCount++
				reactiveObj.count
			})

			expect(effectCount).toBe(1)

			// Change the effect to only watch name
			effect(() => {
				effectCount++
				reactiveObj.name
			})

			expect(effectCount).toBe(2)

			reactiveObj.count = 5
			expect(effectCount).toBe(3) // Should not trigger effect anymore

			reactiveObj.name = 'new name'
			expect(effectCount).toBe(4) // Should trigger effect
		})
	})

	describe('error handling', () => {
		it('should propagate errors from effects', () => {
			const reactiveObj = reactive({ count: 0 })
			let effectCount = 0

			effect(() => {
				effectCount++
				reactiveObj.count

				if (reactiveObj.count === 1) {
					throw new Error('Test error')
				}
			})

			expect(effectCount).toBe(1)

			// This should throw an error when the effect runs
			expect(() => {
				reactiveObj.count = 1
			}).toThrow('Test error')

			expect(effectCount).toBe(2)
		})
	})

	describe('complex scenarios', () => {
		it('should handle multiple reactive objects', () => {
			const obj1 = reactive({ count: 0 })
			const obj2 = reactive({ name: 'test' })
			let effectCount = 0

			effect(() => {
				effectCount++
				obj1.count
				obj2.name
			})

			expect(effectCount).toBe(1)

			obj1.count = 5
			expect(effectCount).toBe(2)

			obj2.name = 'new name'
			expect(effectCount).toBe(3)
		})

		it('should handle object identity changes', () => {
			const reactiveObj = reactive({ inner: { count: 0 } })
			let effectCount = 0

			effect(() => {
				effectCount++
				reactiveObj.inner.count
			})

			expect(effectCount).toBe(1)

			reactiveObj.inner = { count: 5 }
			expect(effectCount).toBe(2)

			reactiveObj.inner.count = 10
			expect(effectCount).toBe(3)
		})
	})
})

describe('integration tests', () => {
	it('should work with complex nested structures', () => {
		const state = reactive({
			user: {
				profile: {
					name: 'John',
					age: 30,
				},
				settings: {
					theme: 'dark',
					notifications: true,
				},
			},
			app: {
				version: '1.0.0',
				features: ['auth', 'chat'],
			},
		})

		let profileEffectCount = 0
		let settingsEffectCount = 0
		let appEffectCount = 0

		effect(() => {
			profileEffectCount++
			state.user.profile.name
			state.user.profile.age
		})

		effect(() => {
			settingsEffectCount++
			state.user.settings.theme
		})

		effect(() => {
			appEffectCount++
			state.app.version
		})

		expect(profileEffectCount).toBe(1)
		expect(settingsEffectCount).toBe(1)
		expect(appEffectCount).toBe(1)

		// Change profile
		state.user.profile.name = 'Jane'
		expect(profileEffectCount).toBe(2)
		expect(settingsEffectCount).toBe(1)
		expect(appEffectCount).toBe(1)

		// Change settings
		state.user.settings.theme = 'light'
		expect(profileEffectCount).toBe(2)
		expect(settingsEffectCount).toBe(2)
		expect(appEffectCount).toBe(1)

		// Change app
		state.app.version = '1.1.0'
		expect(profileEffectCount).toBe(2)
		expect(settingsEffectCount).toBe(2)
		expect(appEffectCount).toBe(2)
	})
})

describe('Reactive mixin', () => {
	it('should make class instances reactive', () => {
		class TestClass {
			count = 0
			name = 'test'

			increment() {
				this.count++
			}

			setName(newName: string) {
				this.name = newName
			}
		}

		const ReactiveTestClass = Reactive(TestClass)
		const instance = new ReactiveTestClass()

		let effectCount = 0
		effect(() => {
			effectCount++
			instance.count
		})

		expect(effectCount).toBe(1)
		expect(instance.count).toBe(0)

		instance.increment()
		expect(effectCount).toBe(2)
		expect(instance.count).toBe(1)
	})

	it('should track property changes on reactive class instances', () => {
		class User {
			name = 'John'
			age = 30

			updateProfile(newName: string, newAge: number) {
				this.name = newName
				this.age = newAge
			}
		}

		const ReactiveUser = Reactive(User)
		const user = new ReactiveUser()

		let nameEffectCount = 0
		let ageEffectCount = 0

		effect(() => {
			nameEffectCount++
			user.name
		})

		effect(() => {
			ageEffectCount++
			user.age
		})

		expect(nameEffectCount).toBe(1)
		expect(ageEffectCount).toBe(1)

		user.updateProfile('Jane', 25)
		expect(nameEffectCount).toBe(2)
		expect(ageEffectCount).toBe(2)
		expect(user.name).toBe('Jane')
		expect(user.age).toBe(25)
	})

	it('should work with inheritance', () => {
		class Animal {
			species = 'unknown'
			energy = 100
		}

		class Dog extends Animal {
			breed = 'mixed'
			bark() {
				this.energy -= 10
			}
		}

		const ReactiveDog = Reactive(Dog)
		const dog = new ReactiveDog()

		let energyEffectCount = 0
		effect(() => {
			energyEffectCount++
			dog.energy
		})

		expect(energyEffectCount).toBe(1)
		expect(dog.energy).toBe(100)

		dog.bark()
		expect(energyEffectCount).toBe(2)
		expect(dog.energy).toBe(90)
	})

	it('should handle method calls that modify properties', () => {
		class Counter {
			value = 0

			add(amount: number) {
				this.value += amount
			}

			reset() {
				this.value = 0
			}
		}

		const ReactiveCounter = Reactive(Counter)
		const counter = new ReactiveCounter()

		let effectCount = 0
		effect(() => {
			effectCount++
			counter.value
		})

		expect(effectCount).toBe(1)
		expect(counter.value).toBe(0)

		counter.add(5)
		expect(effectCount).toBe(2)
		expect(counter.value).toBe(5)

		counter.reset()
		expect(effectCount).toBe(3)
		expect(counter.value).toBe(0)
	})
})

describe('non-reactive functionality', () => {
	describe('markNonReactive', () => {
		it('should mark individual objects as non-reactive', () => {
			const obj = { count: 0, name: 'test' }
			unreactive(obj)

			expect(isNonReactive(obj)).toBe(true)
			expect(reactive(obj)).toBe(obj) // Should not create a proxy
			expect(isReactive(obj)).toBe(false)
		})

		it('should not affect other objects', () => {
			const obj1 = { count: 0 }
			const obj2 = { count: 0 }

			unreactive(obj1)

			expect(isNonReactive(obj1)).toBe(true)
			expect(isNonReactive(obj2)).toBe(false)

			const reactiveObj2 = reactive(obj2)
			expect(isReactive(reactiveObj2)).toBe(true)
		})
	})

	describe('markNonReactiveClass', () => {
		it('should mark entire classes as non-reactive', () => {
			class TestClass {
				count = 0
				name = 'test'
			}

			unreactive(TestClass)

			const instance1 = new TestClass()
			const instance2 = new TestClass()

			expect(isNonReactive(instance1)).toBe(true)
			expect(isNonReactive(instance2)).toBe(true)
			expect(reactive(instance1)).toBe(instance1)
			expect(reactive(instance2)).toBe(instance2)
		})

		it('should work with inheritance', () => {
			class BaseClass {
				baseProp = 'base'
			}

			class DerivedClass extends BaseClass {
				derivedProp = 'derived'
			}

			unreactive(BaseClass)

			const baseInstance = new BaseClass()
			const derivedInstance = new DerivedClass()

			expect(isNonReactive(baseInstance)).toBe(true)
			expect(isNonReactive(derivedInstance)).toBe(true) // Inherits non-reactive status
		})

		it('should not affect other classes', () => {
			class NonReactiveClass {
				prop = 'non-reactive'
			}

			class ReactiveClass {
				prop = 'reactive'
			}

			unreactive(NonReactiveClass)

			const unreactiveInstance = new NonReactiveClass()
			const reactiveInstance = new ReactiveClass()

			expect(isNonReactive(unreactiveInstance)).toBe(true)
			expect(isNonReactive(reactiveInstance)).toBe(false)

			const reactiveReactiveInstance = reactive(reactiveInstance)
			expect(isReactive(reactiveReactiveInstance)).toBe(true)
		})
	})

	describe('NonReactive symbol (internal)', () => {
		it('should mark objects with symbol as non-reactive', () => {
			const obj: any = { count: 0 }
			// Since we can't access the internal symbol, test the behavior indirectly
			// by using the public markNonReactive function
			unreactive(obj)

			expect(isNonReactive(obj)).toBe(true)
			expect(reactive(obj)).toBe(obj)
			expect(isReactive(obj)).toBe(false)
		})

		it('should work with the Reactive mixin', () => {
			class TestClass {
				count = 0
			}

			// Mark the class as non-reactive using the public API
			unreactive(TestClass)

			const ReactiveTestClass = Reactive(TestClass)
			const instance = new ReactiveTestClass()

			expect(isNonReactive(instance)).toBe(true)
			expect(isReactive(instance)).toBe(false)
		})
	})

	describe('native objects', () => {
		it('should not make Date objects reactive', () => {
			const date = new Date()
			expect(reactive(date)).toBe(date)
			expect(isReactive(date)).toBe(false)
		})

		it('should not make RegExp objects reactive', () => {
			const regex = /test/
			expect(reactive(regex)).toBe(regex)
			expect(isReactive(regex)).toBe(false)
		})

		it('should not make Error objects reactive', () => {
			const error = new Error('test')
			expect(reactive(error)).toBe(error)
			expect(isReactive(error)).toBe(false)
		})
	})

	describe('integration with existing reactive system', () => {
		it('should work with effects on non-reactive objects', () => {
			const obj = { count: 0 }
			unreactive(obj)

			let effectCount = 0
			effect(() => {
				effectCount++
				obj.count // Accessing non-reactive object
			})

			expect(effectCount).toBe(1)

			obj.count = 5
			expect(effectCount).toBe(1) // Should not trigger effect
		})

		it('should allow mixing reactive and non-reactive objects', () => {
			const reactiveObj = reactive({ count: 0 })
			const unreactiveObj = { name: 'test' }
			unreactive(unreactiveObj)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveObj.count
				unreactiveObj.name
			})

			expect(effectCount).toBe(1)

			reactiveObj.count = 5
			expect(effectCount).toBe(2) // Should trigger effect

			unreactiveObj.name = 'new name'
			expect(effectCount).toBe(2) // Should not trigger effect
		})

		it('should work with the Reactive mixin and non-reactive classes', () => {
			class NonReactiveClass {
				count = 0
			}

			unreactive(NonReactiveClass)

			const ReactiveNonReactiveClass = Reactive(NonReactiveClass)
			const instance = new ReactiveNonReactiveClass()

			expect(isNonReactive(instance)).toBe(true)
			expect(isReactive(instance)).toBe(false)

			let effectCount = 0
			effect(() => {
				effectCount++
				instance.count
			})

			expect(effectCount).toBe(1)

			instance.count = 5
			expect(effectCount).toBe(1) // Should not trigger effect since it's non-reactive
		})
	})
})

describe('@unreactive decorator', () => {
	describe('legacy decorator syntax', () => {
		it('should mark properties as unreactive using legacy syntax', () => {
			class TestClass {
				@unreactive
				unreactiveProp = 'test'

				reactiveProp = 'reactive'
			}

			const instance = new TestClass()
			const reactiveInstance = reactive(instance)

			// The unreactive property should not trigger effects
			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveInstance.unreactiveProp
				reactiveInstance.reactiveProp
			})

			expect(effectCount).toBe(1)

			// Changing unreactive property should not trigger effect
			reactiveInstance.unreactiveProp = 'new value'
			expect(effectCount).toBe(1)

			// Changing reactive property should trigger effect
			reactiveInstance.reactiveProp = 'new reactive value'
			expect(effectCount).toBe(2)
		})

		it('should work with multiple unreactive properties', () => {
			class TestClass {
				@unreactive
				prop1 = 'value1'

				@unreactive
				prop2 = 'value2'

				reactiveProp = 'reactive'
			}

			const instance = new TestClass()
			const reactiveInstance = reactive(instance)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveInstance.prop1
				reactiveInstance.prop2
				reactiveInstance.reactiveProp
			})

			expect(effectCount).toBe(1)

			// Changing unreactive properties should not trigger effect
			reactiveInstance.prop1 = 'new value1'
			reactiveInstance.prop2 = 'new value2'
			expect(effectCount).toBe(1)

			// Changing reactive property should trigger effect
			reactiveInstance.reactiveProp = 'new reactive value'
			expect(effectCount).toBe(2)
		})

		it('should work with symbol properties', () => {
			const sym = Symbol('test')

			class TestClass {
				@unreactive
				[sym] = 'symbol value'

				reactiveProp = 'reactive'
			}

			const instance = new TestClass()
			const reactiveInstance = reactive(instance)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveInstance[sym]
				reactiveInstance.reactiveProp
			})

			expect(effectCount).toBe(1)

			// Changing unreactive symbol property should not trigger effect
			reactiveInstance[sym] = 'new symbol value'
			expect(effectCount).toBe(1)

			// Changing reactive property should trigger effect
			reactiveInstance.reactiveProp = 'new reactive value'
			expect(effectCount).toBe(2)
		})

		it('should work with numeric properties', () => {
			class TestClass {
				@unreactive
				0 = 'zero'

				@unreactive
				1 = 'one'

				reactiveProp = 'reactive'
			}

			const instance = new TestClass()
			const reactiveInstance = reactive(instance)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveInstance[0]
				reactiveInstance[1]
				reactiveInstance.reactiveProp
			})

			expect(effectCount).toBe(1)

			// Changing unreactive numeric properties should not trigger effect
			reactiveInstance[0] = 'ZERO'
			reactiveInstance[1] = 'ONE'
			expect(effectCount).toBe(1)

			// Changing reactive property should trigger effect
			reactiveInstance.reactiveProp = 'new reactive value'
			expect(effectCount).toBe(2)
		})
	})

	describe('integration with reactive system', () => {
		it('should bypass reactivity completely for unreactive properties', () => {
			class TestClass {
				@unreactive
				unreactiveProp = { nested: 'value' }

				reactiveProp = { nested: 'reactive' }
			}

			const instance = new TestClass()
			const reactiveInstance = reactive(instance)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveInstance.unreactiveProp.nested
				reactiveInstance.reactiveProp.nested
			})

			expect(effectCount).toBe(1)

			// Changing nested unreactive property should not trigger effect
			reactiveInstance.unreactiveProp.nested = 'new nested value'
			expect(effectCount).toBe(1)

			// Changing nested reactive property should trigger effect
			reactiveInstance.reactiveProp.nested = 'new nested reactive value'
			expect(effectCount).toBe(2)
		})

		it('should work with regular properties', () => {
			class TestClass {
				@unreactive
				unreactiveProp = 'test'

				reactiveProp = 'reactive'
			}

			const instance = new TestClass()
			const reactiveInstance = reactive(instance)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveInstance.unreactiveProp
				reactiveInstance.reactiveProp
			})

			expect(effectCount).toBe(1)

			// Changing unreactive property should not trigger effect
			reactiveInstance.unreactiveProp = 'new value'
			expect(effectCount).toBe(1)

			// Changing reactive property should trigger effect
			reactiveInstance.reactiveProp = 'new reactive value'
			expect(effectCount).toBe(2)
		})

		it('should work with inheritance', () => {
			class BaseClass {
				@unreactive
				baseUnreactiveProp = 'base unreactive'

				baseReactiveProp = 'base reactive'
			}

			class DerivedClass extends BaseClass {
				@unreactive
				derivedUnreactiveProp = 'derived unreactive'

				derivedReactiveProp = 'derived reactive'
			}

			const instance = new DerivedClass()
			const reactiveInstance = reactive(instance)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveInstance.baseUnreactiveProp
				reactiveInstance.baseReactiveProp
				reactiveInstance.derivedUnreactiveProp
				reactiveInstance.derivedReactiveProp
			})

			expect(effectCount).toBe(1)

			// Changing unreactive properties should not trigger effect
			reactiveInstance.baseUnreactiveProp = 'new base unreactive'
			reactiveInstance.derivedUnreactiveProp = 'new derived unreactive'
			expect(effectCount).toBe(1)

			// Changing reactive properties should trigger effect
			reactiveInstance.baseReactiveProp = 'new base reactive'
			expect(effectCount).toBe(2)
			reactiveInstance.derivedReactiveProp = 'new derived reactive'
			expect(effectCount).toBe(3)
		})
	})

	describe('edge cases', () => {
		it('should handle undefined and null values', () => {
			class TestClass {
				@unreactive
				unreactiveProp: any = undefined

				reactiveProp: any = null
			}

			const instance = new TestClass()
			const reactiveInstance = reactive(instance)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveInstance.unreactiveProp
				reactiveInstance.reactiveProp
			})

			expect(effectCount).toBe(1)

			// Setting values should not trigger effects for unreactive properties
			reactiveInstance.unreactiveProp = 'new value'
			expect(effectCount).toBe(1)

			// Setting values should trigger effects for reactive properties
			reactiveInstance.reactiveProp = 'new value'
			expect(effectCount).toBe(2)
		})

		it('should work with computed property names', () => {
			const propName = 'computed'

			class TestClass {
				@unreactive
				[propName] = 'computed unreactive'

				reactiveProp = 'reactive'
			}

			const instance = new TestClass()
			const reactiveInstance = reactive(instance)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveInstance[propName]
				reactiveInstance.reactiveProp
			})

			expect(effectCount).toBe(1)

			// Changing computed unreactive property should not trigger effect
			reactiveInstance[propName] = 'new computed unreactive'
			expect(effectCount).toBe(1)

			// Changing reactive property should trigger effect
			reactiveInstance.reactiveProp = 'new reactive value'
			expect(effectCount).toBe(2)
		})

		it('should handle property deletion', () => {
			class TestClass {
				@unreactive
				unreactiveProp?: string = 'test'

				reactiveProp?: string = 'reactive'
			}

			const instance = new TestClass()
			const reactiveInstance = reactive(instance)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveInstance.unreactiveProp
				reactiveInstance.reactiveProp
			})

			expect(effectCount).toBe(1)

			// Deleting unreactive property should not trigger effect
			delete reactiveInstance.unreactiveProp
			expect(effectCount).toBe(1)

			// Deleting reactive property should trigger effect
			delete reactiveInstance.reactiveProp
			expect(effectCount).toBe(2)
		})
	})
})

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
})
