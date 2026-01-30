import { cleanup, effect, isReactive, organized, reactive } from 'mutts'

describe('organized', () => {
	it('should mirror entries with per-key cleanups', () => {
		const source = reactive<{ a?: number; b?: number }>({ a: 1 })
		const iterations: Record<string, number> = {}
		const cleanupCalls: Record<string, number> = {}
		const target = organized(source, (access, target) => {
			const key = access.key
			const name = String(key)
			iterations[name] = (iterations[name] ?? 0) + 1
			target[key] = (access.get() as number) * 2
			return () => {
				delete target[key]
				cleanupCalls[name] = (cleanupCalls[name] ?? 0) + 1
			}
		})

		expect(target.a).toBe(2)
		expect(isReactive(target)).toBe(true)
		expect(iterations).toEqual({ a: 1 })

		let sourceRuns = 0
		const stop = effect(() => {
			sourceRuns++
			source.a
		})
		expect(sourceRuns).toBe(1)

		source.a = 2
		expect(sourceRuns).toBe(2)
		stop()
		expect(iterations.a).toBe(2)
		expect(target.a).toBe(4)
		expect(cleanupCalls.a).toBe(1)

		source.b = 3
		expect(target.b).toBe(6)
		expect(iterations.b).toBe(1)
		expect(cleanupCalls.b ?? 0).toBe(0)

		delete source.a
		expect(target.a).toBeUndefined()
		expect(cleanupCalls.a).toBe(2)

		target[cleanup]()
		expect(cleanupCalls.b).toBe(1)
		expect(target.b).toBeUndefined()
	})

	it('should support custom target structures', () => {
		const source = reactive<{ a?: number; b?: number }>({ a: 1 })
		const baseTarget = { entries: new Map<string, number>() }
		const target = organized(
			source,
			(access, target) => {
				const prop = String(access.key)
				target.entries.set(prop, access.value as number)
				return () => {
					target.entries.delete(prop)
				}
			},
			baseTarget
		)

		expect(target.entries.get('a')).toBe(1)

		source.a = 3
		expect(target.entries.get('a')).toBe(3)

		source.b = 2
		expect(target.entries.get('b')).toBe(2)

		delete source.b
		expect(target.entries.has('b')).toBe(false)

		target[cleanup]()
		expect(target.entries.size).toBe(0)
	})
})

