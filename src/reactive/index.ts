export {
	computed,
	effect,
	untracked,
	getState,
	isNonReactive,
	isReactive,
	options as reactiveOptions,
	Reactive,
	ReactiveError,
	reactive,
	type ScopedCallback,
	unreactive,
	unwrap,
	touched,
	watch,
	debugListeners
} from './core'

import { ReactiveArray } from './array'
import { registerNativeReactivity } from './core'
import { ReactiveMap, ReactiveWeakMap } from './map'
import { ReactiveSet, ReactiveWeakSet } from './set'

registerNativeReactivity(WeakMap, ReactiveWeakMap)
registerNativeReactivity(Map, ReactiveMap)
registerNativeReactivity(WeakSet, ReactiveWeakSet)
registerNativeReactivity(Set, ReactiveSet)
registerNativeReactivity(Array, ReactiveArray)
