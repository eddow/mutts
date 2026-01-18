import { ReflectGet, ReflectSet } from '../utils'
import { effect, untracked } from './effects'
import { cleanedBy, cleanup } from './interface'
import { reactive } from './proxy'
import { Register } from './register'
import { type ScopedCallback } from './types'

type ProjectOldValue<Target> = Target extends readonly (infer Item)[]
	? Item
	: Target extends Map<any, infer Item>
		? Item
		: Target extends Record<PropertyKey, infer Item>
			? Item
			: unknown

export type ProjectAccess<SourceValue, Key, SourceType, Target> = {
	readonly key: Key
	get(): SourceValue
	set(value: SourceValue): boolean
	readonly source: SourceType
	readonly old?: ProjectOldValue<Target>
	value: SourceValue
}

type BivariantProjectCallback<Args extends any[], Return> = {
	bivarianceHack(...args: Args): Return
}['bivarianceHack']

export type ProjectCallback<
	SourceValue,
	Key,
	Target extends object,
	SourceType,
	Result,
> = BivariantProjectCallback<[ProjectAccess<SourceValue, Key, SourceType, Target>, Target], Result>

export type ProjectResult<Target extends object> = Target & { [cleanup]: ScopedCallback }

function defineAccessValue<Access extends { get(): unknown; set(value: unknown): boolean }>(
	access: Access
) {
	Object.defineProperty(access, 'value', {
		get: access.get,
		set: access.set,
		configurable: true,
		enumerable: true,
	})
}

function makeCleanup<Result extends object>(
	target: Result,
	effectMap: Map<unknown, ScopedCallback>,
	onDispose: () => void
): ProjectResult<Result> {
	return cleanedBy(target, () => {
		onDispose()
		for (const stop of effectMap.values()) stop?.()
		effectMap.clear()
	}) as ProjectResult<Result>
}

function projectArray<SourceValue, ResultValue>(
	source: readonly SourceValue[],
	apply: ProjectCallback<SourceValue, number, ResultValue[], readonly SourceValue[], ResultValue>
): ProjectResult<ResultValue[]> {
	const observedSource = reactive(source) as readonly SourceValue[]
	const target = reactive([] as ResultValue[])
	const indexEffects = new Map<number, ScopedCallback>()

	function normalizeTargetLength(length: number) {
		ReflectSet(target as unknown as object, 'length', length, target)
	}

	function disposeIndex(index: number) {
		const stopEffect = indexEffects.get(index)
		if (stopEffect) {
			indexEffects.delete(index)
			stopEffect()
			Reflect.deleteProperty(target as unknown as object, index)
		}
	}

	const cleanupLength = effect(function projectArrayLengthEffect({ ascend }) {
		const length = observedSource.length
		normalizeTargetLength(length)
		const existing = Array.from(indexEffects.keys())
		for (let i = 0; i < length; i++) {
			if (indexEffects.has(i)) continue
			ascend(() => {
				const index = i
				const stop = effect(function projectArrayIndexEffect() {
					const previous = untracked(() => target[index])
					const accessBase = {
						key: index,
						source: observedSource,
						get: () => ReflectGet(observedSource as any, index, observedSource),
						set: (value: SourceValue) =>
							ReflectSet(observedSource as any, index, value, observedSource),
						old: previous,
					} as ProjectAccess<SourceValue, number, readonly SourceValue[], ResultValue[]>
					defineAccessValue(accessBase)
					const produced = apply(accessBase, target)
					target[index] = produced
				})
				indexEffects.set(i, stop)
			})
		}
		for (const index of existing) if (index >= length) disposeIndex(index)
	})

	return makeCleanup(target, indexEffects, () => cleanupLength())
}

function projectRegister<Key extends PropertyKey, SourceValue, ResultValue>(
	source: Register<SourceValue, Key>,
	apply: ProjectCallback<
		SourceValue,
		Key,
		Map<Key, ResultValue>,
		Register<SourceValue, Key>,
		ResultValue
	>
): ProjectResult<Map<Key, ResultValue>> {
	const observedSource = reactive(source) as Register<SourceValue, Key>
	const rawTarget = new Map<Key, ResultValue>()
	const target = reactive(rawTarget) as Map<Key, ResultValue>
	const keyEffects = new Map<Key, ScopedCallback>()

	function disposeKey(key: Key) {
		const stopEffect = keyEffects.get(key)
		if (stopEffect) {
			stopEffect()
			keyEffects.delete(key)
			target.delete(key)
		}
	}

	const cleanupKeys = effect(function projectRegisterEffect({ ascend }) {
		const keys = new Set<Key>()
		for (const key of observedSource.mapKeys()) keys.add(key)

		for (const key of keys) {
			if (keyEffects.has(key)) continue
			ascend(() => {
				const stop = effect(function projectRegisterKeyEffect() {
					const previous = untracked(() => target.get(key))
					const accessBase = {
						key,
						source: observedSource,
						get: () => observedSource.get(key) as SourceValue,
						set: (value: SourceValue) => {
							observedSource.set(key, value)
							return true
						},
						old: previous,
					} as ProjectAccess<SourceValue, Key, Register<SourceValue, Key>, Map<Key, ResultValue>>
					defineAccessValue(accessBase)
					const produced = apply(accessBase, target)
					target.set(key, produced)
				})
				keyEffects.set(key, stop)
			})
		}

		for (const key of Array.from(keyEffects.keys())) if (!keys.has(key)) disposeKey(key)
	})

	return makeCleanup(target, keyEffects, () => cleanupKeys())
}

function projectRecord<Source extends Record<PropertyKey, any>, ResultValue>(
	source: Source,
	apply: ProjectCallback<
		Source[keyof Source],
		keyof Source,
		Record<keyof Source, ResultValue>,
		Source,
		ResultValue
	>
): ProjectResult<Record<keyof Source, ResultValue>> {
	const observedSource = reactive(source) as Source
	const target = reactive({} as Record<keyof Source, ResultValue>)
	const keyEffects = new Map<PropertyKey, ScopedCallback>()

	function disposeKey(key: PropertyKey) {
		const stopEffect = keyEffects.get(key)
		if (stopEffect) {
			stopEffect()
			keyEffects.delete(key)
			Reflect.deleteProperty(target as Record<PropertyKey, unknown>, key)
		}
	}

	const cleanupKeys = effect(function projectRecordEffect({ ascend }) {
		const keys = new Set<PropertyKey>()
		for (const key in observedSource) keys.add(key)
		const observed = Reflect.ownKeys(observedSource)
		for (const key of observed) keys.add(key)

		for (const key of keys) {
			if (keyEffects.has(key)) continue
			ascend(() => {
				const stop = effect(function projectRecordKeyEffect() {
					const sourceKey = key as keyof Source
					const previous = untracked(
						() => (target as Record<PropertyKey, ResultValue | undefined>)[key]
					)
					const accessBase = {
						key: sourceKey,
						source: observedSource,
						get: () => ReflectGet(observedSource, sourceKey, observedSource),
						set: (value: Source[typeof sourceKey]) =>
							ReflectSet(observedSource, sourceKey, value, observedSource),
						old: previous,
					} as ProjectAccess<
						Source[typeof sourceKey],
						keyof Source,
						Source,
						Record<keyof Source, ResultValue>
					>
					defineAccessValue(accessBase)
					const produced = apply(accessBase, target)
					;(target as any)[sourceKey] = produced
				})
				keyEffects.set(key, stop)
			})
		}

		for (const key of Array.from(keyEffects.keys())) if (!keys.has(key)) disposeKey(key)
	})

	return makeCleanup(target, keyEffects, () => cleanupKeys())
}

function projectMap<Key, Value, ResultValue>(
	source: Map<Key, Value>,
	apply: ProjectCallback<Value, Key, Map<Key, ResultValue>, Map<Key, Value>, ResultValue>
): ProjectResult<Map<Key, ResultValue>> {
	const observedSource = reactive(source) as Map<Key, Value>
	const rawTarget = new Map<Key, ResultValue>()
	const target = reactive(rawTarget) as Map<Key, ResultValue>
	const keyEffects = new Map<Key, ScopedCallback>()

	function disposeKey(key: Key) {
		const stopEffect = keyEffects.get(key)
		if (stopEffect) {
			stopEffect()
			keyEffects.delete(key)
			target.delete(key)
		}
	}

	const cleanupKeys = effect(function projectMapEffect({ ascend }) {
		const keys = new Set<Key>()
		for (const key of observedSource.keys()) keys.add(key)

		for (const key of keys) {
			if (keyEffects.has(key)) continue
			ascend(() => {
				const stop = effect(function projectMapKeyEffect() {
					const previous = untracked(() => target.get(key))
					const accessBase = {
						key,
						source: observedSource,
						get: () => observedSource.get(key) as Value,
						set: (value: Value) => {
							observedSource.set(key, value)
							return true
						},
						old: previous,
					} as ProjectAccess<Value, Key, Map<Key, Value>, Map<Key, ResultValue>>
					defineAccessValue(accessBase)
					const produced = apply(accessBase, target)
					target.set(key, produced)
				})
				keyEffects.set(key, stop)
			})
		}

		for (const key of Array.from(keyEffects.keys())) if (!keys.has(key)) disposeKey(key)
	})

	return makeCleanup(target, keyEffects, () => cleanupKeys())
}

type ProjectOverload = {
	<SourceValue, ResultValue>(
		source: readonly SourceValue[],
		apply: ProjectCallback<SourceValue, number, ResultValue[], readonly SourceValue[], ResultValue>
	): ProjectResult<ResultValue[]>
	<Key extends PropertyKey, SourceValue, ResultValue>(
		source: Register<SourceValue, Key>,
		apply: ProjectCallback<
			SourceValue,
			Key,
			Map<Key, ResultValue>,
			Register<SourceValue, Key>,
			ResultValue
		>
	): ProjectResult<Map<Key, ResultValue>>
	<Source extends Record<PropertyKey, any>, ResultValue>(
		source: Source,
		apply: ProjectCallback<
			Source[keyof Source],
			keyof Source,
			Record<keyof Source, ResultValue>,
			Source,
			ResultValue
		>
	): ProjectResult<Record<keyof Source, ResultValue>>
	<Key, Value, ResultValue>(
		source: Map<Key, Value>,
		apply: ProjectCallback<Value, Key, Map<Key, ResultValue>, Map<Key, Value>, ResultValue>
	): ProjectResult<Map<Key, ResultValue>>
	array: typeof projectArray
	register: typeof projectRegister
	record: typeof projectRecord
	map: typeof projectMap
}

function projectCore(source: any, apply: any): ProjectResult<any> {
	if (Array.isArray(source)) return projectArray(source, apply)
	if (source instanceof Map) return projectMap(source, apply)
	if (source instanceof Register) return projectRegister(source, apply)
	if (source && (source.constructor === Object || source.constructor === undefined))
		return projectRecord(source, apply)
	throw new Error('Unsupported source type')
}

export const project: ProjectOverload = Object.assign(projectCore, {
	array: projectArray,
	register: projectRegister,
	record: projectRecord,
	map: projectMap,
})
