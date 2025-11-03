export { mapped, Register, register } from './array'
export { getState, touched, touched1 } from './change'
export { deepWatch } from './deep-watch'
export { addBatchCleanup, atomic, effect, trackEffect, untracked, withEffect } from './effects'
export {
	cleanedBy,
	cleanup,
	derived,
	unreactive,
	watch,
} from './interface'
export { type Memoizable, memoize } from './memoize'
export { immutables, isNonReactive, registerNativeReactivity } from './non-reactive'
export { isReactive, ReactiveBase, reactive, unwrap } from './proxy'
export { activeEffect } from './tracking'
export {
	type DependencyAccess,
	type DependencyFunction,
	type Evolution,
	options as reactiveOptions,
	ReactiveError,
	type ScopedCallback,
} from './types'
export { isZoneEnabled, setZoneEnabled } from './zone'

import {
	deepWatchers,
	effectToDeepWatchedObjects,
	objectParents,
	objectsWithDeepWatchers,
} from './deep-watch'
import { ReactiveArray } from './native/array'
import { ReactiveMap, ReactiveWeakMap } from './native/map'
import { ReactiveSet, ReactiveWeakSet } from './native/set'
import { nonReactiveObjects, registerNativeReactivity } from './non-reactive'
import { objectToProxy, proxyToObject } from './proxy'
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
