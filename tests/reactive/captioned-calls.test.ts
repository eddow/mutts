import { describe, expect, it, vi } from 'vitest'
import { effect, lift, reactive, reactiveOptions } from '../../src/reactive'
import { getLineage } from '../../debug'
import { watch } from '../../src/reactive/satellite'

describe('captioned callback calls', () => {
	it('warns for anonymous effect callbacks without a template caption', () => {
		const warn = vi.fn()
		const previousWarn = reactiveOptions.warn
		reactiveOptions.warn = warn
		try {
			const stop = effect(() => {})
			stop()
		} finally {
			reactiveOptions.warn = previousWarn
		}
		expect(warn).toHaveBeenCalledWith(
			'[reactive] effect: anonymous callback; prefer a named function or template call syntax'
		)
	})

	it('accepts template-captioned effect callbacks', () => {
		const state = reactive({ count: 0 })
		const seen: number[] = []
		let effectName = ''
		const stop = effect`counter:${'main'}`(() => {
			effectName = getLineage()[0]?.effectName ?? ''
			seen.push(state.count)
		})
		expect(seen).toEqual([0])
		expect(effectName).toBe('counter:main')
		state.count = 1
		expect(seen).toEqual([0, 1])
		expect(effectName).toBe('counter:main')
		stop()
	})

	it('accepts template-captioned lift callbacks', () => {
		const state = reactive({ count: 2 })
		const doubled = lift`double:${state.count}`(() => [state.count * 2])
		expect([...doubled]).toEqual([4])
		state.count = 3
		expect([...doubled]).toEqual([6])
	})

	it('preserves captioned calls through watch flavors', () => {
		const state = reactive({ nested: { value: 1 } })
		const changed = vi.fn()
		const stop = watch.immediate.deep`nested:${'watch'}`(
			() => state.nested,
			(value) => changed(JSON.parse(JSON.stringify(value)))
		)
		expect(changed).toHaveBeenCalledWith({ value: 1 })
		state.nested.value = 2
		expect(changed).toHaveBeenCalledWith({ value: 2 })
		stop()
	})
})
