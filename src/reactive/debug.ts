/**
 * Debug utilities for the reactivity system
 * - Captures effect metadata (names, parent relationships)
 * - Records cause → consequence edges with object/prop labels
 * - Provides graph data for tooling (DevTools panel, etc.)
 */

import { effectParent, effectToReactiveObjects, getRoot } from './tracking'
import { allProps, type Evolution, type ScopedCallback } from './types'

const EXTERNAL_SOURCE = Symbol('external-source')
type SourceEffect = ScopedCallback | typeof EXTERNAL_SOURCE

let devtoolsEnabled = false

// Registry for debugging (populated lazily when DevTools are enabled)
const debugEffectRegistry = new Set<ScopedCallback>()
const debugObjectRegistry = new Set<object>()

// Human-friendly names
const effectNames = new WeakMap<ScopedCallback, string>()
const objectNames = new WeakMap<object, string>()
let effectCounter = 0
let objectCounter = 0

// Cause/consequence edges aggregated by (source, target, descriptor)
interface TriggerRecord {
	label: string
	object: object
	prop: any
	evolution: Evolution
	count: number
	lastTriggered: number
}

const triggerGraph = new Map<SourceEffect, Map<ScopedCallback, Map<string, TriggerRecord>>>()

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

function ensureEffectName(effect: ScopedCallback): string {
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

function addEffectToRegistry(effect: ScopedCallback) {
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

function ensureParentChains(effects: Set<ScopedCallback>) {
	const queue = Array.from(effects)
	for (let i = 0; i < queue.length; i++) {
		const effect = queue[i]
		const parent = effectParent.get(effect)
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
	target: ScopedCallback,
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
export function setEffectName(effect: ScopedCallback, name: string) {
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
export function registerEffectForDebug(effect: ScopedCallback) {
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
	source: ScopedCallback | undefined,
	target: ScopedCallback,
	obj: object,
	prop: any,
	evolution: Evolution
) {
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

function buildEffectNodes(allEffects: Set<ScopedCallback>) {
	const nodes: EffectNode[] = []
	const nodeByEffect = new Map<ScopedCallback, EffectNode>()

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

	const depthCache = new Map<ScopedCallback, number>()
	const computeDepth = (effect: ScopedCallback | undefined): number => {
		if (!effect) return 0
		const cached = depthCache.get(effect)
		if (cached !== undefined) return cached
		const parent = effectParent.get(effect)
		const depth = computeDepth(parent) + (parent ? 1 : 0)
		depthCache.set(effect, depth)
		return depth
	}

	for (const [effect, node] of nodeByEffect) {
		node.depth = computeDepth(effect)
		const parent = effectParent.get(effect)
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
	const nodeIds = new Map<ScopedCallback | object | SourceEffect, string>()

	const allEffects = new Set<ScopedCallback>(debugEffectRegistry)
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
 * Enables the DevTools bridge and exposes the debug API on window.
 * Call as early as possible in development builds.
 */
export function enableDevTools() {
	if (typeof window === 'undefined') return
	if (devtoolsEnabled) return
	devtoolsEnabled = true

	// @ts-ignore - global window extension
	window.__MUTTS_DEVTOOLS__ = {
		getGraph: buildReactivityGraph,
		setEffectName,
		setObjectName,
		registerEffect: registerEffectForDebug,
		registerObject: registerObjectForDebug,
	}
}

export function isDevtoolsEnabled() {
	return devtoolsEnabled
}
