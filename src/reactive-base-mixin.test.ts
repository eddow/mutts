import { Eventful } from './eventful'
import { effect, Reactive, ReactiveBase, reactive } from './reactive'

describe('ReactiveBase as Mixin', () => {
	it('should work as a base class (backward compatibility)', () => {
		@reactive
		class MyClass extends ReactiveBase {
			value = 0
			name = 'test'

			increment() {
				this.value++
			}
		}

		const instance = new MyClass()
		expect(instance.name).toBe('test')
		expect(instance.value).toBe(0)

		// Test that methods work without reactivity first
		instance.increment()
		expect(instance.value).toBe(1)

		// Now test with reactivity
		let effectCount = 0
		effect(() => {
			effectCount++
			instance.value
		})

		expect(effectCount).toBe(1)

		instance.increment()
		expect(effectCount).toBe(2)
		expect(instance.value).toBe(2)
	})

	it('should work as a mixin function', () => {
		class BaseClass {
			baseValue = 42
		}

		@reactive
		class MyClass extends ReactiveBase(BaseClass) {
			value = 0
			name = 'test'

			increment() {
				this.value++
			}
		}

		const instance = new MyClass()
		expect((instance as any).baseValue).toBe(42) // from BaseClass
		expect(instance.name).toBe('test')
		expect(instance.value).toBe(0)

		let effectCount = 0
		effect(() => {
			effectCount++
			instance.value
		})

		expect(effectCount).toBe(1)

		instance.increment()
		expect(effectCount).toBe(2)
		expect(instance.value).toBe(1)
	})

	it('should cache mixin results', () => {
		class BaseClass {
			value = 42
		}

		const ReactiveBaseClass1 = ReactiveBase(BaseClass)
		const ReactiveBaseClass2 = ReactiveBase(BaseClass)

		expect(ReactiveBaseClass1).toBe(ReactiveBaseClass2)
	})

	it('should work with complex inheritance', () => {
		class BaseModel {
			id = Math.random().toString(36)
		}

		@reactive
		class UserModel extends ReactiveBase(BaseModel) {
			name = ''
			email = ''

			updateName(newName: string) {
				this.name = newName
			}
		}

		const user = new UserModel()
		expect((user as any).id).toBeDefined()
		expect(user.name).toBe('')

		let effectCount = 0
		effect(() => {
			effectCount++
			user.name
		})

		expect(effectCount).toBe(1)

		user.updateName('John Doe')
		expect(effectCount).toBe(2)
		expect(user.name).toBe('John Doe')
	})

	it('should work with @reactive decorator', () => {
		class BaseClass {
			baseValue = 42
		}

		@reactive
		class MyClass extends ReactiveBase(BaseClass) {
			value = 0

			increment() {
				this.value++
			}
		}

		const instance = new MyClass()
		expect((instance as any).baseValue).toBe(42)

		let effectCount = 0
		effect(() => {
			effectCount++
			instance.value
		})

		expect(effectCount).toBe(1)

		instance.increment()
		expect(effectCount).toBe(2)
		expect(instance.value).toBe(1)
	})
})

describe('Reactive Mixin', () => {
	it('should work as a base class without @reactive decorator', () => {
		class MyClass extends Reactive {
			value = 0
			increment() {
				this.value++
			}
		}

		const instance = new MyClass()
		expect(instance.value).toBe(0)
		instance.increment()
		expect(instance.value).toBe(1)
	})

	it('should work as a mixin function without @reactive decorator', () => {
		class BaseClass {
			baseValue = 'base'
		}

		class MyClass extends Reactive(BaseClass) {
			value = 0
			increment() {
				this.value++
			}
		}

		const instance = new MyClass()
		expect((instance as any).baseValue).toBe('base')
		expect(instance.value).toBe(0)
		instance.increment()
		expect(instance.value).toBe(1)
	})

	it('should be reactive without @reactive decorator', () => {
		class MyClass extends Reactive {
			value = 0
			increment() {
				this.value++
			}
		}

		const instance = new MyClass()
		let effectCount = 0

		effect(() => {
			instance.value
			effectCount++
		})

		expect(effectCount).toBe(1)
		instance.increment()
		expect(effectCount).toBe(2)
		expect(instance.value).toBe(1)
	})

	it('should throw error when used with @reactive decorator', () => {
		expect(() => {
			// This should throw an error
			@reactive
			class MyClass extends Reactive {
				value = 0
			}
		}).toThrow()
	})

	it('should cache mixin results', () => {
		class BaseClass {
			baseValue = 'base'
		}

		const ReactiveClass1 = Reactive(BaseClass)
		const ReactiveClass2 = Reactive(BaseClass)

		expect(ReactiveClass1).toBe(ReactiveClass2)
	})

	it('should work with complex inheritance', () => {
		class BaseModel {
			id = Math.random().toString(36)
		}

		class UserModel extends Reactive(BaseModel) {
			name = ''
			email = ''

			updateName(newName: string) {
				this.name = newName
			}
		}

		const user = new UserModel()
		expect((user as any).id).toBeDefined()
		expect(user.name).toBe('')

		let effectCount = 0
		effect(() => {
			user.name
			effectCount++
		})

		expect(effectCount).toBe(1)
		user.updateName('John Doe')
		expect(effectCount).toBe(2)
		expect(user.name).toBe('John Doe')
	})
})

describe('Combined Mixins', () => {
	it('should combine Reactive and Eventful mixins', () => {
		// Define event types
		interface UserEvents extends Record<string, (...args: any[]) => void> {
			'name-changed': (newName: string, oldName: string) => void
			'age-changed': (newAge: number, oldAge: number) => void
		}

		// Combine Reactive and Eventful
		class UserModel extends Reactive(Eventful<UserEvents>) {
			id = Math.random().toString(36)
			name = ''
			age = 0

			updateName(newName: string) {
				const oldName = this.name
				this.name = newName
				this.emit('name-changed', newName, oldName)
			}

			updateAge(newAge: number) {
				const oldAge = this.age
				this.age = newAge
				this.emit('age-changed', newAge, oldAge)
			}
		}

		const user = new UserModel()
		expect((user as any).id).toBeDefined()
		expect(user.name).toBe('')
		expect(user.age).toBe(0)

		// Test reactivity
		let effectCount = 0
		effect(() => {
			user.name
			user.age
			effectCount++
		})

		expect(effectCount).toBe(1)

		// Test events
		let nameChangedCount = 0
		let ageChangedCount = 0
		let lastNewName = ''
		let lastOldName = ''
		let lastNewAge = 0
		let lastOldAge = 0

		user.on('name-changed', (newName, oldName) => {
			nameChangedCount++
			lastNewName = newName
			lastOldName = oldName
		})

		user.on('age-changed', (newAge, oldAge) => {
			ageChangedCount++
			lastNewAge = newAge
			lastOldAge = oldAge
		})

		// Test combined functionality
		user.updateName('John Doe')
		expect(effectCount).toBe(2) // Reactivity triggered
		expect(nameChangedCount).toBe(1) // Event triggered
		expect(lastNewName).toBe('John Doe')
		expect(lastOldName).toBe('')

		user.updateAge(30)
		expect(effectCount).toBe(3) // Reactivity triggered
		expect(ageChangedCount).toBe(1) // Event triggered
		expect(lastNewAge).toBe(30)
		expect(lastOldAge).toBe(0)

		expect(user.name).toBe('John Doe')
		expect(user.age).toBe(30)
	})

	it('should work with Reactive as base and Eventful as mixin', () => {
		interface CounterEvents extends Record<string, (...args: any[]) => void> {
			incremented: (newValue: number) => void
			decremented: (newValue: number) => void
		}

		class Counter extends Reactive(Eventful<CounterEvents>) {
			count = 0

			increment() {
				this.count++
				this.emit('incremented', this.count)
			}

			decrement() {
				this.count--
				this.emit('decremented', this.count)
			}
		}

		const counter = new Counter()
		expect(counter.count).toBe(0)

		// Test reactivity
		let effectCount = 0
		effect(() => {
			counter.count
			effectCount++
		})

		expect(effectCount).toBe(1)

		// Test events
		let incrementedCount = 0
		let decrementedCount = 0
		let lastValue = 0

		counter.on('incremented', (value) => {
			incrementedCount++
			lastValue = value
		})

		counter.on('decremented', (value) => {
			decrementedCount++
			lastValue = value
		})

		// Test combined functionality
		counter.increment()
		expect(effectCount).toBe(2) // Reactivity triggered
		expect(incrementedCount).toBe(1) // Event triggered
		expect(lastValue).toBe(1)
		expect(counter.count).toBe(1)

		counter.decrement()
		expect(effectCount).toBe(3) // Reactivity triggered
		expect(decrementedCount).toBe(1) // Event triggered
		expect(lastValue).toBe(0)
		expect(counter.count).toBe(0)
	})
})
