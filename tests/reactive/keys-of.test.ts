import { describe, it, expect, vi } from 'vitest'
import { reactive, effect } from 'mutts'

describe('keysOf tracking', () => {
	it('Object.keys() does NOT re-run when a value changes', () => {
		const obj = reactive({ a: 1, b: 2 })
		let runs = 0
		let result: string[] = []
		effect(() => { runs++; result = Object.keys(obj) })
		expect(runs).toBe(1)
		expect(result).toEqual(['a', 'b'])

		obj.a = 10
		expect(runs).toBe(1)

		obj.b = 20
		expect(runs).toBe(1)
	})

	it('Object.keys() re-runs when a key is added', () => {
		const obj = reactive<Record<string, number>>({ a: 1 })
		let runs = 0
		let result: string[] = []
		effect(() => { runs++; result = Object.keys(obj) })
		expect(runs).toBe(1)

		obj.b = 2
		expect(runs).toBe(2)
		expect(result).toEqual(['a', 'b'])
	})

	it('Object.keys() re-runs when a key is deleted', () => {
		const obj = reactive<Record<string, number>>({ a: 1, b: 2 })
		let runs = 0
		let result: string[] = []
		effect(() => { runs++; result = Object.keys(obj) })
		expect(runs).toBe(1)

		delete (obj as any).b
		expect(runs).toBe(2)
		expect(result).toEqual(['a'])
	})

	it('for..in does NOT re-run when a value changes', () => {
		const obj = reactive({ x: 1, y: 2 })
		let runs = 0
		effect(() => {
			runs++
			for (const _k in obj) { /* iterate keys only */ }
		})
		expect(runs).toBe(1)

		obj.x = 99
		expect(runs).toBe(1)
	})

	it('Object.entries() re-runs when a value changes (reads values via get)', () => {
		const obj = reactive({ a: 1, b: 2 })
		let runs = 0
		effect(() => { runs++; Object.entries(obj) })
		expect(runs).toBe(1)

		obj.a = 10
		expect(runs).toBe(2)
	})

	it('Object.values() re-runs when a value changes', () => {
		const obj = reactive({ a: 1, b: 2 })
		let runs = 0
		effect(() => { runs++; Object.values(obj) })
		expect(runs).toBe(1)

		obj.a = 10
		expect(runs).toBe(2)
	})

	describe('Map', () => {
		it('map.keys() does NOT re-run when a value changes', () => {
			const map = reactive(new Map([['a', 1], ['b', 2]]))
			let runs = 0
			effect(() => { runs++; ;[...map.keys()] })
			expect(runs).toBe(1)

			map.set('a', 10)
			expect(runs).toBe(1)
		})

		it('map.keys() re-runs when a key is added', () => {
			const map = reactive(new Map([['a', 1]]))
			let runs = 0
			let result: string[] = []
			effect(() => { runs++; result = [...map.keys()] })
			expect(runs).toBe(1)

			map.set('b', 2)
			expect(runs).toBe(2)
			expect(result).toEqual(['a', 'b'])
		})

		it('map.keys() re-runs when a key is deleted', () => {
			const map = reactive(new Map([['a', 1], ['b', 2]]))
			let runs = 0
			let result: string[] = []
			effect(() => { runs++; result = [...map.keys()] })
			expect(runs).toBe(1)

			map.delete('b')
			expect(runs).toBe(2)
			expect(result).toEqual(['a'])
		})

		it('map.entries() re-runs when a value changes', () => {
			const map = reactive(new Map([['a', 1], ['b', 2]]))
			let runs = 0
			effect(() => { runs++; ;[...map.entries()] })
			expect(runs).toBe(1)

			map.set('a', 10)
			expect(runs).toBe(2)
		})
	})
})
