import { describe, expect, it } from 'vitest'
import { attend, effect, reactive } from '../../src/reactive'

describe('attend (reactive forEach)', () => {
	describe('raw callback form', () => {
		it('should call callback for each key in a record', () => {
			const source = reactive({ a: 1, b: 2 })
			const seen = new Map<string, number>()

			attend(
				() => Object.keys(source),
				(key) => {
					seen.set(key, (source as any)[key])
				}
			)

			expect(seen.get('a')).toBe(1)
			expect(seen.get('b')).toBe(2)
		})

		it('should react to added keys', () => {
			const source = reactive({} as Record<string, number>)
			const seen = new Map<string, number>()

			attend(
				() => Object.keys(source),
				(key) => {
					seen.set(key, source[key])
				}
			)

			expect(seen.size).toBe(0)

			source.x = 42
			expect(seen.get('x')).toBe(42)
		})

		it('should dispose inner effect when key is removed', () => {
			const source = reactive({ a: 1, b: 2 } as Record<string, number>)
			let cleanupCalled = ''

			attend(
				() => Object.keys(source),
				(key) => {
					source[key]
					return () => {
						cleanupCalled = key
					}
				}
			)

			expect(cleanupCalled).toBe('')

			delete source.a
			expect(cleanupCalled).toBe('a')
		})

		it('should tear down everything when stop is called', () => {
			const source = reactive({ a: 1 } as Record<string, number>)
			const cleaned: string[] = []

			const stop = attend(
				() => Object.keys(source),
				(key) => {
					source[key]
					return () => {
						cleaned.push(key)
					}
				}
			)

			stop()
			expect(cleaned).toContain('a')

			const sizeBefore = cleaned.length
			source.b = 2
			expect(cleaned.length).toBe(sizeBefore)
		})

		it('should re-run inner effect when tracked value changes', () => {
			const source = reactive({ a: 1 } as Record<string, number>)
			let callCount = 0

			attend(
				() => Object.keys(source),
				(key) => {
					source[key]
					callCount++
				}
			)

			expect(callCount).toBe(1)

			source.a = 99
			expect(callCount).toBe(2)
		})

		it('should not re-create effects for stable keys', () => {
			const source = reactive({ a: 1, b: 2 } as Record<string, number>)
			const created: string[] = []

			attend(
				() => Object.keys(source),
				(key) => {
					created.push(key)
					source[key]
				}
			)

			expect(created).toEqual(['a', 'b'])

			source.c = 3
			expect(created).toEqual(['a', 'b', 'c'])
		})

		it('should work inside a parent effect (nested)', () => {
			const toggle = reactive({ on: true })
			const source = reactive({ a: 1 } as Record<string, number>)
			const seen: string[] = []
			const cleaned: string[] = []

			effect(() => {
				if (toggle.on) {
					attend(
						() => Object.keys(source),
						(key) => {
							seen.push(key)
							source[key]
							return () => {
								cleaned.push(key)
							}
						}
					)
				}
			})

			expect(seen).toEqual(['a'])

			toggle.on = false
			expect(cleaned).toContain('a')
		})
	})

	describe('record shorthand', () => {
		it('should attend each key of a record', () => {
			const source = reactive({ a: 1, b: 2 } as Record<string, number>)
			const seen = new Map<string, number>()

			attend(source, (key) => {
				seen.set(key, source[key])
			})

			expect(seen.get('a')).toBe(1)
			expect(seen.get('b')).toBe(2)
		})

		it('should react to added and removed keys', () => {
			const source = reactive({ a: 1 } as Record<string, number>)
			const seen = new Map<string, number>()
			let cleaned = ''

			attend(source, (key) => {
				seen.set(key, source[key])
				return () => { cleaned = key }
			})

			source.b = 2
			expect(seen.get('b')).toBe(2)

			delete source.a
			expect(cleaned).toBe('a')
		})
	})

	describe('array shorthand', () => {
		it('should attend each index of an array', () => {
			const source = reactive([10, 20, 30])
			const seen = new Map<number, number>()

			attend(source, (i) => {
				seen.set(i, source[i])
			})

			expect(seen.get(0)).toBe(10)
			expect(seen.get(1)).toBe(20)
			expect(seen.get(2)).toBe(30)
		})

		it('should react to push and pop', () => {
			const source = reactive([1, 2])
			const seen = new Map<number, number>()

			attend(source, (i) => {
				seen.set(i, source[i])
			})

			source.push(3)
			expect(seen.get(2)).toBe(3)
		})
	})

	describe('Map shorthand', () => {
		it('should attend each key of a Map', () => {
			const source = reactive(new Map<string, number>([['x', 1], ['y', 2]]))
			const seen = new Map<string, number>()

			attend(source, (key) => {
				seen.set(key, source.get(key)!)
			})

			expect(seen.get('x')).toBe(1)
			expect(seen.get('y')).toBe(2)

			source.set('z', 3)
			expect(seen.get('z')).toBe(3)
		})

		it('should clean up when a key is deleted', () => {
			const source = reactive(new Map<string, number>([['a', 1]]))
			let cleaned = ''

			attend(source, (key) => {
				source.get(key)
				return () => { cleaned = key }
			})

			source.delete('a')
			expect(cleaned).toBe('a')
		})
	})

	describe('Set shorthand', () => {
		it('should attend each value of a Set', () => {
			const source = reactive(new Set(['a', 'b', 'c']))
			const seen: string[] = []

			attend(source, (value) => {
				seen.push(value)
			})

			expect(seen).toEqual(['a', 'b', 'c'])
		})

		it('should react to add and delete', () => {
			const source = reactive(new Set(['x']))
			const seen: string[] = []
			let cleaned = ''

			attend(source, (value) => {
				seen.push(value)
				return () => { cleaned = value }
			})

			expect(seen).toEqual(['x'])

			source.add('y')
			expect(seen).toContain('y')

			source.delete('x')
			expect(cleaned).toBe('x')
		})
	})
})
