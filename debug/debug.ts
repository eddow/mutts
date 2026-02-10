/**
 * Debug utilities for the reactivity system
 * - Captures effect metadata (names, parent relationships)
 * - Records cause → consequence edges with object/prop labels
 * - Provides graph data for tooling (DevTools panel, etc.)
 */

import { effect, raiseEffectTrackers } from '../src/reactive/effects'
import { effectToReactiveObjects, getEffectNode, getRoot, markWithRoot } from '../src/reactive/registry'
import { allProps, type EffectCleanup, type EffectTrigger, type Evolution, options } from '../src/reactive/types'
import { getStackFrame, getLineage, formatLineage, wrapLineageForDebug, lineageFormatter, nodeLineage } from './lineage'
import { showLineagePanel } from './lineage-panel'

/**
 * Log an error with detailed context if error logging is enabled
 */
export function logError(error: Error, context: 'throw' | 'catch', effect?: any) {
	if (!debugOptions.logErrors) return
	
	const contextStr = context === 'throw' ? '🔴 Thrown' : '🟡 Caught'
	
	console.group(`${contextStr} Error: ${error.message}`)
	console.error('Error:', error)
	
	// Try to get effect name if available
	if (effect && typeof effect === 'object' && effect.name) {
		console.log('Effect:', effect.name)
	}
	
	console.groupEnd()
}

// Log initialization for debugging

const EXTERNAL_SOURCE = Symbol('external-source')
type SourceEffect = EffectTrigger | typeof EXTERNAL_SOURCE

let devtoolsEnabled = false

// Registry for debugging (populated lazily when DevTools are enabled)
const debugEffectRegistry = new Set<EffectTrigger>()
const debugObjectRegistry = new Set<object>()

// Human-friendly names
const effectNames = new WeakMap<EffectTrigger | EffectCleanup, string>()
const objectNames = new WeakMap<object, string>()
let effectCounter = 0
let objectCounter = 0

// Debug options system
export const debugOptions = {
	/**
	 * Whether DevTools are enabled
	 */
	get enabled() {
		return devtoolsEnabled
	},
	logErrors: false
}

// Cause/consequence edges aggregated by (source, target, descriptor)
interface TriggerRecord {
	label: string
	object: object
	prop: any
	evolution: Evolution
	count: number
	lastTriggered: number
}

const triggerGraph = new Map<SourceEffect, Map<EffectTrigger, Map<string, TriggerRecord>>>()

export type NodeKind = 'effect' | 'external' | 'state'
export type EdgeKind = 'cause' | 'dependency' | 'trigger'

export interface EffectNode {
	id: string
	label: string
	type: NodeKind
	depth: number
	parentId?: string
	debugName?: string
}

export interface ObjectNode {
	id: string
	label: string
	type: NodeKind
	debugName?: string
}

export interface GraphEdge {
	id: string
	source: string
	target: string
	type: EdgeKind
	label: string
	count?: number
}

export interface ReactivityGraph {
	nodes: Array<EffectNode | ObjectNode>
	edges: GraphEdge[]
	meta: {
		generatedAt: number
		devtoolsEnabled: boolean
	}
}

function ensureEffectName(effect: EffectTrigger | EffectCleanup): string {
	let name = effectNames.get(effect)
	if (!name) {
		const root = getRoot(effect)
		name = root?.name?.trim() || `effect_${++effectCounter}`
		effectNames.set(effect, name)
	}
	return name
}

function ensureObjectName(obj: object): string {
	let name = objectNames.get(obj)
	if (!name) {
		const ctorName = (obj as any)?.constructor?.name
		const base = ctorName && ctorName !== 'Object' ? ctorName : 'object'
		name = `${base}_${++objectCounter}`
		objectNames.set(obj, name)
	}
	return name
}

function describeProp(obj: object, prop: any): string {
	const objectName = ensureObjectName(obj)
	if (prop === allProps) return `${objectName}.*`
	if (typeof prop === 'symbol') return `${objectName}.${prop.description ?? prop.toString()}`
	return `${objectName}.${String(prop)}`
}

function addEffectToRegistry(effect: EffectTrigger) {
	if (!effect || debugEffectRegistry.has(effect)) return
	debugEffectRegistry.add(effect)
	const deps = effectToReactiveObjects.get(effect)
	if (deps) {
		for (const obj of deps) {
			documentObject(obj)
		}
	}
}

function documentObject(obj: object) {
	if (!debugObjectRegistry.has(obj)) {
		dbRegisterObject(obj)
	}
}

function dbRegisterObject(obj: object) {
	debugObjectRegistry.add(obj)
	ensureObjectName(obj)
}

function ensureParentChains(effects: Set<EffectTrigger>) {
	const queue = Array.from(effects)
	for (let i = 0; i < queue.length; i++) {
		const effect = queue[i]
		const parent = getEffectNode(effect).parent
		if (parent && !effects.has(parent)) {
			effects.add(parent)
			queue.push(parent)
		}
	}
}

function ensureTriggerContainers(source: SourceEffect) {
	let targetMap = triggerGraph.get(source)
	if (!targetMap) {
		targetMap = new Map()
		triggerGraph.set(source, targetMap)
	}
	return targetMap
}

function ensureTriggerRecord(
	source: SourceEffect,
	target: EffectTrigger,
	label: string,
	obj: object,
	prop: any,
	evolution: Evolution
): TriggerRecord {
	const targetMap = ensureTriggerContainers(source)
	let labelMap = targetMap.get(target)
	if (!labelMap) {
		labelMap = new Map()
		targetMap.set(target, labelMap)
	}
	let record = labelMap.get(label)
	if (!record) {
		record = { label, object: obj, prop, evolution, count: 0, lastTriggered: Date.now() }
		labelMap.set(label, record)
	}
	return record
}

/**
 * Assign a debug-friendly name to an effect (shown in DevTools)
 */
export function setEffectName(effect: EffectTrigger | EffectCleanup, name: string) {
	effectNames.set(effect, name)
}

/**
 * Assign a debug-friendly name to a reactive object
 */
export function setObjectName(obj: object, name: string) {
	objectNames.set(obj, name)
	debugObjectRegistry.add(obj)
}

/**
 * Register an effect so it appears in the DevTools graph
 */
export function registerEffectForDebug(effect: EffectTrigger) {
	if (!effect || !devtoolsEnabled) return
	addEffectToRegistry(effect)
}

/**
 * Register a reactive object so it appears in the DevTools graph
 */
export function registerObjectForDebug(obj: object) {
	if (!devtoolsEnabled) return
	documentObject(obj)
}

/**
 * Records a cause → consequence relationship between effects.
 * @param source - The effect performing the write (undefined if external/user input)
 * @param target - The effect that re-ran because of the write
 * @param obj - The reactive object that changed
 * @param prop - The property that changed
 * @param evolution - The type of change (set/add/del/bunch)
 */
export function recordTriggerLink(
	source: EffectTrigger | undefined,
	target: EffectTrigger,
	obj: object,
	prop: any,
	evolution: Evolution
) {
	raiseEffectTrackers(target, obj, evolution, prop)
	if (options.introspection.enableHistory) {
		addToMutationHistory(source, target, obj, prop, evolution)
	}
	if (!devtoolsEnabled) return
	addEffectToRegistry(target)
	if (source) addEffectToRegistry(source)
	const descriptor = describeProp(obj, prop)
	const record = ensureTriggerRecord(
		source ?? EXTERNAL_SOURCE,
		target,
		descriptor,
		obj,
		prop,
		evolution
	)
	record.count += 1
	record.lastTriggered = Date.now()
	documentObject(obj)
}

/**
 * Traces back the chain of triggers that led to a specific effect
 * @param effect The effect to trace back
 * @param limit Max depth
 */
export function getTriggerChain(effect: EffectTrigger, limit = 5): string[] {
	const chain: string[] = []
	let current = effect
	for (let i = 0; i < limit; i++) {
		// Find who triggered 'current'
		// We need to reverse search the triggerGraph (source -> target)
		// This is expensive O(Edges) but okay for error reporting
		let foundSource: EffectTrigger | undefined
		let foundReason = ''

		search: for (const [source, targetMap] of triggerGraph) {
			for (const [target, labelMap] of targetMap) {
				if (target === current) {
					// Found a source! Use the most recent trigger record
					let lastTime = 0
					for (const record of labelMap.values()) {
						if (record.lastTriggered > lastTime) {
							lastTime = record.lastTriggered
							foundReason = record.label
							foundSource = source === EXTERNAL_SOURCE ? undefined : (source as EffectTrigger)
						}
					}
					if (foundSource || foundReason) break search
				}
			}
		}

		if (foundSource) {
			chain.push(
				`${ensureEffectName(foundSource)} -> (${foundReason}) -> ${ensureEffectName(current)}`
			)
			current = foundSource
		} else if (foundReason) {
			chain.push(`External -> (${foundReason}) -> ${ensureEffectName(current)}`)
			break
		} else {
			break
		}
	}
	return chain.reverse()
}

function buildEffectNodes(allEffects: Set<EffectTrigger>) {
	const nodes: EffectNode[] = []
	const nodeByEffect = new Map<EffectTrigger, EffectNode>()

	const ordered = Array.from(allEffects)
	for (const effect of ordered) {
		const label = ensureEffectName(effect)
		const node: EffectNode = {
			id: `effect_${nodes.length}`,
			label,
			type: 'effect',
			depth: 0,
			debugName: label,
		}
		nodes.push(node)
		nodeByEffect.set(effect, node)
	}

	const depthCache = new Map<EffectTrigger, number>()
	const computeDepth = (effect: EffectTrigger | undefined): number => {
		if (!effect) return 0
		const cached = depthCache.get(effect)
		if (cached !== undefined) return cached
		const parent = getEffectNode(effect).parent
		const depth = computeDepth(parent) + (parent ? 1 : 0)
		depthCache.set(effect, depth)
		return depth
	}

	for (const [effect, node] of nodeByEffect) {
		node.depth = computeDepth(effect)
		const parent = getEffectNode(effect).parent
		if (parent) {
			const parentNode = nodeByEffect.get(parent)
			if (parentNode) {
				node.parentId = parentNode.id
			}
		}
	}

	return { nodes, nodeByEffect }
}

/**
 * Builds a graph representing current reactive state (effects, objects, and trigger edges)
 */
export function buildReactivityGraph(): ReactivityGraph {
	const nodes: Array<EffectNode | ObjectNode> = []
	const edges: GraphEdge[] = []
	const nodeIds = new Map<EffectTrigger | EffectCleanup | object | SourceEffect, string>()

	const allEffects = new Set<EffectTrigger>(debugEffectRegistry)
	ensureParentChains(allEffects)
	const { nodes: effectNodes, nodeByEffect } = buildEffectNodes(allEffects)
	for (const node of effectNodes) nodes.push(node)
	for (const [effect, node] of nodeByEffect) {
		nodeIds.set(effect, node.id)
	}

	// Object nodes (optional, used for dependency inspection)
	for (const obj of debugObjectRegistry) {
		const id = `object_${nodes.length}`
		nodes.push({ id, label: ensureObjectName(obj), type: 'state', debugName: objectNames.get(obj) })
		nodeIds.set(obj, id)
	}

	// External source node (user/system outside of effects)
	if (triggerGraph.has(EXTERNAL_SOURCE)) {
		const externalId = `effect_external`
		nodes.push({ id: externalId, label: 'External', type: 'external', depth: 0 })
		nodeIds.set(EXTERNAL_SOURCE, externalId)
	}

	// Dependency edges (effect → object)
	for (const effect of allEffects) {
		const effectId = nodeIds.get(effect)
		if (!effectId) continue
		const deps = effectToReactiveObjects.get(effect)
		if (!deps) continue
		for (const obj of deps) {
			const objId = nodeIds.get(obj)
			if (!objId) continue
			edges.push({
				id: `${effectId}->${objId}`,
				source: effectId,
				target: objId,
				type: 'dependency',
				label: 'depends',
			})
		}
	}

	// Cause edges (effect/object/prop → effect)
	for (const [source, targetMap] of triggerGraph) {
		for (const [targetEffect, labelMap] of targetMap) {
			const targetId = nodeIds.get(targetEffect)
			if (!targetId) continue
			const sourceId = nodeIds.get(source)
			if (!sourceId) continue
			for (const record of labelMap.values()) {
				edges.push({
					id: `${sourceId}->${targetId}:${record.label}`,
					source: sourceId,
					target: targetId,
					type: 'cause',
					label: record.count > 1 ? `${record.label} (${record.count})` : record.label,
					count: record.count,
				})
			}
		}
	}

	return {
		nodes,
		edges,
		meta: {
			generatedAt: Date.now(),
			devtoolsEnabled,
		},
	}
}

/**
 * Enables the DevTools bridge and exposes the debug API on window/global.
 * Call as early as possible in development builds.
 */
export function enableDevTools() {
	const globalScope = (
		typeof globalThis !== 'undefined'
			? globalThis
			: typeof window !== 'undefined'
				? window
				: typeof global !== 'undefined'
					? global
					: undefined
	) as any
	if (!globalScope) return
	if (devtoolsEnabled) return
	devtoolsEnabled = true

	globalScope.__MUTTS_DEVTOOLS__ = {
		getGraph: buildReactivityGraph,
		nodeLineage(tag?: string) {
			nodeLineage(getLineage())
			return '🦴 Effect Lineage Trace' + (tag ? ` (${tag})` : '')
		},
		get browserLineage() {
			return wrapLineageForDebug(getLineage())
		},
		getLineage,
		captureLineage: getStackFrame,
		formatLineage,
		showLineagePanel,
		setEffectName,
		setObjectName,
		registerEffect: registerEffectForDebug,
		registerObject: registerObjectForDebug,
		// Debug options for controlling runtime behavior
		debug: debugOptions
	}

	// @ts-ignore - devtoolsFormatters is a Chrome-specific array
	if (globalScope.devtoolsFormatters) {
		globalScope.devtoolsFormatters.push(lineageFormatter)
	} else {
		globalScope.devtoolsFormatters = [lineageFormatter]
	}
}

export function forceEnableGraphTracking() {
	devtoolsEnabled = true
}

export function isDevtoolsEnabled() {
	return devtoolsEnabled
}

// --- Introspection API ---

/**
 * Returns the raw dependency graph data structure.
 * This is useful for programmatic analysis of the reactive system.
 */
export function getDependencyGraph() {
	return {
		nodes: buildReactivityGraph().nodes,
		edges: buildReactivityGraph().edges,
	}
}

/**
 * Returns a list of effects that depend on the given object.
 */
export function getDependents(obj: object): EffectTrigger[] {
	const dependents: EffectTrigger[] = []
	// Scan the trigger graph for effects triggered by this object
	// This is O(E) where E is the number of edges, might need optimization for large graphs
	// but acceptable for introspection
	for (const [_source, targetMap] of triggerGraph) {
		for (const [targetEffect, labelMap] of targetMap) {
			for (const record of labelMap.values()) {
				if (record.object === obj) {
					dependents.push(targetEffect)
				}
			}
		}
	}
	// Also check direct dependencies (dependency graph)
	// We don't have a direct obj -> effect map without walking all effects
	// unless we use `watchers` from tracking.ts but that's internal
	return [...new Set(dependents)]
}

/**
 * Returns a list of objects that the given effect depends on.
 */
export function getDependencies(effect: EffectTrigger): object[] {
	const deps = effectToReactiveObjects.get(effect)
	return deps ? Array.from(deps) : []
}

// --- Mutation History ---

export interface MutationRecord {
	id: number
	timestamp: number
	source: string
	target: string
	objectName: string
	prop: string
	type: string
}

const mutationHistory: MutationRecord[] = []
let mutationCounter = 0

function addToMutationHistory(
	source: EffectTrigger | undefined,
	target: EffectTrigger,
	obj: object,
	prop: any,
	evolution: Evolution
) {
	const record: MutationRecord = {
		id: ++mutationCounter,
		timestamp: Date.now(),
		source: source ? ensureEffectName(source) : 'External',
		target: ensureEffectName(target),
		objectName: ensureObjectName(obj),
		prop: String(prop),
		type: evolution.type,
	}

	mutationHistory.push(record)
	if (mutationHistory.length > options.introspection.historySize) {
		mutationHistory.shift()
	}
}

/**
 * Get the recent mutation history
 */
export function getMutationHistory(): MutationRecord[] {
	return [...mutationHistory]
}

// --- Auto DevTools Initialization ---
// Automatically enable devtools in development environments

/**
 * Checks if we're in a development environment
 * Detection order:
 * 1. process.env.NODE_ENV (Node.js)
 * 2. import.meta.env.DEV (Vite)
 * 3. import.meta.env.PROD === false (Vite alternative)
 * 4. Assumes development if none of the above are set (safe default)
 */
function isDevelopmentMode(): boolean {
	// Check for explicit production flag first
	if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
		return false
	}
	
	// Check for Vite's DEV flag
	if (typeof import.meta !== 'undefined') {
		const meta = import.meta as any
		if (meta.env?.PROD === true) {
			return false
		}
		if (meta.env?.DEV === true) {
			return true
		}
	}
	
	// Check for custom global override
	if (typeof globalThis !== 'undefined' && '__MUTTS_DEV_MODE__' in globalThis) {
		return (globalThis as any).__MUTTS_DEV_MODE__ !== false
	}
	
	// Default to development (safer to enable in dev than disable in prod)
	return true
}

// Auto-enable devtools when the module loads in development
if (isDevelopmentMode() && !devtoolsEnabled) {
	enableDevTools()
	
	// Optional: Log that devtools were enabled (only in development)
	if (typeof console !== 'undefined' && console.info) {
		// Do not log these in when mode === 'test'
		console.info('🦴 Mutts DevTools enabled automatically in development mode')
	}
}
