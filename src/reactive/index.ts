export {
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
export { invalidateComputed, unreactive, watch } from './interface'

import { computedFilter, computedMap, ReactiveArray } from './array'
import { registerNativeReactivity } from './core'
import { computed } from './interface'
import { ReactiveMap, ReactiveWeakMap } from './map'
import { ReactiveSet, ReactiveWeakSet } from './set'

const extendedComputed = Object.assign(computed, {
	map: computedMap,
	filter: computedFilter,
})
export { extendedComputed as computed }

// Register native collection types to use specialized reactive wrappers
registerNativeReactivity(WeakMap, ReactiveWeakMap)
registerNativeReactivity(Map, ReactiveMap)
registerNativeReactivity(WeakSet, ReactiveWeakSet)
registerNativeReactivity(Set, ReactiveSet)
registerNativeReactivity(Array, ReactiveArray)
