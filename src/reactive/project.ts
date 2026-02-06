import { setEffectName } from '../../debug/debug'
import { FoolProof } from '../utils'
import { cleanedBy, getActiveEffect } from './effect-context'
import { effect, untracked } from './effects'
import { reactive } from './proxy'
import { Register } from './register'
import {
	cleanup,
	type EffectTrigger,
	type ProjectionContext,
	projectionInfo,
	type ScopedCallback,
} from './types'

/**
 * Maps projection effects (item effects) to their projection context
 */
export const effectProjectionMetadata = new WeakMap<EffectTrigger, ProjectionContext>()

/**
 * Returns the projection context of the currently running effect, if any.
 */
export function getActiveProjection(): ProjectionContext | undefined {
	const active = getActiveEffect()
	return active ? effectProjectionMetadata.get(active) : undefined
}
function setActiveProjection(projection: ProjectionContext | undefined) {
	const active = getActiveEffect()
	if (active) effectProjectionMetadata.set(active, projection)
}

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

export type ProjectCallback<SourceValue, Key, Target extends object, SourceType, Result> = (
	access: ProjectAccess<SourceValue, Key, SourceType, Target>,
	target: Target
) => Result

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
	onDispose: () => void,
	metadata?: any
): ProjectResult<Result> {
	if (metadata) {
		Object.defineProperty(target, projectionInfo, {
			value: metadata,
			writable: false,
			enumerable: false,
			configurable: true,
		})
	}
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
	source = reactive(source)
	const target = reactive([] as ResultValue[])
	const indexEffects = new Map<number, ScopedCallback>()

	function normalizeTargetLength(length: number) {
		FoolProof.set(target as unknown as object, 'length', length, target)
	}

	function disposeIndex(index: number) {
		const stopEffect = indexEffects.get(index)
		if (stopEffect) {
			indexEffects.delete(index)
			stopEffect()
			Reflect.deleteProperty(target as unknown as object, index)
		}
	}

	const parent = getActiveProjection()
	const depth = parent ? parent.depth + 1 : 0

	const cleanupLength = effect(function projectArrayLengthEffect({ ascend }) {
		const length = source.length
		normalizeTargetLength(length)
		const existing = Array.from(indexEffects.keys())
		for (let i = 0; i < length; i++) {
			if (indexEffects.has(i)) continue
			ascend(() => {
				const index = i
				const stop = effect(function projectArrayIndexEffect({ reaction }) {
					if (!reaction) setActiveProjection({ source, key: index, target, depth, parent })
					const previous = untracked(() => target[index])
					const accessBase = {
						key: index,
						source,
						get: () => FoolProof.get(source as any, index, source),
						set: (value: SourceValue) => FoolProof.set(source as any, index, value, source),
						old: previous,
					} as ProjectAccess<SourceValue, number, readonly SourceValue[], ResultValue[]>
					defineAccessValue(accessBase)
					target[index] = apply(accessBase, target)
				})
				setEffectName(stop, `project[${depth}]:${index}`)
				indexEffects.set(i, stop)
			})
		}
		for (const index of existing) if (index >= length) disposeIndex(index)
	})

	return makeCleanup(target, indexEffects, () => cleanupLength(), {
		source,
		target,
		apply,
		depth,
		parent,
	} as ProjectionContext)
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
	source = reactive(source) as Register<SourceValue, Key>
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

	const parent = getActiveProjection()
	const depth = parent ? parent.depth + 1 : 0

	const cleanupKeys = effect(function projectRegisterEffect({ ascend }) {
		const keys = new Set<Key>()
		for (const key of source.mapKeys()) keys.add(key)

		for (const key of keys) {
			if (keyEffects.has(key)) continue
			ascend(() => {
				const stop = effect(function projectRegisterKeyEffect({ reaction }) {
					if (!reaction) setActiveProjection({ source, key, target, depth, parent })
					const previous = untracked(() => target.get(key))
					const accessBase = {
						key,
						source: source,
						get: () => source.get(key) as SourceValue,
						set: (value: SourceValue) => {
							source.set(key, value)
							return true
						},
						old: previous,
					} as ProjectAccess<SourceValue, Key, Register<SourceValue, Key>, Map<Key, ResultValue>>
					defineAccessValue(accessBase)
					const produced = apply(accessBase, target)
					target.set(key, produced)
				})
				setEffectName(stop, `project[${depth}]:${String(key)}`)
				keyEffects.set(key, stop)
			})
		}

		for (const key of Array.from(keyEffects.keys())) if (!keys.has(key)) disposeKey(key)
	})

	return makeCleanup(target, keyEffects, () => cleanupKeys(), {
		source: source,
		target,
		apply,
		depth,
		parent,
	} as ProjectionContext)
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
	source = reactive(source) as Source
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

	const parent = getActiveProjection()
	const depth = parent ? parent.depth + 1 : 0

	const cleanupKeys = effect(function projectRecordEffect({ ascend }) {
		const keys = new Set<PropertyKey>()
		for (const key in source) keys.add(key)
		const observed = Reflect.ownKeys(source)
		for (const key of observed) keys.add(key)

		for (const key of keys) {
			if (keyEffects.has(key)) continue
			ascend(() => {
				const stop = effect(function projectRecordKeyEffect({ reaction }) {
					if (!reaction) setActiveProjection({ source, key, target, depth, parent })
					const sourceKey = key as keyof Source
					const previous = untracked(
						() => (target as Record<PropertyKey, ResultValue | undefined>)[key]
					)
					const accessBase = {
						key: sourceKey,
						source: source,
						get: () => FoolProof.get(source, sourceKey, source),
						set: (value: Source[typeof sourceKey]) =>
							FoolProof.set(source, sourceKey, value, source),
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
				setEffectName(stop, `project[${depth}]:${String(key)}`)
				keyEffects.set(key, stop)
			})
		}

		for (const key of Array.from(keyEffects.keys())) if (!keys.has(key)) disposeKey(key)
	})

	return makeCleanup(target, keyEffects, () => cleanupKeys(), {
		source: source,
		target,
		apply,
		depth,
		parent,
	} as ProjectionContext)
}

function projectMap<Key, Value, ResultValue>(
	source: Map<Key, Value>,
	apply: ProjectCallback<Value, Key, Map<Key, ResultValue>, Map<Key, Value>, ResultValue>
): ProjectResult<Map<Key, ResultValue>> {
	source = reactive(source) as Map<Key, Value>
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

	const parent = getActiveProjection()
	const depth = parent ? parent.depth + 1 : 0

	const cleanupKeys = effect(function projectMapEffect({ ascend }) {
		const keys = new Set<Key>()
		for (const key of source.keys()) keys.add(key)

		for (const key of keys) {
			if (keyEffects.has(key)) continue
			ascend(() => {
				const stop = effect(function projectMapKeyEffect({ reaction }) {
					if (!reaction) setActiveProjection({ source, key, target, depth, parent })
					const previous = untracked(() => target.get(key))
					const accessBase = {
						key,
						source: source,
						get: () => source.get(key) as Value,
						set: (value: Value) => {
							source.set(key, value)
							return true
						},
						old: previous,
					} as ProjectAccess<Value, Key, Map<Key, Value>, Map<Key, ResultValue>>
					defineAccessValue(accessBase)
					const produced = apply(accessBase, target)
					target.set(key, produced)
				})
				setEffectName(stop, `project[${depth}]:${String(key)}`)
				keyEffects.set(key, stop)
			})
		}

		for (const key of Array.from(keyEffects.keys())) if (!keys.has(key)) disposeKey(key)
	})

	return makeCleanup(target, keyEffects, () => cleanupKeys(), {
		source: source,
		target,
		apply,
		depth,
		parent,
	} as ProjectionContext)
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

function projectCore<SourceValue, ResultValue>(
	source: readonly SourceValue[],
	apply: ProjectCallback<SourceValue, number, ResultValue[], readonly SourceValue[], ResultValue>
): ProjectResult<ResultValue[]>
function projectCore<Key extends PropertyKey, SourceValue, ResultValue>(
	source: Register<SourceValue, Key>,
	apply: ProjectCallback<
		SourceValue,
		Key,
		Map<Key, ResultValue>,
		Register<SourceValue, Key>,
		ResultValue
	>
): ProjectResult<Map<Key, ResultValue>>
function projectCore<Source extends Record<PropertyKey, any>, ResultValue>(
	source: Source,
	apply: ProjectCallback<
		Source[keyof Source],
		keyof Source,
		Record<keyof Source, ResultValue>,
		Source,
		ResultValue
	>
): ProjectResult<Record<keyof Source, ResultValue>>
function projectCore<Key, Value, ResultValue>(
	source: Map<Key, Value>,
	apply: ProjectCallback<Value, Key, Map<Key, ResultValue>, Map<Key, Value>, ResultValue>
): ProjectResult<Map<Key, ResultValue>>
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
