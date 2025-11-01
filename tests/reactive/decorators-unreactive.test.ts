import { effect, reactive, unreactive } from 'mutts/reactive'

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

			reactiveInstance[propName] = 'new computed unreactive'
			expect(effectCount).toBe(1)

			reactiveInstance.reactiveProp = 'new reactive value'
			expect(effectCount).toBe(2)
		})

		it('should work with symbol parameters', () => {
			const sym = Symbol('unreactive')

			@unreactive(sym)
			class TestClass {
				[sym] = 'symbol unreactive'

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

			reactiveInstance[sym] = 'new symbol value'
			expect(effectCount).toBe(1)

			reactiveInstance.reactiveProp = 'new reactive value'
			expect(effectCount).toBe(2)
		})
	})
})
