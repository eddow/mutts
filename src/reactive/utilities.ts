import {
	deepWatchers,
	effectToDeepWatchedObjects,
	objectParents,
	objectsWithDeepWatchers,
} from './deep-watch'
import { withEffect } from './effects'
import { nonReactiveObjects } from './non-reactive'
import { objectToProxy, proxyToObject } from './proxy'
import { effectToReactiveObjects, watchers } from './tracking'

/**
 * Executes a function without tracking dependencies
 * @param fn - The function to execute
 * @deprecated Use `ascend` instead
 */
export function untracked<T>(fn: () => T): T {
	let rv: T
	withEffect(
		undefined,
		() => {
			rv = fn()
		} /*,
		true*/
	)
	return rv
}

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
