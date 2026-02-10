export { attend, lift, type ScanResult, scan } from './buffer'
export { getState, touched, touched1 } from './change'
export { deepWatch } from './deep-watch'
export { cleanedBy, derived, effectAggregator, getActiveEffect } from './effect-context'
export {
	addBatchCleanup,
	atomic,
	biDi,
	defer,
	effect,
	getActivationLog,
	onEffectThrow,
	onEffectTrigger,
	reset,
	root,
	untracked,
} from './effects'
export { type Memoizable, memoize } from './memoize'
export { immutables, isNonReactive, registerNativeReactivity } from './non-reactive'
export { getActiveProjection, project } from './project'
export { isReactive, ReactiveBase, reactive, unwrap } from './proxy'
export { organize, organized } from './record'
export { Register, register } from './register'
export {
	cleanup,
	type EffectAccess as DependencyAccess,
	type EffectCleanup,
	type EffectOptions,
	type EffectTrigger,
	type Evolution,
	options as reactiveOptions,
	ReactiveError,
	ReactiveErrorCode,
	type ScopedCallback,
} from './types'
export { unreactive, watch } from './watch'
export { describe } from './describe'

import { ReactiveArray } from './array'
import {
	deepWatchers,
	effectToDeepWatchedObjects,
	objectParents,
	objectsWithDeepWatchers,
} from './deep-watch'
import { ReactiveMap, ReactiveWeakMap } from './map'
import { nonReactiveObjects } from './non-reactive-state'
import { metaProtos, objectToProxy, proxyToObject } from './proxy'
import { effectToReactiveObjects, watchers } from './registry'
import { ReactiveSet, ReactiveWeakSet } from './set'

// Register native collection types to use specialized reactive wrappers
metaProtos.set(Array, ReactiveArray.prototype)
metaProtos.set(Set, ReactiveSet.prototype)
metaProtos.set(WeakSet, ReactiveWeakSet.prototype)
metaProtos.set(Map, ReactiveMap.prototype)
metaProtos.set(WeakMap, ReactiveWeakMap.prototype)

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
