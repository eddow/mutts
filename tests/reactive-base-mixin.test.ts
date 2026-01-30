import { effect, ReactiveBase, reactive } from 'mutts'

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
