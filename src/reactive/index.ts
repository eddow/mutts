export {
	effect,
	getState,
	isNonReactive,
	isReactive,
	options as reactiveOptions,
	ReactiveError,
	reactive,
	type ScopedCallback,
	touched as touchedProperties,
	touched1 as touchedProperty,
	untracked,
	unwrap
} from './core'
export { computed, watch, unreactive, Reactive } from './interface'

import { ReactiveArray } from './array'
import { registerNativeReactivity } from './core'
import { ReactiveMap, ReactiveWeakMap } from './map'
import { ReactiveSet, ReactiveWeakSet } from './set'

registerNativeReactivity(WeakMap, ReactiveWeakMap)
registerNativeReactivity(Map, ReactiveMap)
registerNativeReactivity(WeakSet, ReactiveWeakSet)
registerNativeReactivity(Set, ReactiveSet)
registerNativeReactivity(Array, ReactiveArray)
