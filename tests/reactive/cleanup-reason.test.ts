import { effect, formatCleanupReason, reactive, type CleanupReason } from 'mutts'

describe('CleanupReason', () => {
	describe('formatCleanupReason', () => {
		it('formats propChange with single trigger', () => {
			const obj = { x: 1 }
			const reason: CleanupReason = {
				type: 'propChange',
				triggers: [{ obj, evolution: { type: 'set', prop: 'x' } }],
			}
			expect(formatCleanupReason(reason)).toEqual(['propChange:', 'set x on', obj])
		})

		it('formats propChange with multiple triggers', () => {
			const objA = { a: 1 }
			const objB = { b: 2 }
			const reason: CleanupReason = {
				type: 'propChange',
				triggers: [
					{ obj: objA, evolution: { type: 'set', prop: 'a' } },
					{ obj: objB, evolution: { type: 'del', prop: 'b' } },
				],
			}
			expect(formatCleanupReason(reason)).toEqual(['propChange:', 'set a on', objA, ',', 'del b on', objB])
		})

		it('formats stopped', () => {
			expect(formatCleanupReason({ type: 'stopped' })).toEqual(['stopped'])
		})

		it('formats gc', () => {
			expect(formatCleanupReason({ type: 'gc' })).toEqual(['gc'])
		})

		it('formats error with Error instance', () => {
			const err = new Error('boom')
			expect(formatCleanupReason({ type: 'error', error: err })).toEqual(['error:', err])
		})

		it('formats error with string', () => {
			expect(formatCleanupReason({ type: 'error', error: 'oops' })).toEqual(['error:', 'oops'])
		})

		it('formats lineage with indentation', () => {
			const reason: CleanupReason = {
				type: 'lineage',
				parent: { type: 'stopped' },
			}
			expect(formatCleanupReason(reason)).toEqual(['lineage ←\n', '  stopped'])
		})

		it('formats nested lineage', () => {
			const obj = { n: 1 }
			const reason: CleanupReason = {
				type: 'lineage',
				parent: {
					type: 'lineage',
					parent: {
						type: 'propChange',
						triggers: [
							{ obj, evolution: { type: 'set', prop: 'n' } },
						],
					},
				},
			}
			expect(formatCleanupReason(reason)).toEqual(
				['lineage ←\n', '  lineage ←\n', '    propChange:', 'set n on', obj]
			)
		})

		it('passes raw object references for console inspection', () => {
			class Foo {
				value = 42
			}
			const foo = new Foo()
			const reason: CleanupReason = {
				type: 'propChange',
				triggers: [
					{ obj: foo, evolution: { type: 'set', prop: 'value' } },
				],
			}
			const result = formatCleanupReason(reason)
			expect(result).toEqual(['propChange:', 'set value on', foo])
			expect(result[2]).toBe(foo)
		})
	})

	describe('reaction carries CleanupReason', () => {
		it('reaction is false on first run, CleanupReason on re-run', () => {
			const state = reactive({ count: 0 })
			const reactions: (boolean | CleanupReason)[] = []

			const stop = effect(({ reaction }) => {
				reactions.push(reaction)
				void state.count
			})

			expect(reactions).toEqual([false])

			state.count = 1
			expect(reactions.length).toBe(2)
			expect(reactions[1]).not.toBe(false)
			const reason = reactions[1] as CleanupReason
			expect(reason.type).toBe('propChange')
			if (reason.type === 'propChange') {
				expect(reason.triggers.some((t) => 'prop' in t.evolution && t.evolution.prop === 'count')).toBe(true)
			}

			stop()
		})

		it('reaction preserves reason across multiple re-runs', () => {
			const state = reactive({ a: 0, b: 0 })
			const reasons: (boolean | CleanupReason)[] = []

			const stop = effect(({ reaction }) => {
				reasons.push(reaction)
				void state.a
				void state.b
			})

			state.a = 1
			state.b = 1

			expect(reasons.length).toBe(3)
			expect(reasons[0]).toBe(false)
			for (let i = 1; i < reasons.length; i++) {
				expect((reasons[i] as CleanupReason).type).toBe('propChange')
			}

			stop()
		})
	})
})
