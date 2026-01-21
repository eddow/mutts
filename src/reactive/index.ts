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
	batch, // TODO: Batch is now exported for testing purposes, though it shouldn't be - modify the tests to go through `atomic`
	biDi,
	defer,
	effect,
	getActivationLog,
	getActiveEffect,
	root,
	trackEffect,
	untracked,
} from './effects'
export { cleanedBy, cleanup, derived, unreactive, watch } from './interface'
export { mapped, ReadOnlyError, reduced } from './mapped'
export { type Memoizable, memoize } from './memoize'
export { immutables, isNonReactive, registerNativeReactivity } from './non-reactive'
export { getActiveProjection, project } from './project'
export { isReactive, ReactiveBase, reactive, unwrap } from './proxy'
export { organize, organized } from './record'
export { Register, register } from './register'
export {
	type DependencyAccess,
	type DependencyFunction,
	type Evolution,
	options as reactiveOptions,
	ReactiveError,
	type ScopedCallback,
} from './types'
export { isZoneEnabled, setZoneEnabled } from './zone'

import { ReactiveArray } from './array'
import {
	deepWatchers,
	effectToDeepWatchedObjects,
	objectParents,
	objectsWithDeepWatchers,
} from './deep-watch'
import { ReactiveMap, ReactiveWeakMap } from './map'
import { nonReactiveObjects, registerNativeReactivity } from './non-reactive-state'
import { objectToProxy, proxyToObject } from './proxy'
import { ReactiveSet, ReactiveWeakSet } from './set'
import { effectToReactiveObjects, watchers } from './tracking'

// Register native collection types to use specialized reactive wrappers
registerNativeReactivity(WeakMap, ReactiveWeakMap)
registerNativeReactivity(Map, ReactiveMap)
registerNativeReactivity(WeakSet, ReactiveWeakSet)
registerNativeReactivity(Set, ReactiveSet)
registerNativeReactivity(Array, ReactiveArray)

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
