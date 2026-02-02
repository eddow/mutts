import { describe, expect, it } from 'vitest'
import { createFlavor, flavorOptions, flavored } from '../src/flavored'

describe('flavored', () => {
	describe('basic flavored function', () => {
		it('should call the base function', () => {
			const greet = flavored(
				(name: string) => `Hello, ${name}!`,
				{}
			)
			expect(greet('World')).toBe('Hello, World!')
		})

		it('should access properties on flavored function', () => {
			const greet = flavored(
				(name: string) => `Hello, ${name}!`,
				{
					get formal() {
						return createFlavor(this, (name: string) => [`Mr./Ms. ${name}`])
					},
				}
			)
			expect(greet.formal('Smith')).toBe('Hello, Mr./Ms. Smith!')
		})
	})

	describe('flavorOptions', () => {
		it('should merge options when last arg is an object', () => {
			function greet(name: string, options?: { loud?: boolean; prefix?: string }) {
				const prefix = options?.prefix ?? 'Hello'
				const greeting = `${prefix}, ${name}!`
				return options?.loud ? greeting.toUpperCase() : greeting
			}

			const loudGreet = flavorOptions(greet, { loud: true })
			expect(loudGreet('World')).toBe('HELLO, WORLD!')
			expect(loudGreet('World', { prefix: 'Hi' })).toBe('HI, WORLD!')
		})

		it('should add options when no options provided', () => {
			function greet(name: string, options?: { loud?: boolean }) {
				const greeting = `Hello, ${name}!`
				return options?.loud ? greeting.toUpperCase() : greeting
			}

			const loudGreet = flavorOptions(greet, { loud: true })
			expect(loudGreet('World')).toBe('HELLO, WORLD!')
		})
	})

	describe('createFlavor', () => {
		it('should transform arguments', () => {
			function add(a: number, b: number) {
				return a + b
			}

			const doubleAdd = createFlavor(add, (a: number, b: number): [number, number] => [a * 2, b * 2])
			expect(doubleAdd(3, 4)).toBe(14) // (3*2) + (4*2) = 14
		})

		it('should work with flavored to create chainable modifiers', () => {
			const calculator = flavored(
				(a: number, b: number, opts?: { multiply?: boolean }) => {
					if (opts?.multiply) return a * b
					return a + b
				},
				{
					get multiply() {
						return flavorOptions(this, { multiply: true })
					},
					double(): (a: number, b: number, opts?: { multiply?: boolean }) => number {
						return createFlavor(this, (a: number, b: number, opts?): [number, number, typeof opts] => [a * 2, b * 2, opts])
					},
				}
			)

			// Basic
			expect(calculator(3, 4)).toBe(7)
			// With flavorOptions modifier
			expect(calculator.multiply(3, 4)).toBe(12)
			// Note: double() returns a plain function, not re-flavored, so no chaining from it
			const doubledCalc = calculator.double()
			expect(doubledCalc(3, 4)).toBe(14) // (6 + 8) = 14
		})
	})

	describe('generic hand-made function case', () => {
		it('should allow returning a completely custom function', () => {
			// This is the "generic case" - when you need full control
			function fetchData(url: string, options?: { timeout?: number; retries?: number }) {
				return { url, options }
			}

			const flavoredFetch = flavored(fetchData, {
				// Returns a hand-made function that wraps the original
				withTimeout(timeout: number) {
					return (url: string, options?: { retries?: number }) => {
						return fetchData(url, { ...options, timeout })
					}
				},
				// Returns a hand-made function with preset retries
				withRetries(retries: number) {
					return (url: string, options?: { timeout?: number }) => {
						return fetchData(url, { ...options, retries })
					}
				},
			})

			// Hand-made function returns a new function, not a flavored proxy
			const withTimeout500 = flavoredFetch.withTimeout(500)
			expect(withTimeout500('api.com')).toEqual({
				url: 'api.com',
				options: { timeout: 500 },
			})

			// Can still combine with other options
			const withTimeoutAndRetries = flavoredFetch.withTimeout(500)
			expect(withTimeoutAndRetries('api.com', { retries: 3 })).toEqual({
				url: 'api.com',
				options: { timeout: 500, retries: 3 },
			})
		})

		it('should allow hand-made functions to be re-flavored', () => {
			function process(value: number, options?: { multiplier?: number; offset?: number }) {
				const mult = options?.multiplier ?? 1
				const off = options?.offset ?? 0
				return value * mult + off
			}

			const flavoredProcess = flavored(process, {
				// Returns a hand-made flavored function
				presetMultiplier(multiplier: number) {
					const presetFn = (value: number, options?: { offset?: number }) => {
						return process(value, { ...options, multiplier })
					}
					// Re-flavor it so we can chain more modifiers
					return flavored(presetFn, {
						get withOffset() {
							return flavorOptions(this, { offset: 10 })
						},
					})
				},
			})

			const times3 = flavoredProcess.presetMultiplier(3)
			expect(times3(5)).toBe(15) // 5 * 3
			expect(times3.withOffset(5)).toBe(25) // 5 * 3 + 10 (default offset from getter)
		})
	})

	describe('chaining', () => {
		it('should chain multiple flavorOptions modifiers', () => {
			function createUser(name: string, options?: { admin?: boolean; verified?: boolean }) {
				return { name, ...options }
			}

			const flavoredCreate = flavored(createUser, {
				get admin() {
					return flavorOptions(this, { admin: true })
				},
				get verified() {
					return flavorOptions(this, { verified: true })
				},
			})

			expect(flavoredCreate('Alice')).toEqual({ name: 'Alice' })
			expect(flavoredCreate.admin('Bob')).toEqual({ name: 'Bob', admin: true })
			expect(flavoredCreate.verified('Charlie')).toEqual({ name: 'Charlie', verified: true })
			expect(flavoredCreate.admin.verified('Diana')).toEqual({
				name: 'Diana',
				admin: true,
				verified: true,
			})
		})
	})
})
