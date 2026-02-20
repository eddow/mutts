import { describe, expect, it } from 'vitest'
import { effect, morph, reactive } from '../../src/reactive/index'

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
})
