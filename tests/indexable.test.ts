import { getAt, Indexable, setAt } from 'mutts'

describe('Indexable', () => {
	describe('Indexable(base, accessor)', () => {
		it('should create indexable class with custom accessor', () => {
			class Base {
				constructor(public items: string[]) {}
			}

			const IndexableBase = Indexable(Base, {
				get: function (this: Base, index) {
					return this.items[index]
				},
				set: function (this: Base, index, value) {
					this.items[index] = value
				},
			})
			const instance = new IndexableBase(['a', 'b', 'c'])

			expect(instance[0]).toBe('a')
			expect(instance[1]).toBe('b')
			expect(instance[2]).toBe('c')
			expect(instance.items).toEqual(['a', 'b', 'c'])
		})

		it('should handle different item types', () => {
			class Base {
				constructor(public numbers: number[]) {}
			}

			const IndexableBase = Indexable(Base, {
				get: function (this: Base, index) {
					return this.numbers[index] * 2
				},
				set: function (this: Base, index, value) {
					this.numbers[index] = value / 2
				},
			})
			const instance = new IndexableBase([1, 2, 3])

			expect(instance[0]).toBe(2)
			expect(instance[1]).toBe(4)
			expect(instance[2]).toBe(6)
		})

		it('should preserve base class methods', () => {
			class Base {
				constructor(public items: string[]) {}
				getLength() {
					return this.items.length
				}
			}

			const IndexableBase = Indexable(Base, {
				get: function (this: Base, index) {
					return this.items[index]
				},
				set: function (this: Base, index, value) {
					this.items[index] = value
				},
			})
			const instance = new IndexableBase(['a', 'b'])

			expect(instance.getLength()).toBe(2)
			expect(instance[0]).toBe('a')
		})
	})

	describe('Indexable(base with getAt and setAt methods)', () => {
		it('should use the base class getAt and setAt methods', () => {
			class Base {
				constructor(public items: string[]) {}
				[getAt](index: number): string {
					return this.items[index]
				}
				[setAt](index: number, value: string): void {
					this.items[index] = value
				}
			}

			const IndexableBase = Indexable(Base)
			const instance = new IndexableBase(['x', 'y', 'z'])

			expect(instance[0]).toBe('x')
			instance[0] = 'a'
			expect(instance[0]).toBe('a')
			expect(instance.items[0]).toBe('a')
		})

		it('should work with custom getAt and setAt implementation', () => {
			class Base {
				constructor(public numbers: number[]) {}
				[getAt](index: number): number {
					return this.numbers[index] * 3
				}
				[setAt](index: number, value: number): void {
					this.numbers[index] = value / 3
				}
			}

			const IndexableBase = Indexable(Base)
			const instance = new IndexableBase([1, 2, 3])

			expect(instance[0]).toBe(3)
			instance[0] = 9
			expect(instance[0]).toBe(9)
			expect(instance.numbers[0]).toBe(3)
		})

		it('should throw when setAt method is missing', () => {
			class Base {
				constructor(public items: string[]) {}
				[getAt](index: number): string {
					return this.items[index]
				}
				// Missing setAt method
			}

			const IndexableBase = Indexable(Base)
			const instance = new IndexableBase(['x', 'y'])

			expect(instance[0]).toBe('x')
			expect(() => {
				instance[0] = 'z'
			}).toThrow('Indexable class has read-only numeric index access')
		})
	})

	describe('Indexable()', () => {
		it('should create abstract class with abstract getAt method', () => {
			const AbstractIndexable = Indexable<string>()

			//@ts-expect-error Should be abstract
			void new AbstractIndexable()

			// Should have abstract getAt method
			class Concrete extends AbstractIndexable {
				constructor(private items: string[]) {
					super()
				}
				[getAt](index: number): string {
					return this.items[index]
				}
			}

			const instance = new Concrete(['p', 'q', 'r'])
			expect(instance[0]).toBe('p')
			expect(instance[1]).toBe('q')
			expect(instance[2]).toBe('r')
		})

		it('should enforce getAt method implementation', () => {
			const AbstractIndexable = Indexable<number>()
			//@ts-expect-error Should be abstract
			class Invalid extends AbstractIndexable {}

			// JavaScript doesn't enforce abstract methods at runtime
			// So instantiation won't throw, but calling the missing method will
			const instance = new Invalid()
			expect(() => instance[0]).toThrow()
		})
	})

	describe('edge cases', () => {
		it('should handle out of bounds access', () => {
			class Base {
				constructor(public items: string[]) {}
			}

			const IndexableBase = Indexable(Base, {
				get: function (this: Base, index) {
					return this.items[index]
				},
				set: function (this: Base, index, value) {
					this.items[index] = value
				},
			})
			const instance = new IndexableBase(['a', 'b'])

			expect(instance[5]).toBeUndefined()
			expect(instance[-1]).toBeUndefined()
		})

		it('should handle empty arrays', () => {
			class Base {
				constructor(public items: string[]) {}
			}

			const IndexableBase = Indexable(Base, {
				get: function (this: Base, index) {
					return this.items[index]
				},
				set: function (this: Base, index, value) {
					this.items[index] = value
				},
			})
			const instance = new IndexableBase([])

			expect(instance[0]).toBeUndefined()
		})

		it('should not interfere with non-numeric properties', () => {
			class Base {
				constructor(public items: string[]) {}
				length = 42
			}

			const IndexableBase = Indexable(Base, {
				get: function (this: Base, index) {
					return this.items[index]
				},
				set: function (this: Base, index, value) {
					this.items[index] = value
				},
			})
			const instance = new IndexableBase(['a', 'b'])

			expect(instance.length).toBe(42)
			expect(instance.items).toEqual(['a', 'b'])
		})

		it('should not interfere with setting non-numeric properties', () => {
			class Base {
				constructor(public items: string[]) {}
				length = 42
			}

			const IndexableBase = Indexable(Base, {
				get: function (this: Base, index) {
					return this.items[index]
				},
				set: function (this: Base, index, value) {
					this.items[index] = value
				},
			})
			const instance = new IndexableBase(['a', 'b'])

			instance.length = 100
			expect(instance.length).toBe(100)
		})
	})

	describe('integration tests', () => {
		it('should work with complex objects', () => {
			class Person {
				constructor(
					public name: string,
					public age: number
				) {}
			}

			class PersonList {
				constructor(public people: Person[]) {}
				[getAt](index: number): Person {
					return this.people[index]
				}
				[setAt](index: number, person: Person): void {
					this.people[index] = person
				}
			}

			const IndexablePersonList = Indexable(PersonList)
			const people = [new Person('Alice', 30), new Person('Bob', 25), new Person('Charlie', 35)]
			const instance = new IndexablePersonList(people)

			expect((instance[0] as Person).name).toBe('Alice')
			instance[0] = new Person('Alice Updated', 31)
			expect((instance[0] as Person).name).toBe('Alice Updated')
			expect((instance[0] as Person).age).toBe(31)
			expect(instance.people[0].name).toBe('Alice Updated')
		})

		it('should support multiple inheritance levels', () => {
			class Base {
				constructor(public items: string[]) {}
			}

			class Extended extends Indexable(Base, {
				get: function (this: Base, index) {
					return this.items[index]
				},
				set: function (this: Base, index, value) {
					this.items[index] = value
				},
			}) {
				constructor(
					items: string[],
					public extra: string
				) {
					super(items)
				}
			}

			const instance = new Extended(['a', 'b'], 'extra')
			expect(instance[0]).toBe('a')
			expect(instance.extra).toBe('extra')
		})

		it('should support setting with custom logic', () => {
			class Base {
				constructor(public items: string[]) {}
			}

			const IndexableBase = Indexable(Base, {
				get: function (this: Base, index) {
					return this.items[index]
				},
				set: function (this: Base, index, value) {
					// Custom logic: convert to uppercase
					this.items[index] = value.toUpperCase()
				},
			})
			const instance = new IndexableBase(['a', 'b', 'c'])

			instance[1] = 'x'
			expect(instance[1]).toBe('X')
			expect(instance.items[1]).toBe('X')
		})
	})

	describe('Indexable(accessor)', () => {
		it('should create indexable object with custom accessor', () => {
			const IndexableObj = Indexable({
				get: function (this: any, index: number) {
					return this._arr?.[index]
				},
				set: function (this: any, index: number, value: any) {
					if (!this._arr) this._arr = []
					this._arr[index] = value
				},
			})
			const instance = new IndexableObj() as any
			instance._arr = ['a', 'b', 'c']
			expect(instance[0]).toBe('a')
			expect(instance[1]).toBe('b')
			expect(instance[2]).toBe('c')
		})

		it('should create indexable object with custom getter and setter', () => {
			const IndexableObj = Indexable({
				get: function (this: any, index: number) {
					return this._arr?.[index]
				},
				set: function (this: any, index: number, value: string) {
					if (!this._arr) this._arr = []
					this._arr[index] = value
				},
			})
			const instance = new IndexableObj() as any
			instance[0] = 'x'
			instance[1] = 'y'
			expect(instance[0]).toBe('x')
			expect(instance[1]).toBe('y')
			expect(instance._arr[0]).toBe('x')
			expect(instance._arr[1]).toBe('y')
		})

		it('should support transformation in setter', () => {
			const IndexableObj = Indexable({
				get: function (this: any, index: number) {
					return this._arr?.[index] * 2
				},
				set: function (this: any, index: number, value: number) {
					if (!this._arr) this._arr = []
					this._arr[index] = value / 2
				},
			})
			const instance = new IndexableObj() as any
			instance._arr = [1, 2, 3]
			instance[0] = 10
			expect(instance[0]).toBe(10)
			expect(instance._arr[0]).toBe(5)
		})

		it('should throw if setter is missing and assignment is attempted', () => {
			const IndexableObj = Indexable({
				get: function (this: any, index: number) {
					return this._arr?.[index]
				},
			})
			const instance = new IndexableObj() as any
			expect(() => {
				instance[0] = 'fail'
			}).toThrow('Indexable class has read-only numeric index access')
		})
	})
})
