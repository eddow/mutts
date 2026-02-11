import type { EffectTrigger, Evolution } from './types'

export interface DebugHooks {
	isDevtoolsEnabled: () => boolean
	registerEffect: (effect: EffectTrigger) => void
	getTriggerChain: (effect: EffectTrigger) => string[]
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
	recordTriggerLink: () => {},
}

export function setDebugHooks(hooks: Partial<DebugHooks>) {
	Object.assign(debugHooks, hooks)
}
