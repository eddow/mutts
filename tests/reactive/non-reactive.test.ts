import { effect, isNonReactive, isReactive, reactive, unreactive } from 'mutts/reactive'

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

		it('should work with non-reactive classes and reactive decorator', () => {
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
