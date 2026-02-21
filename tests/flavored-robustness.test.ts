import { describe, expect, it, vi } from 'vitest'
import { flavored, flavorOptions } from '../src/flavored'

describe('flavored options robustness', () => {
    it('should use arity to find options index', () => {
        const fn = vi.fn((a: number, b: string, options: any = {}) => ({ a, b, options }))
        const f = flavored(fn, {
            get foo() { return flavorOptions(this, { foo: true }, {}) }
        })

        // fn.length is 2
        const result = f.foo(1, 'bar')
        expect(result.options).toEqual({ foo: true })
        expect(fn).toHaveBeenCalledWith(1, 'bar', { foo: true })
    })

    it('should pad arguments if they are missing', () => {
        const fn = vi.fn((a: any, b: any, options: any = {}) => ({ a, b, options }))
        const f = flavored(fn, {
            get foo() { return flavorOptions(this, { foo: true }, {}) }
        })

        // fn.length is 2
        // Call with only 1 argument
        const result = f.foo(1)
        expect(result.a).toBe(1)
        expect(result.b).toBeUndefined()
        expect(result.options).toEqual({ foo: true })
        expect(fn).toHaveBeenCalledWith(1, undefined, { foo: true })
    })

    it('should merge into existing options at the correct index', () => {
        const fn = vi.fn((a: any, b: any, options: any = {}) => ({ a, b, options }))
        const f = flavored(fn, {
            get foo() { return flavorOptions(this, { foo: true }, {}) }
        })

        const result = f.foo(1, 2, { existing: true })
        expect(result.options).toEqual({ foo: true, existing: true })
        expect(fn).toHaveBeenCalledWith(1, 2, { foo: true, existing: true })
    })

    it('should NOT pollute data objects that are not at the options index', () => {
        const fn = vi.fn((data: object, options: any = {}) => ({ data, options }))
        const f = flavored(fn, {
            get foo() { return flavorOptions(this, { foo: true }, {}) }
        })

        // fn.length is 1. Options should be at index 1.
        const myData = { id: 123 }
        const result = f.foo(myData)
        
        expect(result.data).toBe(myData)
        expect(result.data).not.toHaveProperty('foo')
        expect(result.options).toEqual({ foo: true })
    })

    it('should support nested flavors and preserve options index', () => {
        const fn = vi.fn((options: any = {}) => options)
        const f = flavored(fn, {
            get a() { return flavorOptions(this, { a: true }, {}) },
            get b() { return flavorOptions(this, { b: true }, {}) }
        })

        const result = f.a.b()
        expect(result).toEqual({ a: true, b: true })
    })

    it('should handle primitives at options index gracefully', () => {
        const fn = vi.fn((a: any, options: any = {}) => ({ a, options }))
        const f = flavored(fn, {
            get foo() { return flavorOptions(this, { foo: true }, {}) }
        })

        // If user passes a string where options should be, we overwrite it with options object
        // because we "know" index 1 is for options.
        const result = f.foo(1, "this-is-not-an-object")
        expect(result.options).toEqual({ foo: true })
    })

    it('should handle null at options index gracefully', () => {
        const fn = vi.fn((a: any, options: any = {}) => ({ a, options }))
        const f = flavored(fn, {
            get foo() { return flavorOptions(this, { foo: true }, {}) }
        })

        const result = f.foo(1, null)
        expect(result.options).toEqual({ foo: true })
    })

    it('should support explicit optionsIndex', () => {
        // Function with variability
        const fn = vi.fn((...args: any[]) => args)
        const f = flavored(fn, {
            get foo() { return flavorOptions(this, { foo: true }, { optionsIndex: 5 }) }
        })

        const result = f.foo(1, 2)
        expect(result.length).toBe(6)
        expect(result[5]).toEqual({ foo: true })
        expect(result[2]).toBeUndefined()
    })
})
