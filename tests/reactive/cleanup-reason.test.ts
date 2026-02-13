import { effect, formatCleanupReason, reactive, type CleanupReason } from 'mutts'

describe('CleanupReason', () => {
	describe('formatCleanupReason', () => {
		it('formats propChange with single trigger', () => {
			const reason: CleanupReason = {
				type: 'propChange',
				triggers: [{ obj: { x: 1 }, prop: 'x', evolution: { type: 'set', prop: 'x' } }],
			}
			expect(formatCleanupReason(reason)).toBe('propChange: set x on Object')
		})

		it('formats propChange with multiple triggers', () => {
			const reason: CleanupReason = {
				type: 'propChange',
				triggers: [
					{ obj: { a: 1 }, prop: 'a', evolution: { type: 'set', prop: 'a' } },
					{ obj: { b: 2 }, prop: 'b', evolution: { type: 'del', prop: 'b' } },
				],
			}
			expect(formatCleanupReason(reason)).toBe('propChange: set a on Object, del b on Object')
		})

		it('formats stopped', () => {
			expect(formatCleanupReason({ type: 'stopped' })).toBe('stopped')
		})

		it('formats gc', () => {
			expect(formatCleanupReason({ type: 'gc' })).toBe('gc')
		})

		it('formats error with Error instance', () => {
			expect(formatCleanupReason({ type: 'error', error: new Error('boom') })).toBe(
				'error: boom'
			)
		})

		it('formats error with string', () => {
			expect(formatCleanupReason({ type: 'error', error: 'oops' })).toBe('error: oops')
		})

		it('formats lineage with indentation', () => {
			const reason: CleanupReason = {
				type: 'lineage',
				parent: { type: 'stopped' },
			}
			expect(formatCleanupReason(reason)).toBe('lineage ←\n  stopped')
		})

		it('formats nested lineage', () => {
			const reason: CleanupReason = {
				type: 'lineage',
				parent: {
					type: 'lineage',
					parent: {
						type: 'propChange',
						triggers: [
							{ obj: { n: 1 }, prop: 'n', evolution: { type: 'set', prop: 'n' } },
						],
					},
				},
			}
			expect(formatCleanupReason(reason)).toBe(
				'lineage ←\n  lineage ←\n    propChange: set n on Object'
			)
		})

		it('uses constructor name for typed objects', () => {
			class Foo {
				value = 42
			}
			const reason: CleanupReason = {
				type: 'propChange',
				triggers: [
					{ obj: new Foo(), prop: 'value', evolution: { type: 'set', prop: 'value' } },
				],
			}
			expect(formatCleanupReason(reason)).toBe('propChange: set value on Foo')
		})
	})

	describe('reaction carries CleanupReason', () => {
		it('reaction is false on first run, CleanupReason on re-run', () => {
			const state = reactive({ count: 0 })
			const reactions: (CleanupReason | false)[] = []

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
				expect(reason.triggers.some((t) => t.prop === 'count')).toBe(true)
			}

			stop()
		})

		it('reaction preserves reason across multiple re-runs', () => {
			const state = reactive({ a: 0, b: 0 })
			const reasons: (CleanupReason | false)[] = []

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
