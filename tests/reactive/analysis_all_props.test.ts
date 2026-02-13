import { effect, memoize, reactive, reactiveOptions } from 'mutts'

describe('Reactivity Analysis: allProps & deepTouch', () => {
    
    it('should NOT trigger keysOf on property set (keys unchanged)', () => {
        const obj = reactive<{ a: number }>({ a: 1 })
        const fn = vi.fn(() => { Object.keys(obj) })
        
        effect(() => { fn() })
        expect(fn).toHaveBeenCalledTimes(1)

        obj.a = 2
        // keysOf: Object.keys() only re-runs on structural changes (add/delete), not value set
        expect(fn).toHaveBeenCalledTimes(1) 
    })

    describe('with Deep Touch', () => {
        const originalRecursiveTouching = reactiveOptions.recursiveTouching

        beforeEach(() => {
            reactiveOptions.recursiveTouching = true
        })

        afterEach(() => {
            reactiveOptions.recursiveTouching = originalRecursiveTouching
        })

        it('should suppress parent allProps when replacing object with deep touch (Optimization)', () => {
            const nested = { b: 1 }
            const obj = reactive({ a: nested })
            
            const keysFn = vi.fn(() => { Object.keys(obj) })
            effect(() => { keysFn() })
            
            expect(keysFn).toHaveBeenCalledTimes(1)

            // Replace obj.a with same keys (deep touch triggered)
            obj.a = { b: 1 }

            // confirmed: deepTouch suppresses parent touch.
            // Since keys of 'obj' (['a']) haven't changed, this optimization avoids re-running parent keys watchers.
            expect(keysFn).toHaveBeenCalledTimes(1)
        })

        it('should NOT trigger nested keysOf on deep touch when keys same', () => {
            const nested = { b: 1 }
            const obj = reactive({ a: nested })
            
            const nestedKeysFn = vi.fn(() => { Object.keys(obj.a) })
            effect(() => { nestedKeysFn() })

            expect(nestedKeysFn).toHaveBeenCalledTimes(1)

            // Replace obj.a with object having same keys but different value
            obj.a = { b: 2 }

            // deepTouch simulates 'set' on nested 'b', but keysOf is not triggered by set.
            // Keys of obj.a are still ['b'], so no re-run.
            expect(nestedKeysFn).toHaveBeenCalledTimes(1)
        })
    })

    describe('Memoization & touched1', () => {
         class TestClass {
            count = 0
            
            @memoize
            get computed() {
                if (!reactiveOptions.isVerificationRun) this.count++
                return Object.keys(this.data)
            }

            data = reactive<{a?: number}>({ a: 1 })
         }

         it('should NOT invalidate memoize on property set when only keys tracked', () => {
             const instance = new TestClass()
             instance.computed // fill cache
             instance.count = 0
             
             instance.data.a = 2 
             instance.computed
             // keysOf: memoize using Object.keys() is not invalidated by value set
             // because the keys haven't changed — correct optimization
             expect(instance.count).toBe(0)
         })
    })

})
