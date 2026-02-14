import { memoize } from '../../src/reactive/memoize'
import { describe, it, expect, vi } from 'vitest'
import { root, reactive } from '../../src/reactive'

describe('memoize(object)', () => {
    it('passes through simple values', () => {
        const source = reactive({ a: 1, b: 'hello' })
        // @ts-ignore
        const proxy = memoize(source)
        expect(proxy.a).toBe(1)
        expect(proxy.b).toBe('hello')
        
        // Write through
        proxy.a = 2
        expect(source.a).toBe(2)
        expect(proxy.a).toBe(2)
    })

    it('memoizes getters on reactive objects', () => {
        const spy = vi.fn()
        const source = reactive({
            base: 10,
            get computed() {
                spy()
                return this.base * 2
            }
        })
        // @ts-ignore
        const proxy = memoize(source)
        
        expect(proxy.computed).toBe(20)
        expect(spy).toHaveBeenCalledTimes(1)
        
        // Second access: cached
        expect(proxy.computed).toBe(20)
        expect(spy).toHaveBeenCalledTimes(1) // Should not increase
        
        // Update dependency
        proxy.base = 20
        // Should invalidate
        expect(proxy.computed).toBe(40)
        expect(spy).toHaveBeenCalledTimes(2)
    })

    it('memoizes prototype getters', () => {
        const spy = vi.fn()
        class Base {
            _val = 1
            get val() { return this._val }
            set val(v) { this._val = v }
            
            get computed() {
                spy()
                return this.val + 10
            }
        }
        
        const instance = reactive(new Base())
        // @ts-ignore
        const proxy = memoize(instance)
        
        expect(proxy.computed).toBe(11)
        expect(spy).toHaveBeenCalledTimes(1)
        
        expect(proxy.computed).toBe(11)
        expect(spy).toHaveBeenCalledTimes(1)
        
        proxy.val = 5
        expect(proxy.computed).toBe(15)
        expect(spy).toHaveBeenCalledTimes(2)
    })

    it('handles recursive memoization correctly (this binding)', () => {
        const spyB = vi.fn()
        const spyC = vi.fn()
        
        const source = reactive({
            a: 1,
            get b() {
                spyB()
                return this.a * 2
            },
            get c() {
                spyC()
                return this.b + 5 // Calls this.b!
            }
        })
        
        // @ts-ignore
        const proxy = memoize(source) // proxy
        
        // Accessing c should call b
        // If 'this' in c is the proxy, then this.b hits the proxy, and b is memoized.
        expect(proxy.c).toBe(7) // 1*2 + 5
        expect(spyC).toHaveBeenCalledTimes(1)
        expect(spyB).toHaveBeenCalledTimes(1)
        
        // Accessing c again -> cached
        expect(proxy.c).toBe(7)
        expect(spyC).toHaveBeenCalledTimes(1) // c cached
        // b shouldn't be called because c didn't run
        
        // Invalidate a
        source.a = 2 // Update source directly or proxy? Proxy forwards set.
        // Let's use proxy to be consistent with previous tests, though source.a = 2 works on reactive()
        proxy.a = 2
        
        // Access c
        expect(proxy.c).toBe(9) // 2*2 + 5
        expect(spyC).toHaveBeenCalledTimes(2)
        expect(spyB).toHaveBeenCalledTimes(2)
        
        // Access b directly (should be cached from c's run? No, c calling b might populate b's cache)
        // Accessing b from c: `proxy.b`.
        // Calculates b => 4. Stores in b's cache (key=proxy).
        // So checking proxy.b now should be cached.
        expect(proxy.b).toBe(4)
        expect(spyB).toHaveBeenCalledTimes(2) // Shouldn't increase
    })

    it('maintains identity', () => {
        const obj = reactive({})
        // @ts-ignore
        const m1 = memoize(obj)
        // @ts-ignore
        const m2 = memoize(obj)
        expect(m1).toBe(m2)
    })
    
    it('supports array index access and length', () => {
        // Technically an object, but good to check
        const arr = reactive([1, 2])
        // @ts-ignore
        const proxy = memoize(arr)
        expect(proxy[0]).toBe(1)
        expect(proxy.length).toBe(2)
        
        proxy.push(3)
        expect(proxy[2]).toBe(3)
        expect(proxy.length).toBe(3)
    })
})
