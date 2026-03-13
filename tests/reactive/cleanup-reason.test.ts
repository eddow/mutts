import { effect, formatCleanupReason, morph, reactive, root, type CleanupReason } from 'mutts'
import { getCleanupReasonChain, isCleanupReason, logReason, reasonFormatter } from '../../debug'

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

		it('formats external', () => {
			expect(formatCleanupReason({ type: 'external', detail: 'event:click' })).toEqual([
				'external:',
				'event:click',
			])
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

		it('flattens chained reasons in stack order for debug formatting', () => {
			const root = { type: 'stopped' } satisfies CleanupReason
			const middle = { type: 'gc', chain: root } satisfies CleanupReason
			const top = { type: 'error', error: 'boom', chain: middle } satisfies CleanupReason

			expect(isCleanupReason(top)).toBe(true)
			expect(getCleanupReasonChain(top)).toEqual([top, middle, root])
			expect(reasonFormatter.header(top)).toEqual([
				'span',
				expect.objectContaining({ style: expect.stringContaining('font-weight: bold;') }),
				'🧹 error: boom ×3',
			])
		})

		it('renders lineage entries in collapsed touch/dependency groups in formatter body', () => {
			const reason: CleanupReason = {
				type: 'propChange',
				triggers: [
					{
						obj: { value: 1 },
						evolution: { type: 'set', prop: 'value' },
						touch: { stack: 'touch' },
						dependency: { stack: 'dependency' },
					},
				],
			}
			const body = reasonFormatter.body(reason) as unknown[]
			const serialized = JSON.stringify(body)
			expect(serialized).toContain('"count":1')
			expect(serialized).toContain('"entries"')
			expect(serialized).toContain('set value')
			expect(serialized).toContain('touch')
			expect(serialized).toContain('dependency')
			expect(serialized).toContain('"object"')
			expect(serialized).not.toContain('[lineage]')
		})

		it('includes tagged target descriptions in propChange summaries', () => {
			const source = reactive([1, 2, 3])
			const derived = morph(source, function doubled(v) {
				return v * 2
			})
			const reason: CleanupReason = {
				type: 'propChange',
				triggers: [
					{ obj: derived as object, evolution: { type: 'set', prop: '0' } },
					{ obj: derived as object, evolution: { type: 'set', prop: '1' } },
				],
			}

			expect(reasonFormatter.header(reason)).toEqual([
				'span',
				expect.objectContaining({ style: expect.stringContaining('font-weight: bold;') }),
				'🧹 propChange: morph:doubled: set 0, set 1',
			])
		})

		it('logs each chained reason as a stack entry', () => {
			const root = { type: 'stopped' } satisfies CleanupReason
			const middle = { type: 'gc', chain: root } satisfies CleanupReason
			const top = { type: 'error', error: 'boom', chain: middle } satisfies CleanupReason
			expect(logReason(top, 'reaction')).toBe('🧹 Cleanup Reason (reaction)')
		})

		it('logs external reasons as a final stack entry', () => {
			const reason: CleanupReason = {
				type: 'propChange',
				triggers: [{ obj: { value: 1 }, evolution: { type: 'set', prop: 'value' } }],
				chain: { type: 'external', detail: 'event:click' },
			}
			expect(logReason(reason)).toBe('🧹 Cleanup Reason')
		})

		it('logs trigger lineage objects inside the matching chain link group', () => {
			const touch = { stack: 'touch' }
			const dependency = { stack: 'dependency' }
			const obj = { value: 1 }
			const reason: CleanupReason = {
				type: 'propChange',
				triggers: [
					{
						obj,
						evolution: { type: 'set', prop: 'value' },
						touch,
						dependency,
					},
				],
			}
			expect(logReason(reason)).toBe('🧹 Cleanup Reason')
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

		it('chains the originating reason through effect-triggered updates', () => {
			const state = reactive({ source: 0, derived: 0 })
			const reasons: CleanupReason[] = []

			const stopBridge = effect(({ reaction }) => {
				void state.source
				if (reaction && reaction !== true && state.source > 0) {
					state.derived = state.source * 10
				}
			})

			const stopConsumer = effect(({ reaction }) => {
				void state.derived
				if (reaction && reaction !== true) reasons.push(reaction)
			})

			state.source = 1

			expect(reasons).toHaveLength(1)
			expect(reasons[0].type).toBe('propChange')
			expect(reasons[0].chain?.type).toBe('propChange')
			if (reasons[0].type === 'propChange') {
				expect(
					reasons[0].triggers.some(
						(t) => 'prop' in t.evolution && t.evolution.prop === 'derived'
					)
				).toBe(true)
			}
			if (reasons[0].chain?.type === 'propChange') {
				expect(
					reasons[0].chain.triggers.some(
						(t) => 'prop' in t.evolution && t.evolution.prop === 'source'
					)
				).toBe(true)
			}

			stopConsumer()
			stopBridge()
		})

		it('chains external root captions into downstream reaction reasons', () => {
			const state = reactive({ source: 0, derived: 0 })
			const reasons: CleanupReason[] = []

			root`event:click`(() => {
				effect(({ reaction }) => {
					void state.source
					if (reaction && reaction !== true && state.source > 0) {
						state.derived = state.source * 10
					}
				})

				effect(({ reaction }) => {
					void state.derived
					if (reaction && reaction !== true) reasons.push(reaction)
				})
			})

			state.source = 1

			expect(reasons).toHaveLength(1)
			expect(getCleanupReasonChain(reasons[0]).at(-1)).toEqual({
				type: 'external',
				detail: 'event:click',
			})
			expect(reasonFormatter.body(reasons[0])).toBeTruthy()
		})
	})
})
