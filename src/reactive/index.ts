export { getState, touched, touched1 } from './change'
export { deepWatch } from './deep-watch'
export {
	addBatchCleanup,
	atomic,
	biDi,
	effect,
	getActiveEffect,
	trackEffect,
	untracked,
	withEffect,
} from './effects'
export { cleanedBy, cleanup, derived, unreactive, watch } from './interface'
export {
	isBigInt,
	isBoolean,
	isFunction,
	isNumber,
	isObject,
	isString,
	isSymbol,
	isUndefined,
	lazy,
	typeOf,
} from './lazy-get'
export { mapped, ReadOnlyError, reduced } from './mapped'
export { type Memoizable, memoize } from './memoize'
export { immutables, isNonReactive, registerNativeReactivity } from './non-reactive'
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
