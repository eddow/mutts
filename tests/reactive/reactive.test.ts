import { isReactive, reactive, unwrap } from 'mutts/reactive'

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
