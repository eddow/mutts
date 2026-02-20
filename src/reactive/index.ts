export { attend, lift, morph, type ScanResult, scan } from './buffer'
export { getState, touched, touched1 } from './change'
export { deepWatch } from './deep-watch'
export { cleanedBy, effectAggregator, getActiveEffect } from './effect-context'
export {
	addBatchCleanup,
	atomic,
	//batch, - NEVER export batch, it deals with EffectTriggers who are internal types - mutts consumers use `atomic`
	biDi,
	caught,
	defer,
	effect,
	getActivationLog,
	onEffectThrow,
	reset,
	root,
	untracked,
} from './effects'
export { type Memoizable, type MemoizableArgument, memoize } from './memoize'
export { immutables, isNonReactive } from './non-reactive-state'
export { ReactiveBase, reactive } from './proxy'
export { organize, organized } from './record'
export { Register, register } from './register'
export {
	type CleanupReason,
	cleanup,
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
	proxyToObject,
	ReactiveError,
	ReactiveErrorCode,
	type ScopedCallback,
	stopped,
	unwrap,
} from './types'
export { type Resource, resource, unreactive, watch, when } from './watch'

import { ReactiveArray, ReactiveArrayWrapper } from './array'
import {
	deepWatchers,
	effectToDeepWatchedObjects,
	objectParents,
	objectsWithDeepWatchers,
} from './deep-watch-state'
import { ReactiveMap, ReactiveWeakMap } from './map'
import { nonReactiveObjects } from './non-reactive-state'
import { metaProtos, wrapProtos } from './proxy'
import { effectToReactiveObjects, watchers } from './registry'
import { ReactiveSet, ReactiveWeakSet } from './set'
import { objectToProxy, proxyToObject } from './types'

// Register native collection types to use specialized reactive wrappers
console.time('mutts-reactive-init')
metaProtos.set(Array, ReactiveArray.prototype)
metaProtos.set(Set, ReactiveSet.prototype)
metaProtos.set(WeakSet, ReactiveWeakSet.prototype)
metaProtos.set(Map, ReactiveMap.prototype)
metaProtos.set(WeakMap, ReactiveWeakMap.prototype)
wrapProtos.set(Array, ReactiveArrayWrapper.prototype)
console.timeEnd('mutts-reactive-init')

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
	nonReactiveObjects,
}
