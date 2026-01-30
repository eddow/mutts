import { memoize, reactiveOptions } from 'mutts'

describe('memoize discrepancy detector', () => {
    let originalCallback: typeof reactiveOptions.onMemoizationDiscrepancy

    beforeEach(() => {
        originalCallback = reactiveOptions.onMemoizationDiscrepancy
    })

    afterEach(() => {
        reactiveOptions.onMemoizationDiscrepancy = originalCallback
    })

    it('detects discrepancy when function depends on non-reactive value', () => {
        let external = 1
        const compute = jest.fn(() => external)
        const memo = memoize(compute)

        const detected: any[] = []
        reactiveOptions.onMemoizationDiscrepancy = jest.fn((cached, fresh, fn, args) => {
            detected.push({ cached, fresh, fn, args })
        })

        // First call caches the value (1)
        expect(memo()).toBe(1)
        expect(reactiveOptions.onMemoizationDiscrepancy).not.toHaveBeenCalled()

        // Change external value - memo won't know because it's not reactive
        external = 2

        // Second call returns cached value (1) but check should see fresh is (2)
        expect(memo()).toBe(1)
        
        expect(reactiveOptions.onMemoizationDiscrepancy).toHaveBeenCalledTimes(1)
        expect(detected[0]).toMatchObject({
            cached: 1,
            fresh: 2,
            fn: expect.any(Function),
            args: []
        })
    })

    it('does not trigger when values match', () => {
         const compute = jest.fn(() => 42)
         const memo = memoize(compute)

         reactiveOptions.onMemoizationDiscrepancy = jest.fn()

         memo()
         memo()

         expect(reactiveOptions.onMemoizationDiscrepancy).not.toHaveBeenCalled()
    })
})
