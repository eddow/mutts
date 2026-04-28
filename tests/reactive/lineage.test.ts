import { describe, it, expect, beforeEach } from 'vitest'
import { effect, reactiveOptions } from '../../src/reactive'
import { digestLineage, getLineage, lineageFormatter } from '../../debug'

describe('Effect Lineage', () => {
	beforeEach(() => {
		reactiveOptions.introspection!.enableHistory = true
	})

	it('should capture structured stack frames', () => {
		let frames: any[] = []
		effect`testEffect`(() => {
			const lineage = digestLineage(getLineage())
			frames = lineage[0].stack
		})

		expect(frames.length).toBeGreaterThan(0)
		expect(frames[0].functionName).toBe('testEffect')
		expect(frames[0].fileName).toBeDefined()
	})

	it('should track lineage across nested effects', () => {
		let lineageAtInner: any[] = []
		
		effect`parentEffect`(() => {
			effect`childEffect`(() => {
				lineageAtInner = digestLineage(getLineage())
			})
		})

		// Lineage should have 3 segments: childExecution (childEffect), parentExecution (parentEffect), and root
		// Wait, my implementation might differ. Let's see:
		// Segments:
		// 1. childEffect (current execution)
		// 2. parentEffect (parent execution where child was created?)
		// Actually, let's just check if we have multiple segments.
		
		expect(lineageAtInner.length).toBeGreaterThanOrEqual(2)
		expect(lineageAtInner[0].effectName).toBe('childEffect')
		expect(lineageAtInner[1].effectName).toBe('parentEffect')
	})

	it('should capture creation stack for effects', () => {
		let capturedLineage: any[] = []
		
		function createEffect() {
			effect.named('dynamicEffect')(()=> {
				capturedLineage = digestLineage(getLineage())
			})
		}

		createEffect()

		// lineage[0] = dynamicEffect execution
		// lineage[1] = root execution (creation point of dynamicEffect)
		
		expect(capturedLineage.length).toBeGreaterThanOrEqual(2)
		expect(capturedLineage[0].effectName).toBe('dynamicEffect')
		expect(capturedLineage[1].effectName).toBe('root')
		
		// The root segment stack should contain 'createEffect'
		const rootStack = capturedLineage[1].stack
		const hasCreateEffect = rootStack.some((f: any) => f.functionName === 'createEffect')
		expect(hasCreateEffect).toBe(true)
	})

	it('should work when no effect is active', () => {
		const signature = getLineage()
		expect(signature.digested).toBeUndefined()
		const lineage = digestLineage(signature)
		expect(lineage.length).toBe(1)
		expect(lineage[0].effectName).toBe('root')
		expect(lineage[0].stack.length).toBeGreaterThan(0)
	})

	it('caches digested lineage only after human-readable access', () => {
		const signature = getLineage()
		expect(signature.digested).toBeUndefined()
		const first = digestLineage(signature)
		expect(signature.digested).toBe(first)
		const second = digestLineage(signature)
		expect(second).toBe(first)
	})

	it('renders formatter body as collapsed per-segment stack groups', () => {
		const signature = getLineage()
		const body = lineageFormatter.body(signature) as unknown[]
		const serialized = JSON.stringify(body)
		expect(serialized).toContain('"object"')
		expect(serialized).toContain('"segment"')
		const segmentObject = ((((body[2] as unknown[])[2] as unknown[])[1] as { object: unknown }).object)
		const segmentHeader = lineageFormatter.header(segmentObject) as unknown[]
		expect(JSON.stringify(segmentHeader)).toMatch(/Effect:/)
		const segmentBody = lineageFormatter.body(segmentObject) as unknown[]
		expect(JSON.stringify(segmentBody)).toContain('"object"')
	})
})
