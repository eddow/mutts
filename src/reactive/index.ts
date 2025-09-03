export {
	unreactive,
	type EffectFunction,
	effect,
	isNonReactive,
	isReactive,
	options as reactiveOptions,
	ReactiveError,
	reactive,
	unwrap,
	Reactive,
	type ScopedCallback
} from "./core"

import { ReactiveWeakMap, ReactiveMap } from "./map"
import { ReactiveWeakSet, ReactiveSet } from "./set"
import { registerNativeReactivity } from "./core"

registerNativeReactivity(WeakMap, ReactiveWeakMap)
registerNativeReactivity(Map, ReactiveMap)
registerNativeReactivity(WeakSet, ReactiveWeakSet)
registerNativeReactivity(Set, ReactiveSet)
