import { cache, cached, isCached } from './cached'

describe('cached decorator', () => {
	it('should cache the result of a getter', () => {
		let callCount = 0
		class Test {
			@cached
			get value(): number {
				callCount++
				return 42
			}
		}
		const t = new Test()
		expect(callCount).toBe(0)
		expect(t.value).toBe(42)
		expect(callCount).toBe(1)
		expect(t.value).toBe(42)
		expect(callCount).toBe(1)
	})

	it('should cache per instance', () => {
		let callCount = 0
		class Test {
			@cached
			get value(): number {
				callCount++
				return callCount
			}
		}
		const t1 = new Test()
		const t2 = new Test()
		const v1 = t1.value
		const v2 = t2.value
		expect(v1).not.toBe(v2)
		expect(callCount).toBe(2)
		expect(t1.value).toBe(v1)
		expect(t2.value).toBe(v2)
		expect(callCount).toBe(2)
	})

	it('should throw on circular dependency', () => {
		class Test {
			@cached
			get a(): number {
				return this.b
			}
			@cached
			get b(): number {
				return this.a
			}
		}
		const t = new Test()
		expect(() => t.a).toThrow(/Circular dependency detected/)
		expect(() => t.b).toThrow(/Circular dependency detected/)
	})

	it('should throw if used on non-getter', () => {
		expect(() => {
			class Test {
				// @ts-expect-error
				@cached
				value = 1
			}
			return new Test()
		}).toThrow("Cannot read properties of undefined (reading 'get')")
	})
})

describe('isCached', () => {
	it('should return false before caching', () => {
		class Test {
			@cached
			get value(): number {
				return 1
			}
		}
		const t = new Test()
		expect(isCached(t, 'value')).toBe(false)
		void t.value
		expect(isCached(t, 'value')).toBe(true)
	})

	it('should return true after manual cache', () => {
		let callCount = 0
		class Test {
			get foo(): number {
				callCount++
				return 1
			}
		}
		const obj = new Test()
		expect(isCached(obj, 'foo')).toBe(false)
		cache(obj, 'foo', 123)
		expect(isCached(obj, 'foo')).toBe(true)
		expect(obj.foo).toBe(123)
		expect(callCount).toBe(0)
	})
})
