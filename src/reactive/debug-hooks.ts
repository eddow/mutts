import type { EffectTrigger, Evolution } from './types'

export interface DebugHooks {
	isDevtoolsEnabled: () => boolean
	registerEffect: (effect: EffectTrigger) => void
	getTriggerChain: (effect: EffectTrigger) => string[]
	captureStack: () => unknown
	captureLineage: () => unknown
	formatStack: (stack: unknown) => unknown[]
	recordTriggerLink: (
		source: EffectTrigger | undefined,
		target: EffectTrigger,
		obj: object,
		prop: any,
		evolution: Evolution
	) => void
}

export const debugHooks: DebugHooks = {
	isDevtoolsEnabled: () => false,
	registerEffect: () => {},
	getTriggerChain: () => [],
	captureStack: () => [],
	captureLineage: () => new Error().stack,
	formatStack: (stack: unknown) => [stack],
	recordTriggerLink: () => {},
}

export function setDebugHooks(hooks: Partial<DebugHooks>) {
	Object.assign(debugHooks, hooks)
}
