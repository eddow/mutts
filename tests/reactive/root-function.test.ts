import { effect, reactive, root, untracked } from '../../src'

describe('untracked and root functions', () => {
	it('untracked should maintain parent cleanup relationship', () => {
		const state = reactive({ count: 0 })
		let cleanupCount = 0
		let effectRunCount = 0
		
		const parentEffect = effect(() => {
			effectRunCount++
			
			// Create child effect inside untracked - should maintain cleanup
			const childCleanup = untracked(() => {
				return effect(() => {
					// This should track dependencies for the child effect
					state.count
				})
			})
			
			// Child should be cleaned up when parent is cleaned up
			return () => {
				childCleanup()
				cleanupCount++
			}
		})
		
		// Initial run
		expect(effectRunCount).toBe(1)
		
		// Change state - should not trigger parent (untracked breaks dependency)
		// but should trigger child if it were tracking
		state.count = 1
		expect(effectRunCount).toBe(1) // Parent should not re-run
		
		// Clean up parent
		parentEffect()
		expect(cleanupCount).toBe(1)
	})
	
	it('root should break both tracking and parent cleanup', () => {
		const state = reactive({ count: 0 })
		let parentRunCount = 0
		let childRunCount = 0
		
		const parentEffect = effect(() => {
			parentRunCount++
			
			// Create detached child effect using root()
			root(() => {
				effect(() => {
					childRunCount++
					state.count
				})
			})
		})
		
		// Initial run
		expect(parentRunCount).toBe(1)
		expect(childRunCount).toBe(1)
		
		// Change state - should trigger child but not parent
		state.count = 1
		expect(parentRunCount).toBe(1) // Parent should not re-run
		expect(childRunCount).toBe(2) // Child should re-run
		
		// Clean up parent - child should continue running
		parentEffect()
		state.count = 2
		expect(childRunCount).toBe(3) // Child still runs after parent cleanup
	})
	
	it('untracked should not track dependencies for parent effect', () => {
		const state = reactive({ count: 0 })
		let runCount = 0
		
		const parentEffect = effect(() => {
			runCount++
			untracked(() => {
				// Accessing state.count here should not create a dependency
				state.count
			})
		})
		
		// Initial run
		expect(runCount).toBe(1)
		
		// Change state - should not trigger parent effect
		state.count = 1
		expect(runCount).toBe(1)
		
		parentEffect()
	})
	
	it('root should not track dependencies for parent effect', () => {
		const state = reactive({ count: 0 })
		let runCount = 0
		
		const parentEffect = effect(() => {
			runCount++
			root(() => {
				// Accessing state.count here should not create a dependency
				state.count
			})
		})
		
		// Initial run
		expect(runCount).toBe(1)
		
		// Change state - should not trigger parent effect
		state.count = 1
		expect(runCount).toBe(1)
		
		parentEffect()
	})
	
	it('should show difference between untracked and root for effect cleanup', () => {
		const state = reactive({ count: 0 })
		let untrackedChildRuns = 0
		let rootChildRuns = 0
		
		const parentEffect = effect(() => {
			// Child with untracked - should be cleaned up with parent
			untracked(() => {
				effect(() => {
					untrackedChildRuns++
					state.count
				})
			})
			
			// Child with root - should continue after parent cleanup
			root(() => {
				effect(() => {
					rootChildRuns++
					state.count
				})
			})
		})
		
		// Initial runs
		expect(untrackedChildRuns).toBe(1)
		expect(rootChildRuns).toBe(1)
		
		// Clean up parent
		parentEffect()
		
		// State changes after parent cleanup
		state.count = 1
		
		// Only root child should continue running
		expect(untrackedChildRuns).toBe(1) // Stopped with parent
		expect(rootChildRuns).toBe(2)     // Still running
	})
})
