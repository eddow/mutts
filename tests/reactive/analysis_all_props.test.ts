import { reactive, effect, reactiveOptions } from '../../src/reactive/index'
import { memoize } from '../../src/reactive/memoize'

describe('Reactivity Analysis: allProps & deepTouch', () => {
    
    it('should trigger allProps on property set (even if keys same)', () => {
        const obj = reactive<{ a: number }>({ a: 1 })
        const fn = jest.fn(() => { Object.keys(obj) })
        
        effect(() => { fn() })
        expect(fn).toHaveBeenCalledTimes(1)

        obj.a = 2
        // Confirmed: Mutts triggers allProps on ANY property touch
        expect(fn).toHaveBeenCalledTimes(2) 
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
            
            const keysFn = jest.fn(() => { Object.keys(obj) })
            effect(() => { keysFn() })
            
            expect(keysFn).toHaveBeenCalledTimes(1)

            // Replace obj.a with same keys (deep touch triggered)
            obj.a = { b: 1 }

            // confirmed: deepTouch suppresses parent touch.
            // Since keys of 'obj' (['a']) haven't changed, this optimization avoids re-running parent keys watchers.
            expect(keysFn).toHaveBeenCalledTimes(1)
        })

        it('should STILL trigger nested allProps on deep touch even if keys same', () => {
            const nested = { b: 1 }
            const obj = reactive({ a: nested })
            
            const nestedKeysFn = jest.fn(() => { Object.keys(obj.a) })
            effect(() => { nestedKeysFn() })

            expect(nestedKeysFn).toHaveBeenCalledTimes(1)

            // Replace obj.a with object having same keys but different value
            obj.a = { b: 2 }

            // confirmed: deepTouch simulates 'set' on nested object 'b'.
            // Since Set triggers allProps, nestedKeysFn re-runs correctly on the child level.
            expect(nestedKeysFn).toHaveBeenCalledTimes(2)
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

         it('should invalidate memoize on property set', () => {
             const instance = new TestClass()
             instance.computed // fill cache
             instance.count = 0
             
             instance.data.a = 2 
             instance.computed
             // Confirming that memoize invalidates on SET because of allProps behavior
             expect(instance.count).toBe(1)
         })
    })

})
