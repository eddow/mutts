import { effect, ReactiveBase, reactive, reactiveOptions } from './index'

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
			constructor(public value = 0) {
				super()
			}
		}

		@reactive
		class DerivedClass extends BaseClass {
			constructor() {
				super(42)
			}
		}

		const instance = new DerivedClass()
		expect(instance.value).toBe(42)
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

describe('reactive function', () => {
	it('should work with classes', () => {
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
