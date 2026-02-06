import {
	cache,
	cached,
	debounce,
	deprecated,
	descriptor as describeDecorator,
	descriptor,
	isCached,
	throttle,
} from 'mutts'

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
		}).toThrow('Decorator cannot be applied to a field')
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

describe('descriptor decorator', () => {
	it('should make properties readonly using flavor', () => {
		@descriptor.readonly('id', 'createdAt')
		class User {
			id: string = 'user-123'
			name: string = 'John'
			createdAt: Date = new Date()
		}

		const user = new User()

		// Readonly properties should not be writable
		expect(() => {
			user.id = 'new-id'
		}).toThrow()

		expect(() => {
			user.createdAt = new Date()
		}).toThrow()

		// Non-readonly properties should still be writable
		user.name = 'Jane'
		expect(user.name).toBe('Jane')
	})

	it('should make properties non-enumerable using flavor', () => {
		@descriptor.hidden('_private', '_cache')
		class DataStore {
			public data: any[] = []
			_private: string = 'secret'
			_cache: Map<string, any> = new Map()
		}

		const store = new DataStore()

		// Only public properties should be enumerable
		expect(Object.keys(store)).toEqual(['data'])

		// All properties should exist
		expect(Object.getOwnPropertyNames(store)).toContain('_private')
		expect(Object.getOwnPropertyNames(store)).toContain('_cache')
	})

	it('should combine multiple descriptor properties using flavors', () => {
		@descriptor.frozen('secret')
		@descriptor.readonly('secret')
		@descriptor.hidden('secret')
		class SecureData {
			public info: string = 'public'
			secret: string = 'top secret'
		}

		const data = new SecureData()

		// Secret should be read-only
		expect(() => {
			data.secret = 'leaked'
		}).toThrow()

		// Secret should be hidden from enumeration
		expect(Object.keys(data)).toEqual(['info'])

		// Secret should not be configurable
		expect(() => {
			Object.defineProperty(data, 'secret', { value: 'new' })
		}).toThrow()
	})

	it('should work with multiple properties using flavor', () => {
		@descriptor.readonly('id', 'version', 'createdAt')
		class Document {
			id: string = 'doc-1'
			title: string = 'My Document'
			version: number = 1
			createdAt: Date = new Date()
		}

		const doc = new Document()

		// All specified properties should be readonly
		expect(() => {
			doc.id = 'new-id'
		}).toThrow()
		expect(() => {
			doc.version = 2
		}).toThrow()
		expect(() => {
			doc.createdAt = new Date()
		}).toThrow()

		// Non-specified properties should remain writable
		doc.title = 'Updated Title'
		expect(doc.title).toBe('Updated Title')
	})

	it('should preserve existing property descriptors using flavor', () => {
		@descriptor.readonly('value')
		class Test {
			value: string = 'test'
		}

		const obj = new Test()
		const propDescriptor = Object.getOwnPropertyDescriptor(obj, 'value')

		// Should preserve enumerable and configurable, only change writable
		expect(propDescriptor?.writable).toBe(false)
		expect(propDescriptor?.enumerable).toBe(true) // Default for class fields
		expect(propDescriptor?.configurable).toBe(true) // Default for class fields
	})

	it('should work with inheritance using flavor', () => {
		class Base {
			baseValue: string = 'base'
		}

		@descriptor.readonly('baseValue', 'derivedValue')
		class Derived extends Base {
			derivedValue: string = 'derived'
		}

		const obj = new Derived()

		// Both base and derived properties should be readonly
		expect(() => {
			obj.baseValue = 'new base'
		}).toThrow()
		expect(() => {
			obj.derivedValue = 'new derived'
		}).toThrow()
	})

	it('should support all flavor variants', () => {
		// Test enumerable/hidden
		@descriptor.enumerable('publicProp')
		@descriptor.hidden('privateProp')
		class TestClass {
			publicProp: string = 'public'
			privateProp: string = 'private'
			normalProp: string = 'normal'
		}

		const obj = new TestClass()
		expect(Object.keys(obj)).toContain('publicProp')
		expect(Object.keys(obj)).not.toContain('privateProp')
		expect(Object.keys(obj)).toContain('normalProp')

		// Test writable/readonly
		@descriptor.writable('writableProp')
		@descriptor.readonly('readOnlyProp')
		class WriteTest {
			writableProp: string = 'can write'
			readOnlyProp: string = 'read only'
		}

		const writeObj = new WriteTest()
		expect(() => {
			writeObj.writableProp = 'changed'
		}).not.toThrow()
		expect(() => {
			writeObj.readOnlyProp = 'changed'
		}).toThrow()
	})

	/* Once a proper
	it('should create reusable descriptor configurations', () => {
		// Create reusable configurations
		const readonly = describeDecorator({ writable: false })
		const hidden = describeDecorator({ enumerable: false })
		const locked = describeDecorator({ configurable: false })

		@readonly('id')
		@hidden('_private')
		@locked('critical')
		class MultiConfig {
			id: string = 'id-1'
			_private: string = 'secret'
			critical: string = 'locked'
			normal: string = 'normal'
		}

		const obj = new MultiConfig()

		// Test readonly
		expect(() => {
			obj.id = 'new-id'
		}).toThrow()

		// Test hidden
		expect(Object.keys(obj)).toEqual(['id', 'critical', 'normal'])

		// Test locked
		expect(() => {
			Object.defineProperty(obj, 'critical', { value: 'new' })
		}).toThrow()

		// Normal property should work
		obj.normal = 'updated'
		expect(obj.normal).toBe('updated')
	})*/
})

describe('debounce decorator', () => {
	it('should debounce method calls', async () => {
		let callCount = 0

		class SearchInput {
			@debounce(100)
			search(query: string) {
				callCount++
				return `Searching for: ${query}`
			}
		}

		const input = new SearchInput()

		// Call multiple times rapidly
		input.search('a')
		input.search('ab')
		input.search('abc')

		// Should not have been called yet
		expect(callCount).toBe(0)

		// Wait for debounce delay
		await new Promise((resolve) => setTimeout(resolve, 150))

		// Should have been called only once with the last value
		expect(callCount).toBe(1)
	})

	it('should debounce with different delays', async () => {
		let fastCalls = 0
		let slowCalls = 0

		class TestClass {
			@debounce(50)
			fast() {
				fastCalls++
			}

			@debounce(150)
			slow() {
				slowCalls++
			}
		}

		const obj = new TestClass()

		// Call both methods
		obj.fast()
		obj.slow()

		// Wait for fast debounce
		await new Promise((resolve) => setTimeout(resolve, 100))
		expect(fastCalls).toBe(1)
		expect(slowCalls).toBe(0)

		// Wait for slow debounce
		await new Promise((resolve) => setTimeout(resolve, 100))
		expect(slowCalls).toBe(1)
	})

	it('should handle multiple rapid calls correctly', async () => {
		const calls: string[] = []

		class TestClass {
			@debounce(100)
			log(message: string) {
				calls.push(message)
			}
		}

		const obj = new TestClass()

		// Rapid calls
		obj.log('first')
		obj.log('second')
		obj.log('third')

		// Wait for debounce
		await new Promise((resolve) => setTimeout(resolve, 150))

		// Should only have the last call
		expect(calls).toEqual(['third'])
	})

	it('should preserve method context and arguments', async () => {
		let lastArgs: any[] = []
		let lastContext: any = null

		class TestClass {
			value = 'test'

			@debounce(50)
			method(...args: any[]) {
				lastArgs = args
				lastContext = this
				return this.value
			}
		}

		const obj = new TestClass()
		obj.method('arg1', 'arg2', 123)

		await new Promise((resolve) => setTimeout(resolve, 100))

		expect(lastArgs).toEqual(['arg1', 'arg2', 123])
		expect(lastContext).toBe(obj)
		expect(lastContext.value).toBe('test')
	})
})

describe('throttle decorator', () => {
	it('should throttle method calls', async () => {
		let callCount = 0

		class ScrollHandler {
			@throttle(100)
			onScroll() {
				callCount++
			}
		}

		const handler = new ScrollHandler()

		// First call should execute immediately
		handler.onScroll()
		expect(callCount).toBe(1)

		// Immediate second call should be throttled
		handler.onScroll()
		expect(callCount).toBe(1)

		// Call after throttle period should execute
		await new Promise((resolve) => setTimeout(resolve, 150))
		handler.onScroll()
		expect(callCount).toBe(2)
	})

	it('should execute first call immediately', async () => {
		let callCount = 0

		class TestClass {
			@throttle(200)
			method() {
				callCount++
			}
		}

		const obj = new TestClass()

		// First call should execute immediately
		obj.method()
		expect(callCount).toBe(1)

		// Second call should be throttled (and scheduled)
		obj.method()
		expect(callCount).toBe(1)

		// Wait long enough for the scheduled trailing call to run so no timers remain
		await new Promise((resolve) => setTimeout(resolve, 250))
		expect(callCount).toBe(2)
	})

	it('should schedule delayed execution for throttled calls', async () => {
		const timestamps: number[] = []

		class TestClass {
			@throttle(100)
			method() {
				timestamps.push(Date.now())
			}
		}

		const obj = new TestClass()

		// First call - immediate
		// const startTime = Date.now()
		obj.method()

		// Second call - should be throttled and scheduled
		obj.method()

		// Wait for scheduled execution
		await new Promise((resolve) => setTimeout(resolve, 150))

		expect(timestamps).toHaveLength(2)
		expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(95) // Allow some tolerance
	})

	it('should handle multiple rapid calls with correct timing', async () => {
		const calls: number[] = []

		class TestClass {
			@throttle(100)
			method() {
				calls.push(Date.now())
			}
		}

		const obj = new TestClass()

		// Multiple rapid calls
		// const startTime = Date.now()
		obj.method() // Immediate
		obj.method() // Throttled
		obj.method() // Throttled

		// Wait for scheduled execution
		await new Promise((resolve) => setTimeout(resolve, 150))

		expect(calls).toHaveLength(2)
		expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(95)
	})

	it('should preserve method context and arguments', async () => {
		let lastArgs: any[] = []
		let lastContext: any = null

		class TestClass {
			value = 'throttled'

			@throttle(50)
			method(...args: any[]) {
				lastArgs = args
				lastContext = this
				return this.value
			}
		}

		const obj = new TestClass()
		obj.method('arg1', 'arg2')

		expect(lastArgs).toEqual(['arg1', 'arg2'])
		expect(lastContext).toBe(obj)
		expect(lastContext.value).toBe('throttled')

		// Test throttled call
		obj.method('throttled1', 'throttled2')

		await new Promise((resolve) => setTimeout(resolve, 100))

		expect(lastArgs).toEqual(['throttled1', 'throttled2'])
	})
	it('should handle different throttle delays', () => {
		vi.useFakeTimers()
		try {
			let fastCalls = 0
			let slowCalls = 0

			class TestClass {
				@throttle(50)
				fast() {
					fastCalls++
				}

				@throttle(150)
				slow() {
					slowCalls++
				}
			}

			const obj = new TestClass()

			// Call both methods
			obj.fast()
			obj.slow()

			expect(fastCalls).toBe(1)
			expect(slowCalls).toBe(1)

			// Call again immediately (throttled)
			obj.fast()
			obj.slow()

			expect(fastCalls).toBe(1)
			expect(slowCalls).toBe(1)

			// Fast throttle window is 50ms. Advance by 100ms to be safe.
			vi.advanceTimersByTime(100)
			
			// Scheduled fast call should have fired
			expect(fastCalls).toBe(2)
			
			// Call fast again - should execute immediately as >50ms passed since last executon (at T=50ms)
			// Wait, the scheduled call ran at T=50ms. We are now at T=100ms. 
			// 100 - 50 = 50ms. So it allows immediate execution.
			obj.fast()
			expect(fastCalls).toBe(3)
			
			// Slow call (limit 150ms). We are at T=100ms.
			// Last slow call was at T=0. Scheduled one is for T=150.
			expect(slowCalls).toBe(1)

			// Advance another 100ms. Total T=200ms.
			vi.advanceTimersByTime(100)
			
			// Slow scheduled call (at T=150ms) should have fired.
			expect(slowCalls).toBe(2)
			
			// Call slow again. last execution was at T=150ms. Now T=200ms. Diff = 50ms. < 150ms.
			// Should be throttled and scheduled.
			obj.slow()
			expect(slowCalls).toBe(2)
			
			// Advance to cover the gap (needs 100ms more since 150+150=300, we are at 200).
			vi.advanceTimersByTime(100)
			expect(slowCalls).toBe(3)
		} finally {
			vi.useRealTimers()
		}
	})
})

describe('deprecated decorator with string parameter', () => {
	it('should use custom warning message for methods', () => {
		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		class TestClass {
			@deprecated('Use newMethod() instead')
			oldMethod() {
				return 'old'
			}
		}

		const obj = new TestClass()
		obj.oldMethod()

		expect(consoleSpy).toHaveBeenCalledWith(
			'TestClass.oldMethod is deprecated: Use newMethod() instead'
		)

		consoleSpy.mockRestore()
	})

	it('should use custom warning message for getters', () => {
		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		class TestClass {
			@deprecated('Use newValue instead')
			get oldValue() {
				return 'old'
			}
		}

		const obj = new TestClass()
		obj.oldValue

		expect(consoleSpy).toHaveBeenCalledWith(
			'TestClass.oldValue is deprecated: Use newValue instead'
		)

		consoleSpy.mockRestore()
	})

	it('should use custom warning message for setters', () => {
		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		class TestClass {
			@deprecated('Use setNewValue() instead')
			set oldValue(_value: string) {
				// deprecated setter
			}
		}

		const obj = new TestClass()
		obj.oldValue = 'test'

		expect(consoleSpy).toHaveBeenCalledWith(
			'TestClass.oldValue is deprecated: Use setNewValue() instead'
		)

		consoleSpy.mockRestore()
	})

	it('should use custom warning message for classes', () => {
		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		@deprecated('Use NewClass instead')
		class OldClass {
			constructor() {}
		}

		new OldClass()

		expect(consoleSpy).toHaveBeenCalledWith('.constructor is deprecated: Use NewClass instead')

		consoleSpy.mockRestore()
	})

	it('should work with different custom messages', () => {
		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		class TestClass {
			@deprecated('This will be removed in v2.0')
			method1() {}

			@deprecated('Use the new API')
			method2() {}
		}

		const obj = new TestClass()
		obj.method1()
		obj.method2()

		expect(consoleSpy).toHaveBeenCalledWith(
			'TestClass.method1 is deprecated: This will be removed in v2.0'
		)
		expect(consoleSpy).toHaveBeenCalledWith('TestClass.method2 is deprecated: Use the new API')

		consoleSpy.mockRestore()
	})
})
