export {
	activeEffect,
	addBatchCleanup,
	atomic,
	type Evolution,
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
	trackEffect,
	untracked,
	unwrap,
} from './core'
export {
	cleanedBy,
	computed,
	invalidateComputed,
	unreactive,
	watch,
} from './interface'

import { registerNativeReactivity } from './core'
import { ReactiveArray } from './natives/array'
import { ReactiveMap, ReactiveWeakMap } from './natives/map'
import { ReactiveSet, ReactiveWeakSet } from './natives/set'

// Register native collection types to use specialized reactive wrappers
registerNativeReactivity(WeakMap, ReactiveWeakMap)
registerNativeReactivity(Map, ReactiveMap)
registerNativeReactivity(WeakSet, ReactiveWeakSet)
registerNativeReactivity(Set, ReactiveSet)
registerNativeReactivity(Array, ReactiveArray)
