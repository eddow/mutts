import { describe, it, expect } from 'vitest'
import { effect, reactive, getActiveEffect } from 'mutts'

describe('async zone leak', () => {
	it('should not leak effect context after promise resolution', async () => {
		const state = reactive({ count: 0 })
		let innerEffect: any = null
		
		// 1. Start an effect
		effect(() => {
			innerEffect = getActiveEffect()
			// 2. Create a promise inside the effect
			// In the browser, the .then() callback will be wrapped to restore this effect
			Promise.resolve().then(() => {
				// Inside the callback, the zone is restored
				state.count++ 
			})
		})
		
		// Wait for the promise microtask to finish
		await new Promise(resolve => setTimeout(resolve, 20))
		
		// 3. After the callback finished, the zone SHOULD be undone (restored to root)
		// If the bug exists, effectHistory.active still points to innerEffect
		const active = getActiveEffect()
		
		// In Node, this passes (no polyfill)
		// In Browser, this should FAIL if the bug exists
		expect(active).toBeUndefined()
	})
})
