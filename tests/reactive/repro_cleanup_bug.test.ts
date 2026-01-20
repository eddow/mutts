import { reactive, effect, addBatchCleanup } from '../../src/reactive/index'
import { batch } from '../../src/reactive/effects'

describe('Batch Cleanup Bug Replicaton', () => {
    
    it('should NOT lose effects triggered during batch cleanup', () => {
        const state = reactive({ a: 1, b: 1 })
        let bEffectCount = 0
        
        // This effect will be triggered by a change in 'a'
        // and it will trigger a change in 'b' via cleanup
        effect(() => {
            if (state.a > 1) {
                addBatchCleanup(() => {
                    state.b++ // This should trigger the next effect
                })
            }
        })

        effect(() => {
            state.b
            bEffectCount++
        })

        expect(bEffectCount).toBe(1)

        // Trigger the first effect
        state.a = 2
        
        // If the bug exists, 'state.b++' happens in cleanup, 
        // which adds the second effect to batchQueue.all.
        // But the batch loop has already finished, so the second effect is lost.
        expect(bEffectCount).toBe(2)
    })
})
