import {
	allocated,
	allocatedValues,
	Destroyable,
	DestructionError,
	destructor,
} from './destroyable'

function tick(ms: number = 0) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

const gc = global.gc

async function collectGarbages() {
	await tick()
	gc!()
	await tick()
}

describe('Destroyable', () => {
	describe('with base class and destructor object', () => {
		it('should create destroyable class with custom destructor', async () => {
			let receivedAllocated: any = null

			class MyClass extends Destroyable({
				destructor(allocated) {
					receivedAllocated = allocated
				},
			}) {
				constructor(public name: string) {
					super()
					this[allocatedValues].name = name
				}
			}

			;(() => {
				const obj = new MyClass('test')
				expect(obj.name).toBe('test')
			})()
			await collectGarbages()
			expect(receivedAllocated.name).toBe('test')
		})

		it('should pass constructor arguments to base class', () => {
			class BaseClass {
				constructor(public value: number) {}
			}

			const DestroyableBaseClass = Destroyable(BaseClass, {
				destructor: () => {},
			})

			const obj = new DestroyableBaseClass(42)
			expect(obj.value).toBe(42)
		})

		it('should throw error when accessing destroyed object', () => {
			class MyClass {
				constructor(public name: string) {}
			}

			const DestroyableMyClass = Destroyable(MyClass, {
				destructor: () => {},
			})

			const obj = new DestroyableMyClass('test')
			DestroyableMyClass.destroy(obj)

			expect(() => obj.name).toThrow(DestructionError)
			expect(() => {
				obj.name = 'value'
			}).toThrow(DestructionError)
		})
	})

	describe('with destructor object only', () => {
		it('should create destroyable class from scratch', () => {
			let destructorCalled = false

			const DestroyableClass = Destroyable({
				destructor: () => {
					destructorCalled = true
				},
			})

			const obj = new DestroyableClass()
			expect(DestroyableClass.isDestroyable(obj)).toBe(true)
			expect(destructorCalled).toBe(false)

			const result = DestroyableClass.destroy(obj)
			expect(result).toBe(true)
			expect(destructorCalled).toBe(true)
		})
	})

	describe('with base class only', () => {
		it('should create destroyable class with default destructor', () => {
			class MyClass {
				constructor(public name: string) {}
			}

			const DestroyableMyClass = Destroyable(MyClass)

			expect(() => new DestroyableMyClass('test')).toThrow(DestructionError)
		})
	})

	describe('class with [destructor] method', () => {
		it('should call [destructor] method with allocated values', async () => {
			let receivedAllocated: any = null

			class MyClass extends Destroyable() {
				constructor(public name: string) {
					super()
					this[allocatedValues].name = name
				}
				[destructor](allocated: any) {
					receivedAllocated = allocated
				}
			}

			;(() => {
				const obj = new MyClass('test')
				expect(obj.name).toBe('test')
			})()
			await collectGarbages()
			expect(receivedAllocated.name).toBe('test')
		})
	})
	describe('decorators usage', () => {
		it('should collect allocated from decorators', async () => {
			let receivedAllocated: any = null

			class MyClass extends Destroyable() {
				@allocated
				name: string
				constructor(name: string) {
					super()
					this.name = name
				}
				[destructor](allocated: any) {
					receivedAllocated = allocated
				}
			}

			;(() => {
				const obj = new MyClass('test')
				expect(obj.name).toBe('test')
			})()
			await collectGarbages()
			expect(receivedAllocated.name).toBe('test')
		})
	})
})
