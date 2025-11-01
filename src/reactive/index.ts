export { getState, touched, touched1 } from './change'
export { deepWatch } from './deep-watch'
export { addBatchCleanup, atomic, effect, trackEffect, withEffect } from './effects'
export {
	cleanedBy,
	cleanup,
	unreactive,
	watch,
} from './interface'
export { KeyedArray, keyedArray, mapped } from './keyedArray'
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
export { profileInfo, untracked } from './utilities'

import { ReactiveArray } from './array'
import { ReactiveMap, ReactiveWeakMap } from './map'
import { registerNativeReactivity } from './non-reactive'
import { ReactiveSet, ReactiveWeakSet } from './set'

// Register native collection types to use specialized reactive wrappers
registerNativeReactivity(WeakMap, ReactiveWeakMap)
registerNativeReactivity(Map, ReactiveMap)
registerNativeReactivity(WeakSet, ReactiveWeakSet)
registerNativeReactivity(Set, ReactiveSet)
registerNativeReactivity(Array, ReactiveArray)
