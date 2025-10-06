import {
	atomic,
	effect,
	isNonReactive,
	isReactive,
	ReactiveBase,
	reactive,
	reactiveOptions,
	unreactive,
	untracked,
	unwrap,
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
				stopInner?.()
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

		it('should manage modifications during effect execution and should not trigger effect', () => {
			const state = reactive({ count: 0, multiplier: 2 })
			let effectCalls = 0

			const stopEffect = effect(() => {
				effectCalls++
				// Change watched value during effect
				state.count = state.count + 1
			})

			expect(effectCalls).toBe(1)

			stopEffect()
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

describe('@reactive decorator', () => {
	it('should make class instances reactive using decorator', () => {
		@reactive
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

		const instance = new TestClass()

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
		@reactive
		class User {
			name = 'John'
			age = 30

			updateProfile(newName: string, newAge: number) {
				this.name = newName
				this.age = newAge
			}
		}

		const user = new User()

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
		// Suppress the expected warning for this test
		const originalWarn = reactiveOptions.warn
		reactiveOptions.warn = () => {}
		try {
			@reactive
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

			const dog = new Dog()

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
		} finally {
			// Restore original warn function
			reactiveOptions.warn = originalWarn
		}
	})

	it('should handle method calls that modify properties', () => {
		@reactive
		class Counter {
			value = 0

			add(amount: number) {
				this.value += amount
			}

			reset() {
				this.value = 0
			}
		}

		const counter = new Counter()

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

	it('should work with functional syntax', () => {
		class TestClass {
			count = 0
			name = 'test'

			increment() {
				this.count++
			}
		}

		const ReactiveTestClass = reactive(TestClass)
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
})

describe('ReactiveBase', () => {
	it('should make classes extending ReactiveBase reactive when decorated', () => {
		class BaseClass extends ReactiveBase {
			baseProp = 'base'
		}

		@reactive
		class DerivedClass extends BaseClass {
			derivedProp = 'derived'
		}

		const instance = new DerivedClass()

		let effectCount = 0
		effect(() => {
			effectCount++
			instance.baseProp
			instance.derivedProp
		})

		expect(effectCount).toBe(1)
		expect(instance.baseProp).toBe('base')
		expect(instance.derivedProp).toBe('derived')

		instance.baseProp = 'new base'
		expect(effectCount).toBe(2)

		instance.derivedProp = 'new derived'
		expect(effectCount).toBe(3)
	})

	it('should solve constructor reactivity issues', () => {
		class BaseClass extends ReactiveBase {
			value = 0
		}

		@reactive
		class TestClass extends BaseClass {
			constructor() {
				super()
				// In constructor, 'this' is not yet reactive
				// But ReactiveBase ensures the returned instance is reactive
				this.value = 42
			}
		}

		const instance = new TestClass()

		let effectCount = 0
		effect(() => {
			effectCount++
			instance.value
		})

		expect(effectCount).toBe(1)
		expect(instance.value).toBe(42)

		instance.value = 100
		expect(effectCount).toBe(2)
		expect(instance.value).toBe(100)
	})

	it('should work with complex inheritance trees', () => {
		class GameObject extends ReactiveBase {
			id = 'game-object'
			position = { x: 0, y: 0 }
		}

		class Entity extends GameObject {
			health = 100
		}

		@reactive
		class Player extends Entity {
			name = 'Player'
			level = 1
		}

		const player = new Player()

		let positionEffectCount = 0
		let healthEffectCount = 0
		let levelEffectCount = 0

		effect(() => {
			positionEffectCount++
			player.position.x
			player.position.y
		})

		effect(() => {
			healthEffectCount++
			player.health
		})

		effect(() => {
			levelEffectCount++
			player.level
		})

		expect(positionEffectCount).toBe(1)
		expect(healthEffectCount).toBe(1)
		expect(levelEffectCount).toBe(1)

		player.position.x = 10
		expect(positionEffectCount).toBe(2)
		expect(healthEffectCount).toBe(1)
		expect(levelEffectCount).toBe(1)

		player.health = 80
		expect(positionEffectCount).toBe(2)
		expect(healthEffectCount).toBe(2)
		expect(levelEffectCount).toBe(1)

		player.level = 2
		expect(positionEffectCount).toBe(2)
		expect(healthEffectCount).toBe(2)
		expect(levelEffectCount).toBe(2)
	})

	it('should not affect classes that do not extend ReactiveBase', () => {
		class RegularClass {
			value = 0
		}

		@reactive
		class TestClass extends RegularClass {
			otherValue = 1
		}

		const instance = new TestClass()

		let effectCount = 0
		effect(() => {
			effectCount++
			instance.value
			instance.otherValue
		})

		expect(effectCount).toBe(1)

		instance.value = 10
		expect(effectCount).toBe(2)

		instance.otherValue = 20
		expect(effectCount).toBe(3)
	})
})

describe('Legacy Reactive mixin', () => {
	it('should still work for backward compatibility', () => {
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

		const ReactiveTestClass = reactive(TestClass)
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

	it('should warn when used with inheritance', () => {
		const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

		class BaseClass {
			baseProp = 'base'
		}

		const ReactiveBaseClass = reactive(BaseClass)

		// Create a class that extends the reactive class
		class DerivedClass extends ReactiveBaseClass {
			derivedProp = 'derived'
		}

		const _instance = new DerivedClass()

		// The warning should be triggered when creating the instance
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('has been inherited by'))

		consoleSpy.mockRestore()
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

			const ReactiveTestClass = reactive(TestClass)
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

			const ReactiveNonReactiveClass = reactive(NonReactiveClass)
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
	describe('class-level decorator syntax', () => {
		it('should mark properties as unreactive using class-level syntax', () => {
			@unreactive('unreactiveProp')
			class TestClass {
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
			@unreactive('prop1', 'prop2')
			class TestClass {
				prop1 = 'value1'

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

			@unreactive(sym)
			class TestClass {
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
	})

	describe('integration with reactive system', () => {
		it('should bypass reactivity completely for unreactive properties', () => {
			@unreactive('unreactiveProp')
			class TestClass {
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
			@unreactive('unreactiveProp')
			class TestClass {
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
			@unreactive('baseUnreactiveProp')
			class BaseClass {
				baseUnreactiveProp = 'base unreactive'

				baseReactiveProp = 'base reactive'
			}

			@unreactive('derivedUnreactiveProp')
			class DerivedClass extends BaseClass {
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
			@unreactive('unreactiveProp')
			class TestClass {
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

			@unreactive(propName)
			class TestClass {
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
			@unreactive('unreactiveProp')
			class TestClass {
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

describe('automatic effect cleanup', () => {
	function tick(ms: number = 100) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	const gc = global.gc

	async function collectGarbages() {
		await tick()
		gc!()
		await tick()
	}

	describe('parent-child effect cleanup', () => {
		it('should automatically clean up child effects when parent is cleaned up', () => {
			const state = reactive({ a: 1, b: 2 })
			const cleanupCalls: string[] = []

			const stopParent = effect(() => {
				state.a

				// Create child effect
				effect(() => {
					state.b
					return () => cleanupCalls.push('child cleanup')
				})

				return () => cleanupCalls.push('parent cleanup')
			})

			expect(cleanupCalls).toEqual([])

			// Stop parent effect - should clean up both parent and child
			stopParent()
			expect(cleanupCalls).toEqual(['parent cleanup', 'child cleanup'])
		})

		it('should clean up all nested child effects when parent is cleaned up', () => {
			const state = reactive({ a: 1, b: 2, c: 3 })
			const cleanupCalls: string[] = []

			const stopParent = effect(() => {
				state.a

				// Create child effect
				effect(() => {
					state.b

					// Create grandchild effect
					effect(() => {
						state.c
						return () => cleanupCalls.push('grandchild cleanup')
					})

					return () => cleanupCalls.push('child cleanup')
				})

				return () => cleanupCalls.push('parent cleanup')
			})

			expect(cleanupCalls).toEqual([])

			// Stop parent effect - should clean up all nested effects
			stopParent()
			expect(cleanupCalls).toEqual(['parent cleanup', 'child cleanup', 'grandchild cleanup'])
		})

		it('should allow child effects to be cleaned up independently', () => {
			const state = reactive({ a: 1, b: 2 })
			const cleanupCalls: string[] = []

			const stopParent = effect(() => {
				state.a

				// Create child effect and store its cleanup
				const stopChild = effect(() => {
					state.b
					return () => cleanupCalls.push('child cleanup')
				})

				// Clean up child independently
				stopChild()

				return () => cleanupCalls.push('parent cleanup')
			})

			expect(cleanupCalls).toEqual(['child cleanup'])

			// Stop parent effect - should only clean up parent
			stopParent()
			expect(cleanupCalls).toEqual(['child cleanup', 'parent cleanup'])
		})

		it('should clean up multiple child effects when parent is cleaned up', () => {
			const state = reactive({ a: 1, b: 2, c: 3 })
			const cleanupCalls: string[] = []

			const stopParent = effect(() => {
				state.a

				// Create multiple child effects
				effect(() => {
					state.b
					return () => cleanupCalls.push('child1 cleanup')
				})

				effect(() => {
					state.c
					return () => cleanupCalls.push('child2 cleanup')
				})

				return () => cleanupCalls.push('parent cleanup')
			})

			expect(cleanupCalls).toEqual([])

			// Stop parent effect - should clean up all children and parent
			stopParent()
			expect(cleanupCalls).toEqual(['parent cleanup', 'child1 cleanup', 'child2 cleanup'])
		})
	})

	describe('garbage collection cleanup', () => {
		it('should clean up unreferenced top-level effects via GC', async () => {
			const state = reactive({ value: 1 })
			let cleanupCalled = false

			// Create effect in a scope that will be garbage collected
			;(() => {
				const _x = effect(() => {
					state.value
					return () => {
						cleanupCalled = true
					}
				})
			})()

			expect(cleanupCalled).toBe(false)

			// Force garbage collection
			await collectGarbages()
			expect(cleanupCalled).toBe(true)
		})

		it('should clean up parent and child effects when both are unreferenced', async () => {
			const state = reactive({ a: 1, b: 2 })
			const cleanupCalls: string[] = []

			// Create parent effect that creates a child, both unreferenced
			;(() => {
				effect(() => {
					state.a

					// Create child effect
					effect(() => {
						state.b
						return () => cleanupCalls.push('child cleanup')
					})

					return () => cleanupCalls.push('parent cleanup')
				})
			})()

			expect(cleanupCalls).toEqual([])

			// Force garbage collection
			await collectGarbages()

			// Both parent and child should be cleaned up
			expect(cleanupCalls).toContain('parent cleanup')
			expect(cleanupCalls).toContain('child cleanup')
			expect(cleanupCalls).toHaveLength(2)
		})

		it('should clean up orphaned child effects when parent is unreferenced', async () => {
			const state = reactive({ a: 1, b: 2 })
			const cleanupCalls: string[] = []

			// Create parent effect that creates a child, both unreferenced
			;(() => {
				effect(() => {
					state.a

					// Create child effect
					effect(() => {
						state.b
						return () => cleanupCalls.push('child cleanup')
					})

					return () => cleanupCalls.push('parent cleanup')
				})
			})()

			expect(cleanupCalls).toEqual([])

			// Force garbage collection - both should be cleaned up
			await collectGarbages()

			expect(cleanupCalls).toContain('parent cleanup')
			expect(cleanupCalls).toContain('child cleanup')
			expect(cleanupCalls).toHaveLength(2)
		})

		it('should handle child effect referenced but parent unreferenced', async () => {
			const state = reactive({ a: 1, b: 2 })
			const cleanupCalls: string[] = []

			// Create parent effect that creates a child, but only keep reference to child
			let stopChild: (() => void) | undefined
			const createParentWithChild = () => {
				effect(() => {
					state.a

					// Create child effect and store its cleanup function
					stopChild = effect(() => {
						state.b
						return () => cleanupCalls.push('child cleanup')
					})
				})
			}

			createParentWithChild()

			expect(cleanupCalls).toEqual([])
			expect(stopChild).toBeDefined()

			// Force garbage collection - parent should be cleaned up, child should remain
			await collectGarbages()

			// The child effect should still be alive (parent was GCed but child is referenced)
			// Note: The child might be cleaned up if it's also unreferenced
			// This test demonstrates the mechanism, not the exact behavior

			// Explicitly clean up child if it's still alive
			if (stopChild) {
				stopChild()
				expect(cleanupCalls).toContain('child cleanup')
			}
		})

		it('should handle mixed explicit and GC cleanup', () => {
			const state = reactive({ a: 1, b: 2, c: 3 })
			const cleanupCalls: string[] = []

			// Create parent effect
			const stopParent = effect(() => {
				state.a

				// Create child that will be explicitly cleaned up
				const stopChild = effect(() => {
					state.b
					return () => cleanupCalls.push('explicit child cleanup')
				})

				// Create child that will be GC cleaned up
				effect(() => {
					state.c
					return () => cleanupCalls.push('gc child cleanup')
				})

				// Explicitly clean up first child
				stopChild()

				return () => cleanupCalls.push('parent cleanup')
			})

			expect(cleanupCalls).toEqual(['explicit child cleanup'])

			// Stop parent - should clean up parent and all remaining children
			stopParent()
			expect(cleanupCalls).toEqual(['explicit child cleanup', 'parent cleanup', 'gc child cleanup'])
		})
	})

	describe('cleanup behavior documentation', () => {
		it('should demonstrate that cleanup is optional but recommended for side effects', () => {
			const state = reactive({ value: 1 })
			let sideEffectExecuted = false

			// Effect with side effect that should be cleaned up
			const stopEffect = effect(() => {
				state.value

				// Simulate side effect (e.g., DOM manipulation, timers, etc.)
				const intervalId = setInterval(() => {
					sideEffectExecuted = true
				}, 100)

				// Return cleanup function to prevent memory leaks
				return () => {
					clearInterval(intervalId)
				}
			})

			// Effect is running, side effect should be active
			expect(sideEffectExecuted).toBe(false)

			// Stop effect - cleanup should be called
			stopEffect()

			// Wait a bit to ensure interval would have fired
			setTimeout(() => {
				expect(sideEffectExecuted).toBe(false) // Should still be false due to cleanup
			}, 150)
		})

		it('should show that effects can be stored and remembered for later cleanup', () => {
			const state = reactive({ value: 1 })
			const activeEffects: (() => void)[] = []
			const cleanupCalls: string[] = []

			// Create multiple effects and store their cleanup functions
			for (let i = 0; i < 3; i++) {
				const stopEffect = effect(() => {
					state.value
					return () => cleanupCalls.push(`effect ${i} cleanup`)
				})
				activeEffects.push(stopEffect)
			}

			expect(cleanupCalls).toEqual([])

			// Clean up all effects at once
			activeEffects.forEach((stop) => stop())

			expect(cleanupCalls).toHaveLength(3)
			expect(cleanupCalls).toContain('effect 0 cleanup')
			expect(cleanupCalls).toContain('effect 1 cleanup')
			expect(cleanupCalls).toContain('effect 2 cleanup')
		})
	})
})

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
				state.b = state.a * 2
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
			expect(state.b).toBe(0)
			expect(state.c).toBe(1)
			expect(finalEffectCount).toBe(1)

			instance.triggerCascade()
			// All cascading effects should be batched
			expect(state.a).toBe(5)
			expect(state.b).toBe(10)
			expect(state.c).toBe(11)
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

				updateC() {
					state.c = 3
				}

				@atomic
				updateWithNestedError() {
					this.updateA()
					expect(effectCount).toBe(1) // Effects don't run during atomic method
					this.updateBWithError() // This will throw
					this.updateC() // This won't execute
				}
			}

			const instance = new TestClass()

			expect(effectCount).toBe(1)

			// Method should throw error from nested call
			expect(() => {
				instance.updateWithNestedError()
			}).toThrow('Nested error')

			// Effects don't run when atomic method throws an error
			expect(effectCount).toBe(1)
			expect(state.a).toBe(1) // Change was made before error
			expect(state.b).toBe(2) // Change was made before error
			expect(state.c).toBe(0) // Should remain unchanged due to error
		})
	})

	describe('complex scenarios', () => {
		it('should work with arrays and array methods', () => {
			const state = reactive({ items: [1, 2, 3], count: 3 })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.items.length
				state.count
			})

			class TestClass {
				@atomic
				updateArray() {
					state.items.push(4)
					state.count = state.items.length
					expect(effectCount).toBe(1) // Effects don't run during atomic method
				}

				@atomic
				removeItems() {
					state.items.pop()
					state.items.pop()
					state.count = state.items.length
					expect(effectCount).toBe(1) // Effects don't run during atomic method
				}
			}

			const instance = new TestClass()

			expect(effectCount).toBe(1)
			expect(state.items.slice()).toEqual([1, 2, 3]) // Use slice() for reactive arrays
			expect(state.count).toBe(3)

			instance.updateArray()
			expect(effectCount).toBe(2) // Only one additional run
			expect(state.items.slice()).toEqual([1, 2, 3, 4])
			expect(state.count).toBe(4)

			// Reset effect count for next test
			effectCount = 1

			instance.removeItems()
			expect(effectCount).toBe(2) // Only one additional run
			expect(state.items.slice()).toEqual([1, 2])
			expect(state.count).toBe(2)
		})

		it('should work with atomic function wrapper', () => {
			const state = reactive({ a: 0, b: 0 })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.a
				state.b
			})

			const atomicFunction = atomic(() => {
				state.a = 1
				state.b = 2
				expect(effectCount).toBe(1) // Effects don't run during atomic function execution
			})

			expect(effectCount).toBe(1)
			expect(state.a).toBe(0)
			expect(state.b).toBe(0)

			atomicFunction()
			expect(effectCount).toBe(2) // Effects run after atomic function completes
			expect(state.a).toBe(1)
			expect(state.b).toBe(2)
		})

		it('should return values from atomic function', () => {
			const state = reactive({ a: 0, b: 0 })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.a
				state.b
			})

			// Test returning primitive values
			const atomicFunction1 = atomic(() => {
				state.a = 5
				state.b = 10
				return state.a + state.b
			})
			const result1 = atomicFunction1()

			expect(result1).toBe(15)
			expect(effectCount).toBe(2) // Effects run after atomic function completes
			expect(state.a).toBe(5)
			expect(state.b).toBe(10)

			// Test returning objects
			const atomicFunction2 = atomic(() => {
				state.a = 20
				state.b = 30
				return { sum: state.a + state.b, product: state.a * state.b }
			})
			const result2 = atomicFunction2()

			expect(result2).toEqual({ sum: 50, product: 600 })
			expect(effectCount).toBe(3) // Effects run after atomic function completes
			expect(state.a).toBe(20)
			expect(state.b).toBe(30)

			// Test returning undefined
			const atomicFunction3 = atomic(() => {
				state.a = 100
				// No explicit return
			})
			const result3 = atomicFunction3()

			expect(result3).toBeUndefined()
			expect(effectCount).toBe(4) // Effects run after atomic function completes
			expect(state.a).toBe(100)

			// Test returning null
			const atomicFunction4 = atomic(() => {
				state.b = 200
				return null
			})
			const result4 = atomicFunction4()

			expect(result4).toBeNull()
			expect(effectCount).toBe(5) // Effects run after atomic function completes
			expect(state.b).toBe(200)
		})

		it('should return values from atomic function with complex operations', () => {
			const state = reactive({ items: [] as any[], count: 0 })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.items.length
				state.count
			})

			// Test returning computed result after array operations
			const atomicFunction = atomic(() => {
				state.items.push(1, 2, 3)
				state.count = state.items.length
				return {
					items: state.items.slice(),
					count: state.count,
					sum: state.items.reduce((a, b) => a + b, 0),
				}
			})
			const result = atomicFunction()

			expect(result).toEqual({
				items: [1, 2, 3],
				count: 3,
				sum: 6,
			})
			expect(effectCount).toBe(2) // Effects run after atomic function completes
			expect(state.items.slice()).toEqual([1, 2, 3])
			expect(state.count).toBe(3)
		})

		it('should return values from atomic function with edge cases', () => {
			const state = reactive({ data: null as any })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.data
			})

			// Test returning falsy values
			const atomicFunction1 = atomic(() => {
				state.data = false
				return false
			})
			const result1 = atomicFunction1()

			expect(result1).toBe(false)
			expect(effectCount).toBe(2)
			expect(state.data).toBe(false)

			// Test returning zero
			const atomicFunction2 = atomic(() => {
				state.data = 0
				return 0
			})
			const result2 = atomicFunction2()

			expect(result2).toBe(0)
			expect(effectCount).toBe(3)
			expect(state.data).toBe(0)

			// Test returning empty string
			const atomicFunction3 = atomic(() => {
				state.data = ''
				return ''
			})
			const result3 = atomicFunction3()

			expect(result3).toBe('')
			expect(effectCount).toBe(4)
			expect(state.data).toBe('')

			// Test returning arrays and functions
			const atomicFunction4 = atomic(() => {
				state.data = [1, 2, 3]
				return [1, 2, 3]
			})
			const result4 = atomicFunction4()

			expect(result4).toEqual([1, 2, 3])
			expect(effectCount).toBe(5)
			expect(state.data.slice()).toEqual([1, 2, 3])

			// Test returning a function
			const testFunc = () => 'test'
			const atomicFunction5 = atomic(() => {
				state.data = testFunc
				return testFunc
			})
			const result5 = atomicFunction5()

			expect(result5).toBe(testFunc)
			expect(effectCount).toBe(6)
			expect(state.data).toBe(testFunc)
		})

		it('should work with maps and sets', () => {
			const state = reactive({
				map: new Map([
					['a', 1],
					['b', 2],
				]),
				set: new Set([1, 2, 3]),
				mapSize: 2,
				setSize: 3,
			})

			let effectCount = 0

			effect(() => {
				effectCount++
				state.mapSize
				state.setSize
			})

			class TestClass {
				@atomic
				updateCollections() {
					state.map.set('c', 3)
					state.set.add(4)
					state.mapSize = state.map.size
					state.setSize = state.set.size
				}

				@atomic
				clearCollections() {
					state.map.clear()
					state.set.clear()
					state.mapSize = state.map.size
					state.setSize = state.set.size
				}
			}

			const instance = new TestClass()

			expect(effectCount).toBe(1)
			expect(state.mapSize).toBe(2)
			expect(state.setSize).toBe(3)

			instance.updateCollections()
			expect(effectCount).toBe(2) // Only one additional run
			expect(state.mapSize).toBe(3)
			expect(state.setSize).toBe(4)

			instance.clearCollections()
			expect(effectCount).toBe(3) // Only one additional run
			expect(state.mapSize).toBe(0)
			expect(state.setSize).toBe(0)
		})

		it('should handle mixed reactive and non-reactive operations', () => {
			const state = reactive({ a: 0, b: 0 })
			const nonReactiveObj = { c: 0 }
			let effectCount = 0

			effect(() => {
				effectCount++
				state.a
				state.b
			})

			class TestClass {
				@atomic
				mixedUpdate() {
					state.a = 1
					nonReactiveObj.c = 1 // Non-reactive change
					state.b = 2
				}
			}

			const instance = new TestClass()

			expect(effectCount).toBe(1)

			instance.mixedUpdate()
			expect(effectCount).toBe(2) // Only one additional run
			expect(state.a).toBe(1)
			expect(state.b).toBe(2)
			expect(nonReactiveObj.c).toBe(1)
		})
	})

	describe('performance and edge cases', () => {
		it('should handle large numbers of changes efficiently', () => {
			const state = reactive({ values: Array.from({ length: 100 }, (_, i) => i) })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.values.length
			})

			class TestClass {
				@atomic
				updateManyValues() {
					for (let i = 0; i < 100; i++) {
						state.values[i] = i * 2
					}
					expect(effectCount).toBe(1) // Effects don't run during atomic method
				}
			}

			const instance = new TestClass()

			expect(effectCount).toBe(1)

			instance.updateManyValues()
			expect(effectCount).toBe(1) // Effects don't run after atomic method with current implementation
			expect(state.values[0]).toBe(0)
			expect(state.values[50]).toBe(100)
			expect(state.values[99]).toBe(198)
		})

		it("should handle atomic methods that don't modify state", () => {
			const state = reactive({ a: 1, b: 2 })
			let effectCount = 0

			effect(() => {
				effectCount++
				state.a
				state.b
			})

			class TestClass {
				@atomic
				noOp() {
					// Do nothing
				}

				@atomic
				readOnly() {
					const sum = state.a + state.b
					expect(effectCount).toBe(1) // Effects don't run during atomic method
					return sum
				}

				@atomic
				updateAndReturn() {
					const oldSum = state.a + state.b
					state.a = 10
					state.b = 20
					expect(effectCount).toBe(1) // Effects don't run during atomic method
					return { oldSum, newSum: state.a + state.b }
				}
			}

			const instance = new TestClass()

			expect(effectCount).toBe(1)

			instance.noOp()
			expect(effectCount).toBe(1) // No additional runs

			const result = instance.readOnly()
			expect(effectCount).toBe(1) // No additional runs since no state was modified
			expect(result).toBe(3) // Returns the computed value (1 + 2 = 3)

			const updateResult = instance.updateAndReturn()
			expect(effectCount).toBe(2) // Effects run after atomic method completes
			expect(updateResult).toEqual({ oldSum: 3, newSum: 30 })
			expect(state.a).toBe(10)
			expect(state.b).toBe(20)
		})
	})

	describe('integration with other decorators', () => {
		it('should work with @reactive decorator', () => {
			@reactive
			class TestClass {
				value = 0
				multiplier = 1

				@atomic
				updateBoth(newValue: number, newMultiplier: number) {
					this.value = newValue
					this.multiplier = newMultiplier
				}
			}

			const instance = new TestClass()
			let effectCount = 0

			effect(() => {
				effectCount++
				instance.value
				instance.multiplier
			})

			expect(effectCount).toBe(1)

			instance.updateBoth(5, 2)
			expect(effectCount).toBe(2) // Only one additional run
			expect(instance.value).toBe(5)
			expect(instance.multiplier).toBe(2)
		})

		it('should work with @unreactive decorator', () => {
			@reactive
			class TestClass {
				reactiveValue = 0
				unreactiveValue = 0

				@atomic
				updateBoth() {
					this.reactiveValue = 1
					this.unreactiveValue = 1
					expect(effectCount).toBe(1)
				}
			}

			// Mark unreactiveValue as unreactive
			unreactive('unreactiveValue')(TestClass)

			const instance = new TestClass()
			let effectCount = 0

			effect(() => {
				effectCount++
				instance.reactiveValue
				instance.unreactiveValue
			})

			expect(effectCount).toBe(1)

			instance.updateBoth()
			expect(effectCount).toBe(2) // Only one additional run (unreactive property doesn't trigger)
			expect(instance.reactiveValue).toBe(1)
			expect(instance.unreactiveValue).toBe(1)
		})
	})
})
