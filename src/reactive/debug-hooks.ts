import { getActiveEffect } from './effect-context'
import { getEffectNode, getRoot } from './registry'
import type { EffectTrigger, Evolution } from './types'

export interface DebugHooks {
	isDevtoolsEnabled: () => boolean
	registerEffect: (effect: EffectTrigger) => void
	getTriggerChain: (effect: EffectTrigger) => string[]
	captureStack: (error?: unknown) => unknown
	captureLineage: (effect?: EffectTrigger, stack?: unknown) => unknown
	formatStack: (stack: unknown) => unknown[]
	recordTriggerLink: (
		source: EffectTrigger | undefined,
		target: EffectTrigger,
		obj: object,
		prop: any,
		evolution: Evolution
	) => void
	decorateError: (error: unknown, trigger: EffectTrigger) => void
}

type DeferredLineageSegment = {
	effectName: string
	stack: string[]
}

type DeferredLineage = {
	effect?: EffectTrigger
	stack?: unknown
	segments?: DeferredLineageSegment[]
	toString(): string
}

function extractRawStack(error: unknown = new Error()): string | undefined {
	if (typeof error === 'string') return error
	if (error && typeof error === 'object' && 'stack' in error) {
		const stack = (error as { stack?: unknown }).stack
		return typeof stack === 'string' ? stack : undefined
	}
	return undefined
}

function trimStack(stack: unknown): string[] {
	const raw = extractRawStack(stack)
	if (!raw) return []
	const lines = raw
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
	if (lines[0]?.startsWith('Error')) lines.shift()
	while (
		lines[0] &&
		(lines[0].includes('captureLineage') ||
			lines[0].includes('captureDeferredLineage') ||
			lines[0].includes('debug-hooks.ts'))
	)
		lines.shift()
	return lines
}

function digestDeferredLineage(lineage: DeferredLineage): DeferredLineageSegment[] {
	if (lineage.segments) return lineage.segments
	const segments: DeferredLineageSegment[] = []
	let effect = lineage.effect
	let stack = trimStack(lineage.stack)
	if (!effect) {
		lineage.segments = [{ effectName: 'root', stack }]
		return lineage.segments
	}
	while (effect) {
		const root = getRoot(effect)
		segments.push({
			effectName: root.name || 'anonymous',
			stack,
		})
		const node = getEffectNode(effect)
		effect = node.parent
		stack = trimStack(node.creationStack)
	}
	if (stack.length) segments.push({ effectName: 'root', stack })
	lineage.segments = segments
	return segments
}

function formatDeferredLineage(lineage: DeferredLineage): string {
	return digestDeferredLineage(lineage)
		.map((segment) =>
			[`${segment.effectName}:`, ...segment.stack.map((line) => `  ${line}`)].join('\n')
		)
		.join('\n')
}

function captureDeferredLineage(
	effect: EffectTrigger | undefined = getActiveEffect(),
	stack: unknown = new Error()
): DeferredLineage {
	return {
		effect,
		stack,
		toString() {
			return formatDeferredLineage(this)
		},
	}
}

export const debugHooks: DebugHooks = {
	isDevtoolsEnabled: () => false,
	registerEffect: () => {},
	getTriggerChain: () => [],
	captureStack: (error?: unknown) => extractRawStack(error ?? new Error()),
	captureLineage: captureDeferredLineage,
	formatStack: (stack: unknown) => [stack],
	recordTriggerLink: () => {},
	decorateError: () => {},
}

export function setDebugHooks(hooks: Partial<DebugHooks>) {
	Object.assign(debugHooks, hooks)
}
