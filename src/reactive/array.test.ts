import { effect, keyedArray, reactive } from './index'

describe('KeyedArray', () => {
	it('behaves like an array with indexable access and core mutations', () => {
		const list = keyedArray<{ id: number; value: string }, number>(
			(item) => item.id,
			[
				{ id: 1, value: 'a' },
				{ id: 2, value: 'b' },
			]
		)

		expect(list.length).toBe(2)
		expect(list[0]?.value).toBe('a')
		expect(list[1]?.value).toBe('b')
		expect(list.at(-1)?.value).toBe('b')

		list.push({ id: 3, value: 'c' })
		expect(list.length).toBe(3)
		expect(list[2]?.value).toBe('c')
		expect([...list].map((item) => item.id)).toEqual([1, 2, 3])

		const removed = list.splice(1, 1, { id: 4, value: 'd' })
		expect(removed).toHaveLength(1)
		expect(removed[0]?.id).toBe(2)
		expect(list.length).toBe(3)
		expect(list[1]?.id).toBe(4)

		const shifted = list.shift()
		expect(shifted?.id).toBe(1)
		expect(list.length).toBe(2)
		expect(list[0]?.id).toBe(4)

		expect(list.map((item) => item.value)).toEqual(['d', 'c'])
		expect(list.slice(0, 1).map((item) => item.id)).toEqual([4])
		expect(list.concat([{ id: 5, value: 'e' }]).map((item) => item.id)).toEqual([4, 3, 5])
		expect(list.map((item) => item.value).join(',')).toBe('d,c')
		expect(list.includes(list[0]!)).toBe(true)
		expect(list.indexOf(list[1]!)).toBe(1)

		list.reverse()
		expect(list.map((item) => item.id)).toEqual([3, 4])

		list.sort((a, b) => b.value.localeCompare(a.value))
		expect(list.map((item) => item.id)).toEqual([4, 3])

		list.fill({ id: 6, value: 'x' }, 0, 1)
		expect(list[0]?.id).toBe(6)

		list.copyWithin(1, 0)
		expect(list.map((item) => item.id)).toEqual([6, 6])
	})

	it('shares values across identical keys', () => {
		const list = keyedArray<{ id: number; label: string }, number>((item) => item.id)
		list.push({ id: 1, label: 'first' })
		let effectCount = 0
		effect(() => {
			effectCount++
			list[0]?.label
		})
		expect(effectCount).toBe(1)
		list.push({ id: 1, label: 'second' })
		expect(effectCount).toBe(2)

		expect(list.length).toBe(2)
		expect(list[0]).toBe(list[1])
		expect(list[0]?.label).toBe('second')
	})

	it('notifies reactive consumers on length and value changes', () => {
		const list = keyedArray<{ id: number; value: string }, number>((item) => item.id)
		const observedLengths: number[] = []
		const observedValues: string[] = []

		const stopLength = effect(() => {
			observedLengths.push(list.length)
		})
		const stopValue = effect(() => {
			observedValues.push(list[0]?.value ?? 'none')
		})

		expect(observedLengths).toEqual([0])
		expect(observedValues).toEqual(['none'])

		list.push({ id: 1, value: 'hello' })
		expect(observedLengths).toEqual([0, 1])
		expect(observedValues).toContain('hello')
		expect(observedValues[observedValues.length - 1]).toBe('hello')

		list[0] = { id: 1, value: 'world' }
		expect(observedValues[observedValues.length - 1]).toBe('world')
		expect(observedValues).toContain('world')

		list.pop()
		expect(observedLengths).toEqual([0, 1, 0])
		expect(observedValues[observedValues.length - 1]).toBe('none')

		list.push({ id: 2, value: 'reactive' })
		list.reverse()
		expect(observedValues[observedValues.length - 1]).toBe('reactive')

		stopLength()
		stopValue()
	})

	it('rekeys items when key function output changes', () => {
		type Item = { id: number; value: string }
		const item = reactive<Item>({ id: 1, value: 'tracked' })
		const list = keyedArray<Item, number>((entry) => entry.id, [item])

		expect(list.hasKey(1)).toBe(true)
		expect(list.get(1)).toBe(item)
		expect(list[0]).toBe(item)

		item.id = 2

		expect(list.hasKey(1)).toBe(false)
		expect(list.get(1)).toBeUndefined()
		expect(list.hasKey(2)).toBe(true)
		expect(list.get(2)).toBe(item)
		expect(list.indexOfKey(2)).toBe(0)
		expect(list[0]).toBe(item)
	})
})
