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
	type UnwatchFunction
} from "./core"

import { ReactiveWeakMap, ReactiveMap } from "./map"
import { registerNativeReactivity } from "./core"

registerNativeReactivity(WeakMap, ReactiveWeakMap)
registerNativeReactivity(Map, ReactiveMap)
