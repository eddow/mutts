export { getState, touched, touched1 } from './change'
export type { ReactivityGraph } from './debug'
export {
	buildReactivityGraph,
	enableDevTools,
	isDevtoolsEnabled,
	registerEffectForDebug,
	registerObjectForDebug,
	setEffectName,
	setObjectName,
} from './debug'
export { deepWatch } from './deep-watch'
export {
	addBatchCleanup,
	atomic,
	biDi,
	defer,
	effect,
	getActivationLog,
	root,
	trackEffect,
	untracked,
} from './effects'
export { cleanedBy, cleanup, derived, unreactive, watch } from './interface'
export { type Memoizable, memoize } from './memoize'
export { immutables, isNonReactive, registerNativeReactivity } from './non-reactive'
export { getActiveProjection, project } from './project'
export { isReactive, ReactiveBase, reactive, unwrap } from './proxy'
export { organize, organized } from './record'
export { scan, type ScanResult, lift } from './buffer'
export { Register, register } from './register'
export { getActiveEffect, effectAggregator } from './effect-context'
export {
	type DependencyAccess,
	type EffectOptions,
	type Evolution,
	options as reactiveOptions,
	ReactiveError,
	ReactiveErrorCode,
	type ScopedCallback,
} from './types'

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
