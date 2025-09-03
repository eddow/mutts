import { chainPromise } from './promiseChain'

describe('chain', () => {
	describe('basic functionality', () => {
		it('should return non-promise values as-is', () => {
			const value = { name: 'test', value: 42 }
			const result = chainPromise(value)
			expect(result).toEqual(value)
		})

		it('should chain method calls on resolved promise values', async () => {
			const obj = {
				getName: () => 'John',
				getAge: () => 30,
				getInfo: () => ({ name: 'John', age: 30 }),
			}
			const promise = Promise.resolve(obj)

			const result = await chainPromise(promise).getName()
			expect(result).toBe('John')
		})

		it('should support multiple method chaining', async () => {
			const obj = {
				getName: () => 'John',
				getAge: () => 30,
				getInfo: () => ({ name: 'John', age: 30 }),
			}
			const promise = Promise.resolve(obj)

			const result = await chainPromise(promise).getInfo().name
			expect(result).toBe('John')
		})

		it('should handle async methods', async () => {
			const obj = {
				getName: async () => 'John',
				getAge: async () => 30,
			}
			const promise = Promise.resolve(obj)

			//const result = await chainPromise(promise).getName()
			const chained = chainPromise(promise)
			const getName = chained.getName
			const result = await getName()
			expect(result).toBe('John')
		})

		it('should handle methods with parameters', async () => {
			const obj = {
				add: (a: number, b: number) => a + b,
				multiply: (a: number, b: number) => a * b,
			}
			const promise = Promise.resolve(obj)

			const result = await chainPromise(promise).add(5, 3)
			expect(result).toBe(8)
		})
	})

	describe('function calls', () => {
		it('should allow calling the resolved value as a function', async () => {
			const func = (name: string, age: number) => `${name} is ${age} years old`
			const promise = Promise.resolve(func)

			const result = await (chainPromise(promise) as any)('John', 30)
			expect(result).toBe('John is 30 years old')
		})

		it('should handle async functions', async () => {
			const asyncFunc = async (name: string) => `Hello ${name}`
			const promise = Promise.resolve(asyncFunc)

			const result = await (chainPromise(promise) as any)('World')
			expect(result).toBe('Hello World')
		})
	})
	/*
	describe('caching behavior', () => {
		it('should return the same proxy for the same promise', () => {
			const promise = Promise.resolve({ test: () => 'value' })
			const chain1 = chainPromise(promise)
			const chain2 = chainPromise(promise)
			
			expect(chain1).toBe(chain2)
		})

		it('should not cache different promises', async () => {
			const promise1 = Promise.resolve({ test: () => 'value1' })
			const promise2 = Promise.resolve({ test: () => 'value2' })
			const chain1 = chainPromise(promise1)
			const chain2 = chainPromise(promise2)
			
			expect(chain1).not.toBe(chain2)
			expect(await chain1).not.toBe(await chain2)
		})
	})*/

	describe('complex scenarios', () => {
		it('should handle nested object methods', async () => {
			const obj = {
				user: {
					getName: () => 'John',
					getProfile: () => ({
						age: 30,
						email: 'john@example.com',
					}),
				},
			}
			const promise = Promise.resolve(obj)

			const result = await chainPromise(promise).user.getProfile().email
			expect(result).toBe('john@example.com')
		})

		it('should handle array methods', async () => {
			const arr = [1, 2, 3, 4, 5]
			const promise = Promise.resolve(arr)

			//const result = await chainPromise(promise).filter(x => x > 2).map(x => x * 2)

			const chained = chainPromise(promise)
			const filtered = chained.filter((x) => {
				return x > 2
			})
			const result = filtered.map((x) => {
				return x * 2
			})
			const awaitResult = await result
			expect(awaitResult).toEqual([6, 8, 10])
		})

		it('should handle methods that return promises', async () => {
			const obj = {
				getData: () => Promise.resolve({ id: 1, name: 'test' }),
				processData: (data: any) => Promise.resolve({ ...data, processed: true }),
			}
			const promise = Promise.resolve(obj)

			const result = await chainPromise(promise).getData().name
			expect(result).toBe('test')
		})

		it('should handle methods that return promises recursively', async () => {
			const obj = {
				getData: () => Promise.resolve({ id: 1, name: 'test' }),
				processData: (data: any) => Promise.resolve({ ...data, processed: true }),
			}

			//const result = await chainPromise(obj).getData().name
			const chain = chainPromise(obj)
			const getData = chain.getData
			const data = getData()
			const result = await data.name
			expect(result).toBe('test')
		})
	})

	describe('error handling', () => {
		it('should handle methods that throw errors', async () => {
			const obj = {
				errorMethod: () => {
					throw new Error('Method error')
				},
			}
			const promise = Promise.resolve(obj)

			await expect(chainPromise(promise).errorMethod()).rejects.toThrow('Method error')
		})
	})

	describe('edge cases', () => {
		it('should handle null and undefined values', () => {
			expect(chainPromise(null)).toBeNull()
			expect(chainPromise(undefined)).toBeUndefined()
		})

		it('should handle primitive values', () => {
			expect(chainPromise(42)).toBe(42)
			expect(chainPromise('string')).toBe('string')
			expect(chainPromise(true)).toBe(true)
		})

		it('should handle objects without methods', async () => {
			const obj = { name: 'test', value: 42 }
			const promise = Promise.resolve(obj)

			const result = await chainPromise(promise).name
			expect(result).toBe('test')
		})

		it('should handle symbols as property names', async () => {
			const sym = Symbol('test')
			const obj = { [sym]: () => 'symbol value' }
			const promise = Promise.resolve(obj)

			const result = await chainPromise(promise)[sym]()
			expect(result).toBe('symbol value')
		})
	})
})
