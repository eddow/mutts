import { describe, expect, it, vi } from 'vitest'
import { reactive } from '../../src/reactive/proxy'
import { watch } from '../../src/reactive/watch'

describe('watch flavor', () => {
	it('should support watch.immediate', () => {
		const state = reactive({ count: 0 })
		const cb = vi.fn()
		
		watch.immediate(() => state.count, cb)
		expect(cb).toHaveBeenCalledWith(0)
		
		state.count = 1
		expect(cb).toHaveBeenCalledWith(1, 0)
	})

	it('should support watch.deep', () => {
		const state = reactive({ nested: { a: 1 } })
		const cb = vi.fn()
		
		watch.deep(() => state.nested, cb)
		
		state.nested.a = 2
		expect(cb).toHaveBeenCalled()
	})

	it('should support watch.immediate.deep', () => {
		const state = reactive({ nested: { a: 1 } })
		const cb = vi.fn()
		
		watch.immediate.deep(() => state.nested, (val) => cb(JSON.parse(JSON.stringify(val))))
		expect(cb).toHaveBeenCalledWith({ a: 1 })
		
		state.nested.a = 2
		expect(cb).toHaveBeenCalledWith({ a: 2 })
	})

	it('should support watch.deep.immediate', () => {
		const state = reactive({ nested: { a: 1 } })
		const cb = vi.fn()
		
		watch.deep.immediate(() => state.nested, (val) => cb(JSON.parse(JSON.stringify(val))))
		expect(cb).toHaveBeenCalledWith({ a: 1 })
		
		state.nested.a = 2
		expect(cb).toHaveBeenCalledWith({ a: 2 })
	})

	it('should still support passing options manually to flavored watch', () => {
		const state = reactive({ nested: { count: 0 } })
		const cb = vi.fn()
		
		// watch.immediate with deep: true passed manually
		watch.immediate(() => state.nested, cb, { deep: true })
		expect(cb).toHaveBeenCalled()
		
		state.nested.count = 1
		expect(cb).toHaveBeenCalledTimes(2)
	})
})
