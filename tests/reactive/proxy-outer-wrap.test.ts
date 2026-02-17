import { reactive } from 'mutts'

describe('Reactive array wrapped in an outer Proxy', () => {
	it('.flat() on outer Proxy should go through the outer get trap for each index', () => {
		const cache = reactive([undefined, undefined] as (string | undefined)[])
		const source = ['hello', 'world']

		const outer = new Proxy(cache, {
			get(target, prop, receiver) {
				const n = typeof prop === 'string' ? Number(prop) : NaN
				if (!isNaN(n)) {
					// Lazy population: fill cache on first access
					if (cache[n] === undefined && source[n] !== undefined) {
						cache[n] = source[n].toUpperCase()
					}
					return cache[n]
				}
				return Reflect.get(target, prop, receiver)
			},
		})

		// Direct index access should work (sanity check)
		expect(outer[0]).toBe('HELLO')

		// Reset cache to test .flat()
		cache[0] = undefined
		cache[1] = undefined

		// .flat() should trigger the outer Proxy's get trap for each index,
		// which lazily populates the cache. If the reactive array's .flat()
		// bypasses the outer Proxy, we get [undefined, undefined] instead.
		const result = outer.flat()
		expect(result).toEqual(['HELLO', 'WORLD'])
	})
})
