/**
 * Collections module for reactive native JavaScript collections
 *
 * This module registers native JavaScript collection types
 * (Array, Map, Set, WeakMap, WeakSet) to use specialized reactive wrappers.
 *
 * Import this module when you want collections to have full reactive behavior:
 *
 * ```typescript
 * import 'mutts/reactive/collections'
 *
 * // Collections still need to be wrapped with reactive()
 * const arr = reactive([1, 2, 3]) // ReactiveArray
 * const map = reactive(new Map()) // ReactiveMap
 * const set = reactive(new Set()) // ReactiveSet
 *
 * // Now collection methods trigger reactivity
 * arr.push(4) // Triggers effects
 * map.set('key', 'value') // Triggers effects
 * set.add('item') // Triggers effects
 * ```
 *
 * Without this module, collections wrapped with reactive() will only have
 * basic object reactivity - collection methods won't trigger effects.
 */

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
