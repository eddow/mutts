import { effect } from './effects'
import { cleanedBy, cleanup } from './interface'
import { reactive } from './proxy'
import { type ScopedCallback } from './types'

export type OrganizedCallback<Source extends Record<PropertyKey, any>, Target extends object> = <
	Key extends keyof Source,
>(
	key: Key,
	value: Source[Key],
	target: Target
) => ScopedCallback | undefined

export type OrganizedResult<Target extends object> = Target & { [cleanup]: ScopedCallback }

export function organized<
	Source extends Record<PropertyKey, any>,
	Target extends object = Record<PropertyKey, any>,
>(
	source: Source,
	apply: OrganizedCallback<Source, Target>,
	baseTarget: Target = {} as Target
): OrganizedResult<Target> {
	const observedSource = reactive(source) as Source
	const target = reactive(baseTarget) as Target
	const keyEffects = new Map<PropertyKey, ScopedCallback>()

	function disposeKey(key: PropertyKey) {
		const stopEffect = keyEffects.get(key)
		if (stopEffect) {
			keyEffects.delete(key)
			stopEffect()
		}
	}

	const cleanupKeys = effect(function organizedKeysEffect({ ascend }) {
		const keys = Reflect.ownKeys(observedSource) as PropertyKey[]
		const knownKeys = new Set<PropertyKey>(keys)

		for (const key of keys) {
			if (keyEffects.has(key)) continue
			ascend(() => {
				const stop = effect(function organizedKeyEffect({ tracked }) {
					const sourceKey = key as keyof Source
					const value = tracked(() => observedSource[sourceKey])
					return apply(sourceKey, value, target)
				})
				keyEffects.set(key, stop)
			})
		}

		for (const key of Array.from(keyEffects.keys())) if (!knownKeys.has(key)) disposeKey(key)
	})

	return cleanedBy(target, () => {
		cleanupKeys()
		for (const key of Array.from(keyEffects.keys())) disposeKey(key)
	}) as OrganizedResult<Target>
}
