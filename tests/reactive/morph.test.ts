import { describe, expect, it } from 'vitest'
import { effect, morph, reactive } from '../../src/reactive/index'
import { digestLineage, getLineage } from '../../debug'

describe('morph undefined value bug', () => {
	it('should not expose undefined values during array diff processing', () => {
		const source = reactive([{ id: 1 }, { id: 2 }, { id: 3 }])
		const results: any[] = []
		
		// Create a morph that tracks when undefined is passed
		const morphed = morph(source, (item) => {
			results.push(item)
			return item
		})
		
		// Read initial values
		expect(morphed[0]).toEqual({ id: 1 })
		expect(morphed[1]).toEqual({ id: 2 })
		expect(morphed[2]).toEqual({ id: 3 })
		expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
		
		// Clear results for next operation
		results.length = 0
		
		// Now remove the middle item - this triggers the bug
		source.splice(1, 1)
		
		// The morphed array should have correct values
		expect(morphed[0]).toEqual({ id: 1 })
		expect(morphed[1]).toEqual({ id: 3 })
		expect(morphed.length).toBe(2)
		
		// BUG: undefined values are exposed during processing
		expect(results).not.toContain(undefined)
	})
	
	it('should not pass undefined to morph callback during splice', () => {
		const source = reactive([{ id: 1 }])
		const callbackValues: any[] = []
		
		const morphed = morph(source, (item) => {
			callbackValues.push(item)
			return item
		})
		
		// Read initial value
		expect(morphed[0]).toEqual({ id: 1 })
		
		// Clear callback values
		callbackValues.length = 0
		
		// Replace entire array with empty array (like clearing todos)
		source.splice(0, source.length)
		
		// The callback should not receive undefined values
		// This is the core bug: undefined is passed to the callback
		expect(callbackValues).not.toContain(undefined)
		expect(callbackValues.length).toBe(0) // Should be empty since array is empty
	})
	
	it('should not expose undefined when replacing entire array', () => {
		const source = reactive([{ id: 1 }])
		const results: any[] = []
		let undefinedCount = 0
		
		const morphed = morph(source, (item) => {
			if (item === undefined) {
				undefinedCount++
			}
			results.push(item)
			return item
		})
		
		// Read initial value
		expect(morphed[0]).toEqual({ id: 1 })
		
		// Clear results
		results.length = 0
		undefinedCount = 0
		
		// Replace entire array with filtered version (like in the Todo test)
		const filtered = source.filter(item => item.id !== 1)
		source.splice(0, source.length, ...filtered)
		
		// Should not see undefined values
		expect(undefinedCount).toBe(0)
		expect(results).not.toContain(undefined)
	})
	
	it('should handle effects that read during morph processing', () => {
		const source = reactive([{ id: 1 }, { id: 2 }])
		const seenValues: any[] = []
		const undefinedValues: any[] = []
		
		const morphed = morph(source, (item) => item)
		
		// Create an effect that reads the morphed array
		const stop = effect(() => {
			// Read all items - this triggers the bug when morph is processing
			for (let i = 0; i < morphed.length; i++) {
				const item = morphed[i]
				if (item === undefined) {
					undefinedValues.push(item)
				} else {
					seenValues.push(item.id)
				}
			}
		})
		
		// Clear initial values
		seenValues.length = 0
		undefinedValues.length = 0
		
		// Remove first item - this should not expose undefined values
		source.splice(0, 1)
		
		// Should not see undefined values
		expect(undefinedValues).toEqual([])
		expect(undefinedValues.length).toBe(0)
		
		// The effect may run multiple times, but should never see undefined
		expect(seenValues.filter(v => v !== undefined)).not.toContain(undefined)
		
		stop()
	})

	it('morphs Map correctly and lazily', () => {
		const source = reactive(new Map([['a', 1], ['b', 2]]))
		let count = 0
		const mapped = morph(source, (v: number) => {
			count++
			return v * 10
		})
		
		expect(mapped.has('a')).toBe(true)
		expect(count).toBe(0) // Lazy
		
		expect(mapped.get('a')).toBe(10)
		expect(count).toBe(1)
		
		source.set('a', 100)
		expect(mapped.get('a')).toBe(1000)
		expect(count).toBe(2)
		
		source.delete('a')
		expect(mapped.has('a')).toBe(false)
	})

	it('morphs Map: add and del are reactive via effect', () => {
		const source = reactive(new Map([['a', 1]]))
		const mapped = morph(source, (v: number) => v * 10)
		const keys: string[][] = []
		const stop = effect(() => { keys.push([...mapped.keys()]) })

		expect(keys).toEqual([['a']])

		source.set('b', 2)
		expect(keys).toEqual([['a'], ['a', 'b']])
		expect(mapped.get('b')).toBe(20)

		source.delete('a')
		expect(keys).toEqual([['a'], ['a', 'b'], ['b']])
		expect(mapped.has('a')).toBe(false)

		stop()
	})

	it('morphs Record correctly and lazily', () => {
		const source = reactive({ a: 1, b: 2 }) as Record<string, number>
		let count = 0
		const mapped = morph(source, (v: number) => {
			count++
			return v * 10
		})
		
		expect('a' in mapped).toBe(true)
		expect(count).toBe(0) // Lazy
		
		expect(mapped.a).toBe(10)
		expect(count).toBe(1)
		
		source.a = 100
		expect(mapped.a).toBe(1000)
		expect(count).toBe(2)
		
		delete source.a
		expect('a' in mapped).toBe(false)
	})

	it('morphArray: replaces nested object when source item is replaced', () => {
		type User = { name: { first: string; last: string } }
		const source = reactive([
			{ name: { first: 'Alice', last: 'A' } },
			{ name: { first: 'Bob', last: 'B' } },
		] as User[])
		const mapped = morph(source, (u: User) => u.name)

		expect(mapped[0]).toEqual({ first: 'Alice', last: 'A' })
		expect(mapped[1]).toEqual({ first: 'Bob', last: 'B' })

		source[0] = { name: { first: 'Carol', last: 'C' } }
		expect(mapped[0]).toEqual({ first: 'Carol', last: 'C' })
	})

	it('morphRecord: replaces nested object when source value is replaced', () => {
		type User = { name: { first: string; last: string } }
		const source = reactive({
			alice: { name: { first: 'Alice', last: 'A' } },
			bob: { name: { first: 'Bob', last: 'B' } },
		} as Record<string, User>)
		const mapped = morph(source, (u: User) => u.name)

		expect(mapped.alice).toEqual({ first: 'Alice', last: 'A' })
		expect(mapped.bob).toEqual({ first: 'Bob', last: 'B' })

		source.alice = { name: { first: 'Carol', last: 'C' } }
		expect(mapped.alice).toEqual({ first: 'Carol', last: 'C' })
	})

	it('morphMap: replaces nested object when source value is replaced', () => {
		type User = { name: { first: string; last: string } }
		const source = reactive(new Map<string, User>([
			['alice', { name: { first: 'Alice', last: 'A' } }],
			['bob', { name: { first: 'Bob', last: 'B' } }],
		]))
		const mapped = morph(source, (u: User) => u.name)

		expect(mapped.get('alice')).toEqual({ first: 'Alice', last: 'A' })
		expect(mapped.get('bob')).toEqual({ first: 'Bob', last: 'B' })

		source.set('alice', { name: { first: 'Carol', last: 'C' } })
		expect(mapped.get('alice')).toEqual({ first: 'Carol', last: 'C' })
	})

	it('morphs Record: add and del are reactive via effect', () => {
		const source = reactive({ a: 1 }) as Record<string, number>
		const mapped = morph(source, (v: number) => v * 10)
		const keys: string[][] = []
		const stop = effect(() => { keys.push(Object.keys(mapped)) })

		expect(keys).toEqual([['a']])

		source.b = 2
		expect(keys).toEqual([['a'], ['a', 'b']])
		expect(mapped.b).toBe(20)

		delete source.a
		expect(keys).toEqual([['a'], ['a', 'b'], ['b']])
		expect('a' in mapped).toBe(false)

		stop()
	})

	it('accepts template-captioned mapper callbacks on the second argument', () => {
		const source = reactive([{ id: 1 }])
		let effectName = ''
		const mapped = morph`items:${'mapper'}`(source, (item) => {
			effectName = digestLineage(getLineage())[0]?.effectName ?? ''
			return item.id
		})

		expect(mapped[0]).toBe(1)
		expect(effectName).toBe('morph:items:mapper:0')
	})

	describe('array morph position.index', () => {
		it('provides position.index in array morph callback', () => {
			const source = reactive(['a', 'b', 'c'])
			const indices: number[] = []
			const mapped = morph(source, (item, position) => {
				indices.push(position.index)
				return `${item}@${position.index}`
			})

			// Trigger computation
			expect(mapped[0]).toBe('a@0')
			expect(mapped[1]).toBe('b@1')
			expect(mapped[2]).toBe('c@2')
			expect(indices).toEqual([0, 1, 2])
		})

		it('provides stable position objects per item', () => {
			const source = reactive(['a', 'b'])
			const positions: any[] = []
			const mapped = morph(source, (item, position) => {
				positions.push(position)
				return item
			})

			// Compute items
			expect(mapped[0]).toBe('a')
			expect(mapped[1]).toBe('b')

			// Position objects should be stable
			expect(positions[0]).toBe(positions[0])
			expect(positions[1]).toBe(positions[1])
			expect(positions[0]).not.toBe(positions[1])
		})

		it('updates position.index when items are shifted', () => {
			const source = reactive(['a', 'b', 'c'])
			const latestIndices: number[] = []
			const mapped = morph(source, (item, position) => {
				latestIndices.push(position.index)
				return `${item}@${position.index}`
			})

			// Initial computation
			expect(mapped[0]).toBe('a@0')
			expect(mapped[1]).toBe('b@1')
			expect(mapped[2]).toBe('c@2')
			latestIndices.length = 0

			// Insert at beginning
			source.unshift('x')

			// Trigger recomputation
			expect(mapped[0]).toBe('x@0')
			expect(mapped[1]).toBe('a@1')
			expect(mapped[2]).toBe('b@2')
			expect(mapped[3]).toBe('c@3')

			// Should have recomputed shifted items with new indices
			expect(latestIndices).toEqual([0, 1, 2, 3])
		})

		it('updates position.index when item moves due to splice', () => {
			const source = reactive(['a', 'b', 'c', 'd'])
			const positionByItem = new Map<string, number>()
			const mapped = morph(source, (item, position) => {
				positionByItem.set(item, position.index)
				return item
			})

			// Initial positions
			expect(mapped[0]).toBe('a')
			expect(mapped[1]).toBe('b')
			expect(mapped[2]).toBe('c')
			expect(mapped[3]).toBe('d')
			expect(positionByItem.get('a')).toBe(0)
			expect(positionByItem.get('b')).toBe(1)
			expect(positionByItem.get('c')).toBe(2)
			expect(positionByItem.get('d')).toBe(3)

			// Move 'c' to front
			source.splice(2, 1)
			source.unshift('c')

			// Trigger recomputation
			expect(mapped[0]).toBe('c')
			expect(mapped[1]).toBe('a')
			expect(mapped[2]).toBe('b')
			expect(mapped[3]).toBe('d')

			// Positions should be updated
			expect(positionByItem.get('c')).toBe(0)
			expect(positionByItem.get('a')).toBe(1)
			expect(positionByItem.get('b')).toBe(2)
			expect(positionByItem.get('d')).toBe(3)
		})

		it('reactively recomputes when position.index changes', () => {
			const source = reactive(['a', 'b'])
			const recomputeLog: string[] = []
			const mapped = morph(source, (item, position) => {
				recomputeLog.push(`${item}@${position.index}`)
				return `${item}@${position.index}`
			})

			// Initial computation
			expect(mapped[0]).toBe('a@0')
			expect(mapped[1]).toBe('b@1')
			recomputeLog.length = 0

			// Insert at beginning - should recompute all items
			source.unshift('x')

			// Access to trigger recomputation
			expect(mapped[0]).toBe('x@0')
			expect(mapped[1]).toBe('a@1')
			expect(mapped[2]).toBe('b@2')

			// All items should have recomputed due to index changes
			expect(recomputeLog).toEqual(['x@0', 'a@1', 'b@2'])
		})

		it('works with pure option', () => {
			const source = reactive(['a', 'b'])
			const indices: number[] = []
			const mapped = morph(source, (item, position) => {
				indices.push(position.index)
				return `${item}@${position.index}`
			}, { pure: true })

			// Trigger computation
			expect(mapped[0]).toBe('a@0')
			expect(mapped[1]).toBe('b@1')
			expect(indices).toEqual([0, 1])
		})
	})
})
