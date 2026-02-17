export { attend, lift, morph, type ScanResult, scan } from './buffer'
export { getState, touched, touched1 } from './change'
export { deepWatch } from './deep-watch'
export { cleanedBy, effectAggregator, getActiveEffect } from './effect-context'
export {
	addBatchCleanup,
	atomic,
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
export { immutables, isNonReactive } from './non-reactive'
export { getActiveProjection, project } from './project'
export { isReactive, ReactiveBase, reactive, unwrap } from './proxy'
export { organize, organized } from './record'
export { Register, register } from './register'
export {
	type CleanupReason,
	cleanup,
	type EffectAccess as DependencyAccess,
	type EffectCleanup,
	type EffectOptions,
	type EffectTrigger,
	type Evolution,
	formatCleanupReason,
	options as reactiveOptions,
	type PropTrigger,
	ReactiveError,
	ReactiveErrorCode,
	type ScopedCallback,
	stopped,
} from './types'
export { type Resource, resource, unreactive, watch, when } from './watch'

import { ReactiveArray, ReactiveArrayWrapper } from './array'
import {
	deepWatchers,
	effectToDeepWatchedObjects,
	objectParents,
	objectsWithDeepWatchers,
} from './deep-watch'
import { ReactiveMap, ReactiveWeakMap } from './map'
import { nonReactiveObjects } from './non-reactive-state'
import { metaProtos, objectToProxy, proxyToObject, wrapProtos } from './proxy'
import { effectToReactiveObjects, watchers } from './registry'
import { ReactiveSet, ReactiveWeakSet } from './set'

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
