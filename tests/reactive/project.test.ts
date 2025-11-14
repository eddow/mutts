import { cleanup, project, reactive } from 'mutts/reactive'

describe('project', () => {
	it('projects arrays with per-index reactivity', () => {
		const source = reactive([
			{ id: 1, value: 'a' },
			{ id: 2, value: 'b' },
		])
		const counts: number[] = []

		const target = project.array(source, ({ get, key }) => {
			counts[key] = (counts[key] ?? 0) + 1
			return get()?.value.toUpperCase() ?? 'NONE'
		})

		expect([...target]).toEqual(['A', 'B'])
		expect(counts).toEqual([1, 1])

		source[0].value = 'alpha'
		expect(target[0]).toBe('ALPHA')
		expect(counts[0]).toBe(2)
		expect(counts[1]).toBe(1)

		source.push({ id: 3, value: 'c' })
		expect(target[2]).toBe('C')
		expect(counts[0]).toBe(2)
		expect(counts[1]).toBe(1)
		expect(counts[2]).toBe(1)

		target[cleanup]()
	})

	it('projects records while preserving keys', () => {
		const source = reactive<{ [key: string]: { label: string } }>({
			first: { label: 'one' },
			second: { label: 'two' },
		})
		const updates: Record<string, number> = {}

		const target = project.record(source, ({ get, key }) => {
			updates[key as string] = (updates[key as string] ?? 0) + 1
			return get()?.label.length ?? 0
		})

		expect(target.first).toBe(3)
		expect(target.second).toBe(3)
		expect(updates).toEqual({ first: 1, second: 1 })

		source.first.label = 'uno'
		expect(target.first).toBe(3)
		expect(updates.first).toBe(2)
		expect(updates.second).toBe(1)

		source.third = { label: 'three' }
		expect(target.third).toBe(5)
		expect(updates.first).toBe(2)
		expect(updates.second).toBe(1)
		expect(updates.third).toBe(1)

		delete source.second
		expect('second' in target).toBe(false)

		target[cleanup]()
	})

	it('projects maps with keyed updates', () => {
		const source = reactive(
			new Map<string, { count: number }>([
				['a', { count: 1 }],
				['b', { count: 2 }],
			])
		)
		const calls: Record<string, number> = {}

		const target = project.map(source, ({ get, key }) => {
			calls[key] = (calls[key] ?? 0) + 1
			return get()?.count ?? 0
		})

		expect(target.get('a')).toBe(1)
		expect(target.get('b')).toBe(2)
		expect(calls).toEqual({ a: 1, b: 1 })

		source.get('a')!.count = 3
		expect(target.get('a')).toBe(3)
		expect(calls.a).toBe(2)
		expect(calls.b).toBe(1)

		source.set('c', { count: 5 })
		expect(target.get('c')).toBe(5)
		expect(calls.a).toBe(2)
		expect(calls.b).toBe(1)
		expect(calls.c).toBe(1)

		source.delete('b')
		expect(target.has('b')).toBe(false)

		target[cleanup]()
	})

	it('provides previous result via access.old', () => {
		const source = reactive([{ value: 1 }])
		const seenOld: Array<string | undefined> = []

		const target = project.array<{ value: number }, string>(source, ({ get, old }) => {
			seenOld.push(old)
			return `${get()?.value}:${old ?? 'none'}`
		})

		expect(target[0]).toBe('1:none')
		expect(seenOld).toEqual([undefined])

		source[0].value = 2
		expect(target[0]).toBe('2:1:none')
		expect(seenOld).toEqual([undefined, '1:none'])

		target[cleanup]()
	})

	it('selects helper based on source type', () => {
		const sourceArray = reactive([{ value: 1 }])
		const projectedArray = project(sourceArray, ({ get }) => get()?.value ?? 0)
		expect(projectedArray[0]).toBe(1)
		projectedArray[cleanup]()

		const sourceRecord = reactive({ a: { value: 2 } })
		const projectedRecord = project(sourceRecord, ({ get }) => get()?.value ?? 0)
		expect(projectedRecord.a).toBe(2)
		projectedRecord[cleanup]()
	})
})

