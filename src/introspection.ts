/**
 * Introspection API for Mutts
 * Designed for AI agents and advanced debugging tools to programmatically analyze the reactive system.
 */

import {
	getDependencyGraph,
	getDependents,
	getDependencies,
	getMutationHistory,
	forceEnableGraphTracking,
	type MutationRecord,
	type ReactivityGraph,
	type EffectNode,
	type ObjectNode,
	type GraphEdge,
} from './reactive/debug'
import { options, type ReactiveDebugInfo, ReactiveErrorCode } from './reactive/types'

export {
	getDependencyGraph,
	getDependents,
	getDependencies,
	getMutationHistory,
	options,
	ReactiveErrorCode,
}

export type { MutationRecord, ReactivityGraph, EffectNode, ObjectNode, GraphEdge, ReactiveDebugInfo }

/**
 * Enable introspection features (history recording, etc.)
 * @param config Configuration options
 */
export function enableIntrospection(config: { historySize?: number } = {}) {
	options.introspection.enableHistory = true
	forceEnableGraphTracking()
	if (config.historySize) {
		options.introspection.historySize = config.historySize
	}
}

/**
 * Capture a complete snapshot of the current reactive state
 */
export function snapshot() {
	return {
		graph: getDependencyGraph(),
		history: getMutationHistory(),
		timestamp: Date.now(),
	}
}
