import { describe, expect, it } from 'vitest'
import { describe as muttsDescribe, reactive } from '../../src/reactive'

describe('describe (reactive property definition)', () => {
	it('should define properties from a record', () => {
		const target: any = {}
		const descriptors = {
			foo: { value: 1, enumerable: true },
		}
		muttsDescribe(descriptors, target)
		expect(target).toHaveProperty('foo', 1)
		expect(Object.getOwnPropertyDescriptor(target, 'foo')?.enumerable).toBe(true)
	})

	it('should react to added properties in descriptors', () => {
		const target: any = {}
		const descriptors = reactive({} as any)
		muttsDescribe(descriptors, target)

		expect(target).not.toHaveProperty('foo')

		descriptors.foo = { value: 1, enumerable: true }
		expect(target).toHaveProperty('foo', 1)
	})

	it('should react to removed properties in descriptors', () => {
		const target: any = {}
		const descriptors = reactive({
			foo: { value: 1, enumerable: true },
		} as any)
		muttsDescribe(descriptors, target)

		expect(target).toHaveProperty('foo', 1)

		delete descriptors.foo
		expect(target).not.toHaveProperty('foo')
	})

	it('should update properties when descriptors change', () => {
		const target: any = {}
		const descriptors = reactive({
			foo: { value: 1, enumerable: true },
		} as any)
		muttsDescribe(descriptors, target)

		expect(target.foo).toBe(1)

		descriptors.foo = { value: 2, enumerable: true }
		expect(target.foo).toBe(2)
	})

	it('should handle computed value changes in descriptors', () => {
		const target: any = {}
		const source = reactive({ val: 1 })
		const descriptors = reactive({
			foo: {
				get: () => source.val,
				enumerable: true,
			},
		} as any)
		muttsDescribe(descriptors, target)

		expect(target.foo).toBe(1)

		source.val = 2
		expect(target.foo).toBe(2)
	})

	it('should return the target object', () => {
		const target = {}
		const descriptors = { foo: { value: 1 } }
		const result = muttsDescribe(descriptors, target)
		expect(result).toBe(target)
	})

	it('should create a new object if target is not provided', () => {
		const descriptors = { foo: { value: 1 } }
		const result = muttsDescribe(descriptors)
		expect(result).toHaveProperty('foo', 1)
	})
})
