// Test the decorator system with all decorator types
import { decorator } from 'mutts'

describe('Decorator System', () => {
	describe('Method Decorators', () => {
		it('should wrap method calls', () => {
			const methodDecorator = decorator({
				method(original, _target, _name) {
					return function (this: any, ...args: any[]) {
						return `wrapped: ${original.apply(this, args)}`
					}
				},
			})

			class TestClass {
				@methodDecorator
				greet(name: string) {
					return `Hello ${name}`
				}
			}

			const instance = new TestClass()
			expect(instance.greet('World')).toBe('wrapped: Hello World')
		})

		it('should work with multiple methods', () => {
			const methodDecorator = decorator({
				method(original, _target, name) {
					return function (this: any, ...args: any[]) {
						return `${String(name)}: ${original.apply(this, args)}`
					}
				},
			})

			class TestClass {
				@methodDecorator
				first() {
					return 'first'
				}

				@methodDecorator
				second() {
					return 'second'
				}
			}

			const instance = new TestClass()
			expect(instance.first()).toBe('first: first')
			expect(instance.second()).toBe('second: second')
		})
	})

	describe('Class Decorators', () => {
		it('should modify class behavior', () => {
			const classDecorator = decorator({
				class: (target) => {
					// Add a static property to the class
					;(target as any).decorated = true
					return target
				},
			})

			@classDecorator
			class TestClass {
				static original = 'original'
			}

			expect((TestClass as any).decorated).toBe(true)
			expect(TestClass.original).toBe('original')
		})

		it('should work with class inheritance', () => {
			const classDecorator = decorator({
				class: (target) => {
					;(target as any).decorated = true
					return target
				},
			})

			@classDecorator
			class BaseClass {}

			class ExtendedClass extends BaseClass {}

			expect((BaseClass as any).decorated).toBe(true)
			// In legacy decorators, the decorator is applied to the class itself
			// so ExtendedClass should also have the decorated property
			expect((ExtendedClass as any).decorated).toBe(true)
		})
	})

	describe('Getter Decorators', () => {
		it('should wrap getter calls', () => {
			const getterDecorator = decorator({
				getter(original, _target, _name) {
					return function (this: any) {
						return `wrapped: ${original.call(this)}`
					}
				},
			})

			class TestClass {
				private _value = 'test'

				@getterDecorator
				get value() {
					return this._value
				}
			}

			const instance = new TestClass()
			expect(instance.value).toBe('wrapped: test')
		})

		it('should work with multiple getters', () => {
			const getterDecorator = decorator({
				getter(original, _target, name) {
					return function (this: any) {
						return `${String(name)}: ${original.call(this)}`
					}
				},
			})

			class TestClass {
				private _first = 'first'
				private _second = 'second'

				@getterDecorator
				get first() {
					return this._first
				}

				@getterDecorator
				get second() {
					return this._second
				}
			}

			const instance = new TestClass()
			expect(instance.first).toBe('first: first')
			expect(instance.second).toBe('second: second')
		})
	})

	describe('Setter Decorators', () => {
		it('should wrap setter calls', () => {
			const setterDecorator = decorator({
				setter(original, _target, _name) {
					return function (this: any, value: any) {
						return original.call(this, `wrapped: ${value}`)
					}
				},
			})

			class TestClass {
				private _value = ''

				@setterDecorator
				set value(v: string) {
					this._value = v
				}

				get value() {
					return this._value
				}
			}

			const instance = new TestClass()
			instance.value = 'test'
			expect(instance.value).toBe('wrapped: test')
		})

		it('should work with multiple setters', () => {
			const setterDecorator = decorator({
				setter(original, _target, name) {
					return function (this: any, value: any) {
						return original.call(this, `${String(name)}: ${value}`)
					}
				},
			})

			class TestClass {
				private _first = ''
				private _second = ''

				@setterDecorator
				set first(v: string) {
					this._first = v
				}

				@setterDecorator
				set second(v: string) {
					this._second = v
				}

				get first() {
					return this._first
				}

				get second() {
					return this._second
				}
			}

			const instance = new TestClass()
			instance.first = 'test1'
			instance.second = 'test2'
			expect(instance.first).toBe('first: test1')
			expect(instance.second).toBe('second: test2')
		})
	})

	describe('Combined Decorators', () => {
		it('should work with method and class decorators together', () => {
			const myDecorator = decorator({
				class: (target) => {
					;(target as any).decorated = true
					return target
				},
				method(original, _target, _name) {
					return function (this: any, ...args: any[]) {
						return `method: ${original.apply(this, args)}`
					}
				},
			})

			@myDecorator
			class TestClass {
				@myDecorator
				greet(name: string) {
					return `Hello ${name}`
				}
			}

			expect((TestClass as any).decorated).toBe(true)
			const instance = new TestClass()
			expect(instance.greet('World')).toBe('method: Hello World')
		})

		it('should work with getter and setter decorators on different properties', () => {
			const myDecorator = decorator({
				getter(original, _target, _name) {
					return function (this: any) {
						return `get: ${original.call(this)}`
					}
				},
				setter(original, _target, _name) {
					return function (this: any, value: any) {
						return original.call(this, `set: ${value}`)
					}
				},
			})

			class TestClass {
				private _value1 = ''
				private _value2 = ''

				@myDecorator
				get value1() {
					return this._value1
				}

				@myDecorator
				set value2(v: string) {
					this._value2 = v
				}
				//@ts-ignore: The end-user should put a decorator here if modern, and not if legacy
				@myDecorator
				get value2() {
					return this._value2
				}
			}

			const instance = new TestClass()
			instance.value2 = 'test'
			expect(instance.value1).toBe('get: ')
			expect(instance.value2).toBe('get: set: test')
		})

		it('should work with all decorator types together', () => {
			const myDecorator = decorator({
				class: (target) => {
					;(target as any).decorated = true
					return target
				},
				method(original, _target, _name) {
					return function (this: any, ...args: any[]) {
						return `method: ${original.apply(this, args)}`
					}
				},
				getter(original, _target, _name) {
					return function (this: any) {
						return `get: ${original.call(this)}`
					}
				},
				default(...args) {
					return args.length
				},
			})

			@myDecorator
			class TestClass {
				value = 'initial'

				@myDecorator
				greet(name: string) {
					return `Hello ${name}`
				}

				private _data = ''

				@myDecorator
				get data() {
					return this._data
				}

				set data(v: string) {
					this._data = v
				}
			}

			// Test class decoration
			expect((TestClass as any).decorated).toBe(true)

			const instance = new TestClass()

			// Test method decoration
			expect(instance.greet('World')).toBe('method: Hello World')

			// Test accessor decoration
			instance.data = 'test'
			expect(instance.data).toBe('get: test')
			expect(myDecorator(1, 2, 3)).toBe(3)
		})

		it('should call all decorator types without changing behavior', () => {
			const callLog: string[] = []

			const noOpDecorator = decorator({
				class(original) {
					callLog.push('class decorator called')
					return original // Return unchanged
				},
				method(original, _target, name) {
					callLog.push(`method decorator called for ${String(name)}`)
					return original // Return unchanged
				},
				getter(original, _target, name) {
					callLog.push(`getter decorator called for ${String(name)}`)
					return original // Return unchanged
				},
				setter(original, _target, name) {
					callLog.push(`setter decorator called for ${String(name)}`)
					return original // Return unchanged
				},
			})

			@noOpDecorator
			class TestClass {
				value = 'initial'

				@noOpDecorator
				greet(name: string) {
					return `Hello ${name}`
				}

				private _data = ''

				@noOpDecorator
				get data() {
					return this._data
				}

				set data(v: string) {
					this._data = v
				}
			}

			// Verify all decorators were called
			expect(callLog).toContain('class decorator called')
			expect(callLog).toContain('method decorator called for greet')
			expect(callLog).toContain('getter decorator called for data')

			const instance = new TestClass()

			// Verify behavior is unchanged (no wrapping occurred)
			expect(instance.greet('World')).toBe('Hello World') // No "method:" prefix
			expect(instance.value).toBe('initial')

			instance.data = 'test'
			expect(instance.data).toBe('test') // No "get:" prefix
		})

		it('should call setter decorator without changing behavior', () => {
			const callLog: string[] = []

			const noOpDecorator = decorator({
				setter(original, _target, name) {
					callLog.push(`setter decorator called for ${String(name)}`)
					return original // Return unchanged
				},
			})

			class TestClass {
				private _value = ''

				@noOpDecorator
				set value(v: string) {
					this._value = v
				}

				get value() {
					return this._value
				}
			}

			// Verify setter decorator was called
			expect(callLog).toContain('setter decorator called for value')

			const instance = new TestClass()

			// Verify behavior is unchanged (no wrapping occurred)
			instance.value = 'test'
			expect(instance.value).toBe('test') // No wrapping
		})
	})

	describe('Error Handling', () => {
		it('should throw error when decorator is applied to wrong target', () => {
			const methodOnlyDecorator = decorator({
				method(original, _target, _name) {
					return original
				},
			})

			expect(() => {
				class TestClass {
					// @ts-ignore
					@methodOnlyDecorator
					value = 'test'
				}
				void new TestClass()
			}).toThrow('Decorator cannot be applied to a field')
		})

		it('should throw error when class decorator is applied to method', () => {
			const classOnlyDecorator = decorator({
				class: (target) => target,
			})

			expect(() => {
				class TestClass {
					// @ts-ignore
					@classOnlyDecorator
					method() {}
				}
				void new TestClass()
			}).toThrow('Decorator cannot be applied to a method')
		})

		it('should throw error when getter decorator is applied to method', () => {
			const getterOnlyDecorator = decorator({
				getter(original, _target, _name) {
					return original
				},
			})

			expect(() => {
				class TestClass {
					// @ts-ignore
					@getterOnlyDecorator
					method() {}
				}
				void new TestClass()
			}).toThrow('Decorator cannot be applied to a method')
		})

		it('should throw error when decorating a field', () => {
			const anyDecorator = decorator({
				method(original, _target, _name) {
					return original
				},
			})

			expect(() => {
				class TestClass {
					// @ts-ignore
					@anyDecorator
					field = 'value'
				}
				void new TestClass()
			}).toThrow('Decorator cannot be applied to a field')
		})
	})
})
