export {
	addBatchCleanup,
	atomic,
	effect,
	getState,
	immutables,
	isNonReactive,
	isReactive,
	options as reactiveOptions,
	profileInfo,
	Reactive,
	ReactiveBase,
	ReactiveError,
	reactive,
	type ScopedCallback,
	untracked,
	unwrap,
} from './core'
export { computed, derived, invalidateComputed, unreactive, watch } from './interface'

import { ReactiveArray } from './array'
import { registerNativeReactivity } from './core'
import { ReactiveMap, ReactiveWeakMap } from './map'
import { ReactiveSet, ReactiveWeakSet } from './set'

// Register native collection types to use specialized reactive wrappers
registerNativeReactivity(WeakMap, ReactiveWeakMap)
registerNativeReactivity(Map, ReactiveMap)
registerNativeReactivity(WeakSet, ReactiveWeakSet)
registerNativeReactivity(Set, ReactiveSet)
registerNativeReactivity(Array, ReactiveArray)
