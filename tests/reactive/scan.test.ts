import { cleanup, reactive, reactiveOptions as options, scan } from 'mutts'
import { batch } from '../../src/reactive/effects'

describe('scan', () => {
	let originalDiscrepancy: any
	
	beforeAll(() => {
		originalDiscrepancy = options.onMemoizationDiscrepancy
	})
	
	afterAll(() => {
		options.onMemoizationDiscrepancy = originalDiscrepancy
	})

	it('scans an array reactively', () => {
		const source = reactive([
			{ val: 1 },
			{ val: 2 },
			{ val: 3 },
		])
		
		const result = scan(source, (acc: number, item) => acc + item.val, 0)
		
		expect([...result]).toEqual([1, 3, 6])
		
		source[1].val = 10
		expect([...result]).toEqual([1, 11, 14])
		
		source.push({ val: 5 })
		expect([...result]).toEqual([1, 11, 14, 19])
		
		source.splice(1, 1) // Remove {val: 10}
		expect([...result]).toEqual([1, 4, 9])
		
		result[cleanup]()
	})

	it('optimizes updates when items move', () => {
		const source = reactive([
			{ id: 'A', val: 1 },
			{ id: 'B', val: 2 },
			{ id: 'C', val: 3 },
		])
		
		let calls = 0
		const result = scan(source, (acc: number, item) => {
			if (!options.isVerificationRun) calls++
			return acc + item.val
		}, 0)
		
		expect([...result]).toEqual([1, 3, 6])
		// Optimization: Exactly one call per item.
		expect(calls).toBe(3) 
		
		// Move B to the end: [A, C, B]
		const B = source[1]
		batch(() => {
			source.splice(1, 1)
			source.push(B)
		})
		
		expect([...result]).toEqual([1, 4, 6])
		// C used to be at index 2 (prev B), now at index 1 (prev A). -> call 4
		// B used to be at index 1 (prev A), now at index 2 (prev C). -> call 5
		// A is unchanged and should hit the cache.
		expect(calls).toBe(5) 
		
		result[cleanup]()
	})
    
    it('handles duplicate items', () => {
        const A = reactive({ val: 1 })
        const source = reactive([A, { val: 2 }, A])
        
        const result = scan(source, (acc: number, item) => acc + item.val, 0)
        
        expect([...result]).toEqual([1, 3, 4])
        
        A.val = 10
        expect([...result]).toEqual([10, 12, 22])
        
        result[cleanup]()
    })
})
