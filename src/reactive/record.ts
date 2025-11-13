import { ReflectGet, ReflectSet } from '../utils'
import { touched1 } from './change'
import { effect } from './effects'
import { cleanedBy, cleanup } from './interface'
import { reactive } from './proxy'
import { type ScopedCallback } from './types'

export type OrganizedAccess<Source extends Record<PropertyKey, any>, Key extends keyof Source> = {
	readonly key: Key
	get(): Source[Key]
	set(value: Source[Key]): boolean
	value: Source[Key]
}

export type OrganizedCallback<Source extends Record<PropertyKey, any>, Target extends object> = <
	Key extends keyof Source,
>(
	access: OrganizedAccess<Source, Key>,
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
		//const keys = Reflect.ownKeys(observedSource) as PropertyKey[]
		const keys = new Set<PropertyKey>()
		for (const key in observedSource) keys.add(key)

		for (const key of keys) {
			if (keyEffects.has(key)) continue
			ascend(() => {
				const stop = effect(function organizedKeyEffect() {
					const sourceKey = key as keyof Source
					const accessBase = {
						key: sourceKey,
						get: () => ReflectGet(observedSource, sourceKey, observedSource),
						set: (value: Source[typeof sourceKey]) =>
							ReflectSet(observedSource, sourceKey, value, observedSource),
					}
					Object.defineProperty(accessBase, 'value', {
						get: accessBase.get,
						set: accessBase.set,
						configurable: true,
						enumerable: true,
					})
					return apply(accessBase as OrganizedAccess<Source, typeof sourceKey>, target)
				})
				keyEffects.set(key, stop)
			})
		}

		for (const key of Array.from(keyEffects.keys())) if (!keys.has(key)) disposeKey(key)
	})

	return cleanedBy(target, () => {
		cleanupKeys()
		for (const key of Array.from(keyEffects.keys())) disposeKey(key)
	}) as OrganizedResult<Target>
}

/**
 * Organizes a property on a target object
 * Shortcut for defineProperty/delete with touched signal
 * @param target - The target object
 * @param property - The property to organize
 * @param access - The access object
 * @returns The property descriptor
 */
export function organize<T>(
	target: object,
	property: PropertyKey,
	access: { get?(): T; set?(value: T): boolean }
) {
	Object.defineProperty(target, property, {
		get: access.get,
		set: access.set,
		configurable: true,
		enumerable: true,
	})
	touched1(target, { type: 'set', prop: property }, property)
	return () => delete target[property]
}
