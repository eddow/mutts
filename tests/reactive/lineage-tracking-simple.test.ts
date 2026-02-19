import { describe, it, expect, beforeEach } from 'vitest'
import { effect, reactive } from '../../src/reactive'
import { options } from '../../src/reactive/types'

describe('lineage tracking simple', () => {
	beforeEach(() => {
		// Reset to defaults
		options.introspection = {
			gatherReasons: { lineages: 'both' },
			logErrors: true,
			enableHistory: true,
			historySize: 50,
		}
	})

	it('should capture both lineages', () => {
		const state = reactive({ count: 0 })
		let capturedReason: any

		effect(({ reaction }) => {
			if (reaction !== true && reaction !== false) capturedReason = reaction
			state.count
		})

		state.count++

		expect(capturedReason.type).toBe('propChange')
		expect(capturedReason.triggers).toHaveLength(1)
		expect(capturedReason.triggers[0].dependency).toBeDefined()
		expect(capturedReason.triggers[0].touch).toBeDefined()
	})

	it('should capture only touch lineage', () => {
		options.introspection = {
			gatherReasons: { lineages: 'touch' },
			logErrors: true,
			enableHistory: true,
			historySize: 50,
		}

		const state = reactive({ count: 0 })
		let capturedReason: any

		effect(({ reaction }) => {
			if (reaction !== true && reaction !== false) capturedReason = reaction
			state.count
		})

		state.count++

		expect(capturedReason.triggers[0].touch).toBeDefined()
		expect(capturedReason.triggers[0].dependency).toBeUndefined()
	})

	it('should capture only dependency lineage', () => {
		options.introspection = {
			gatherReasons: { lineages: 'dependency' },
			logErrors: true,
			enableHistory: true,
			historySize: 50,
		}

		const state = reactive({ count: 0 })
		let capturedReason: any

		effect(({ reaction }) => {
			if (reaction !== true && reaction !== false) capturedReason = reaction
			state.count
		})

		state.count++

		expect(capturedReason.triggers[0].dependency).toBeDefined()
		expect(capturedReason.triggers[0].touch).toBeUndefined()
	})

	it('should capture no lineages when none', () => {
		options.introspection = {
			gatherReasons: { lineages: 'none' },
			logErrors: true,
			enableHistory: true,
			historySize: 50,
		}

		const state = reactive({ count: 0 })
		let capturedReason: any

		effect(({ reaction }) => {
			if (reaction !== true && reaction !== false) capturedReason = reaction
			state.count
		})

		state.count++

		expect(capturedReason.triggers[0].dependency).toBeUndefined()
		expect(capturedReason.triggers[0].touch).toBeUndefined()
	})
})
