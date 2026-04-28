export { attend, lift, type MorphPosition, morph } from './buffer'
export { getState, touched, touched1 } from './change'
export { deepWatch } from './deep-watch'
export {
	type EffectContext,
	effectAggregator,
	effectContext,
	getActiveEffect,
	link,
	unlink,
	withEffectContext,
} from './effect-context'
export {
	addBatchCleanup,
	atom,
	atomic,
	//batch, - NEVER export batch, it deals with EffectTriggers who are internal types - mutts consumers use `atomic` or `atom`
	biDi,
	captured,
	caught,
	defer,
	effect,
	getActivationLog,
	inert,
	isReactiveBroken,
	onEffectThrow,
	onReactiveBroken,
	onReactiveReset,
	reset,
	root,
	untracked,
	wrapInert,
} from './effects'
export { type Memoizable, type MemoizableArgument, memoize } from './memoize'
export { addUnreactiveProps, isNonReactive, markRaw, markRawProps } from './non-reactive'
export { ReactiveBase, reactive, readonlyReactive, shallowReactive } from './proxy'
export { organize, organized } from './record'
export { type Resource, resource, unreactive, watch, when } from './satellite'
export { assertUntracked } from './tracking'
export {
	type CleanupReason,
	debugPreset,
	devPreset,
	type EffectAccess,
	type EffectCleanup,
	type EffectCloser,
	type EffectOptions,
	type EffectTrigger,
	type Evolution,
	formatCleanupReason,
	isReactive,
	objectToProxy,
	options as reactiveOptions,
	type PropTrigger,
	prodPreset,
	proxyToObject,
	ReactiveError,
	ReactiveErrorCode,
	type ScopedCallback,
	toRaw,
	unwrap,
} from './types'

import { ReactiveArray, ReactiveArrayWrapper } from './array'
import {
	deepWatchers,
	effectToDeepWatchedObjects,
	objectParents,
	objectsWithDeepWatchers,
} from './deep-watch-state'
import { ReactiveMap, ReactiveWeakMap } from './map'
import { metaProtos, wrapProtos } from './proxy'
import { effectToReactiveObjects, watchers } from './registry'
import { ReactiveSet, ReactiveWeakSet } from './set'
import { objectToProxy, proxyToObject } from './types'

// Register native collection types to use specialized reactive wrappers
metaProtos.set(Array, ReactiveArray.prototype)
metaProtos.set(Set, ReactiveSet.prototype)
metaProtos.set(WeakSet, ReactiveWeakSet.prototype)
metaProtos.set(Map, ReactiveMap.prototype)
metaProtos.set(WeakMap, ReactiveWeakMap.prototype)
wrapProtos.set(Array, ReactiveArrayWrapper.prototype)

/**
 * Object containing internal reactive system state for debugging and profiling
 */
export const profileInfo: any = {
	objectToProxy,
	proxyToObject,
	effectToReactiveObjects,
	watchers,
	objectParents,
	objectsWithDeepWatchers,
	deepWatchers,
	effectToDeepWatchedObjects,
}
