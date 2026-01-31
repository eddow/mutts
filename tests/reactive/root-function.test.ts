import { effect, reactive, root, untracked } from 'mutts'

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
})
