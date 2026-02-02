import { cleanup, effect, project, reactive } from 'mutts'

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

	it('keeps nested projection item effects alive across inner structural updates', () => {
		const source = reactive([
			{
				children: reactive([{ value: 'a' }]),
			},
		])
		const calls: Record<string, number> = {}
		const cleanupCalls: string[] = []

		const target = project.array(source, ({ get, key: outerKey }) => {
			const outer = get()
			if (!outer) return []
			const inner = project.array(outer.children, ({ get: getChild, key: innerKey }) => {
				const child = getChild()
				const k = `${outerKey}:${innerKey}`
				calls[k] = (calls[k] ?? 0) + 1
				effect(() => {
					void child?.value
					return () => cleanupCalls.push(`cleanup ${k}`)
				})
				return child?.value.toUpperCase() ?? 'NONE'
			})
			return inner
		})

		expect(target[0][0]).toBe('A')
		expect(calls['0:0']).toBe(1)
		expect(cleanupCalls).toEqual([])

		source[0].children.push({ value: 'b' })
		expect(target[0][0]).toBe('A')
		expect(target[0][1]).toBe('B')
		expect(calls['0:0']).toBe(1)
		expect(calls['0:1']).toBe(1)
		expect(cleanupCalls).toEqual([])

		target[cleanup]()
		expect(cleanupCalls).toHaveLength(2)
		expect(cleanupCalls).toContain('cleanup 0:0')
		expect(cleanupCalls).toContain('cleanup 0:1')
	})

	it('cleans nested projection effects when an outer item is disposed', () => {
		const source = reactive([
			{ children: reactive([{ value: 'a' }]) },
			{ children: reactive([{ value: 'b' }]) },
		])
		const cleanupCalls: string[] = []

		const target = project.array(source, ({ get, key: outerKey }) => {
			const outer = get()
			if (!outer) return []
			const inner = project.array(outer.children, ({ get: getChild, key: innerKey }) => {
				const child = getChild()
				const k = `${outerKey}:${innerKey}`
				effect(() => {
					void child?.value
					return () => cleanupCalls.push(`cleanup ${k}`)
				})
				return child?.value.toUpperCase() ?? 'NONE'
			})
			return inner
		})

		expect(target[0][0]).toBe('A')
		expect(target[1][0]).toBe('B')
		expect(cleanupCalls).toEqual([])

		source.pop()
		expect(cleanupCalls).toHaveLength(1)
		expect(cleanupCalls).toContain('cleanup 1:0')
		expect(cleanupCalls).not.toContain('cleanup 0:0')

		target[cleanup]()
		expect(cleanupCalls).toHaveLength(2)
		expect(cleanupCalls).toContain('cleanup 0:0')
	})

	describe('garbage collection cleanup', () => {
		const itGarbageCollection = typeof globalThis.gc === 'function' ? it : it.skip

		function tick(ms: number = 100) {
			return new Promise((resolve) => setTimeout(resolve, ms))
		}

		async function collectGarbages() {
			await tick()
			globalThis.gc?.()
			await tick()
		}

		itGarbageCollection(
			'cleans projection effects when the owning effect is collected',
			async () => {
				const source = reactive([{ children: reactive([{ value: 'a' }]) }])
				const cleanupCalls: string[] = []

				;(() => {
					effect(() => {
						const target = project.array(source, ({ get }) => {
							const outer = get()
							if (!outer) return []
							return project.array(outer.children, ({ get: getChild, key }) => {
								const child = getChild()
								effect(() => {
									void child?.value
									return () => cleanupCalls.push(`cleanup ${key}`)
								})
								return child?.value.toUpperCase() ?? 'NONE'
							})
						})
						void target
					})
				})()

				expect(cleanupCalls).toEqual([])
				await collectGarbages()
				expect(cleanupCalls).toContain('cleanup 0')
			}
		)
	})
})

