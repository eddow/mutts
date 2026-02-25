import { describe, expect, it } from 'vitest'
import { reactive, effect, assertUntracked } from '../src/index'

describe('assertUntracked', () => {
	it('allows code that does not track dependencies', () => {
		const state = reactive({ count: 0 })
		
		expect(() => {
			assertUntracked(() => {
				// Plain reads without an active effect don't track
				const x = 1 + 1
				return x
			})
		}).not.toThrow()
	})

	it('throws when reactive dependencies are tracked', () => {
		const state = reactive({ count: 0 })
		
		effect(() => {
			expect(() => {
				assertUntracked(() => {
					// This should throw because we're reading state.count inside an effect
					return state.count
				})
			}).toThrow(/Reactive dependency tracking detected in assertUntracked context/)
		})
	})

	it('throws on nested assertUntracked calls', () => {
		expect(() => {
			assertUntracked(() => {
				assertUntracked(() => {
					return 42
				})
			})
		}).toThrow(/nested calls are not supported/)
	})

	it('resets flag even if function throws', () => {
		const state = reactive({ count: 0 })
		
		effect(() => {
			try {
				assertUntracked(() => {
					state.count // This will throw
				})
			} catch (e) {
				// Expected
			}
			
			// Should be able to call assertUntracked again after error
			expect(() => {
				assertUntracked(() => 42)
			}).not.toThrow(/nested/)
		})
	})
})
