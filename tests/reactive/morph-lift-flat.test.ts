import { describe, expect, test } from 'vitest'
import { reactive, lift, morph, effect } from 'mutts'

describe('morph + lift + flat interaction', () => {
	test('tree structure: morph then lift with flat - add element in branch', () => {
		// Create a tree structure: arrays nested in arrays
		const source = reactive([
			{ id: 1, children: reactive(['a', 'b']) },
			{ id: 2, children: reactive(['c', 'd']) },
			{ id: 3, children: reactive(['e', 'f']) }
		])
		
		// Morph each node to extract its children
		const morphed = morph(source, node => node.children)
		
		// Lift with flat to flatten all children into a single array
		// Need to access all morphed elements first to ensure they're computed
		const flattened = lift(() => {
			// Access all elements to trigger morph computation
			/* Here - it should of course work without this loop
			for (let i = 0; i < morphed.length; i++) {
				morphed[i] // This triggers the morph for each element
			}
			*/
			const rv = morphed.flat()
			return rv
		})
		
		let effectRuns = 0
		let flatValues: string[][] = []
		
		// Track the flattened values
		effect(() => {
			effectRuns++
			flatValues.push([...flattened])
		})
		
		// Initial state
		expect(effectRuns).toBe(1)
		expect(flatValues[0]).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
		expect(flattened.length).toBe(6)
		
		// Add element to a branch (second node's children)
		source[1].children.push('g')
		
		// Should trigger effect and update flat
		expect(effectRuns).toBe(2)
		expect(flatValues[1]).toEqual(['a', 'b', 'c', 'd', 'g', 'e', 'f'])
		expect(flattened.length).toBe(7)
		
		// Add element to another branch
		source[0].children.push('h')
		
		expect(effectRuns).toBe(3)
		expect(flatValues[2]).toEqual(['a', 'b', 'h', 'c', 'd', 'g', 'e', 'f'])
		expect(flattened.length).toBe(8)
		
		// Add a new node to the source
		source.push({ 
			id: 4, 
			children: reactive(['i', 'j']) 
		})
		
		expect(effectRuns).toBe(4)
		expect(flatValues[3]).toEqual(['a', 'b', 'h', 'c', 'd', 'g', 'e', 'f', 'i', 'j'])
		expect(flattened.length).toBe(10)
	})
	
	test('deeper nesting: morph -> lift -> flat -> lift again', () => {
		// Three levels deep
		const source = reactive([
			{
				groups: reactive([
					{ items: reactive([1, 2]) },
					{ items: reactive([3, 4]) }
				])
			},
			{
				groups: reactive([
					{ items: reactive([5, 6]) },
					{ items: reactive([7, 8]) }
				])
			}
		])
		
		// Morph to get groups
		const groups = morph(source, node => node.groups)
		
		// Flat groups and morph to get items
		const flatGroups = lift(() => {
			// Access all groups
			for (let i = 0; i < groups.length; i++) {
				groups[i]
			}
			return groups.flat()
		})
		const items = morph(flatGroups, group => group.items)
		
		// Flat items to get all numbers
		const allItems = lift(() => {
			// Access all items
			for (let i = 0; i < items.length; i++) {
				items[i]
			}
			return items.flat()
		})
		
		let effectRuns = 0
		effect(() => {
			effectRuns++
			// Force reading all items
			;[...allItems]
		})
		
		// Initial state
		expect(effectRuns).toBe(1)
		expect([...allItems]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
		
		// Add item to a deeply nested branch
		source[0].groups[0].items.push(9)
		
		expect(effectRuns).toBe(2)
		expect([...allItems]).toEqual([1, 2, 9, 3, 4, 5, 6, 7, 8])
		
		// Add new group to first node
		source[0].groups.push({ items: reactive([10, 11]) })
		
		expect(effectRuns).toBe(3)
		expect([...allItems]).toEqual([1, 2, 9, 3, 4, 10, 11, 5, 6, 7, 8])
	})
	
	test('sparse arrays with morph + lift + flat', () => {
		const source = reactive([
			{ values: reactive([1, 2]) },
			{ values: reactive([3, 4]) }
		])
		
		const morphed = morph(source, node => node.values)
		const flattened = lift(() => {
			// Access all morphed elements
			for (let i = 0; i < morphed.length; i++) {
				morphed[i]
			}
			return morphed.flat()
		})
		
		let effectRuns = 0
		effect(() => {
			effectRuns++
			;[...flattened]
		})
		
		// Initial state
		expect(effectRuns).toBe(1)
		expect([...flattened]).toEqual([1, 2, 3, 4])
		
		// Add element to a branch
		source[0].values.push(5)
		
		expect(effectRuns).toBe(2)
		expect([...flattened]).toEqual([1, 2, 5, 3, 4])
	})
})
