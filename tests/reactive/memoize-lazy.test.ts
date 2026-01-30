import { memoize, reactive, reactiveOptions } from 'mutts'

describe('memoize lazy', () => {
    it('does not recalculate immediately when dependencies change', () => {
        const state = reactive({ value: 1 })
        let computations = 0
        const computed = memoize(() => {
            if (!reactiveOptions.isVerificationRun) computations++
            return state.value * 2
        })

        // Initial call
        expect(computed()).toBe(2)
        expect(computations).toBe(1)

        // Change dependency
        state.value = 2
        
        // Should NOT have recalculated yet
        expect(computations).toBe(1) 

        // Access again
        expect(computed()).toBe(4)
        expect(computations).toBe(2)
    })
})
