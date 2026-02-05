import { decorator } from '../decorator'
import { flavorOptions, flavored } from '../flavored'
import { IterableWeakSet } from '../iterableWeak'
import { getTriggerChain, isDevtoolsEnabled, registerEffectForDebug } from './debug'
import {
	effectAggregator,
	effectHistory,
	getActiveEffect,
} from './effect-context'
import {
	effectChildren,
	effectParent,
	effectToReactiveObjects,
	getRoot,
	markWithRoot,
	watchers,
} from './registry'
import {
	type CatchFunction,
	cleanup as cleanupSymbol,
	type EffectAccess,
	type EffectCleanup,
	type EffectCloser,
	type EffectOptions,
	EffectTrigger,
	type Evolution,
	forwardThrow,
	options,
	ReactiveError,
	ReactiveErrorCode,
	// type AsyncExecutionMode,
	type ScopedCallback,
	stopped,
} from './types'

import { unwrap } from './proxy-state'

/**
 * Finds a cycle in a sequence of functions by looking for the first repetition
 */
function findCycleInChain(roots: Function[]): Function[] | null {
	const seen = new Map<Function, number>()
	for (let i = 0; i < roots.length; i++) {
		const root = roots[i]
		if (seen.has(root)) {
			return roots.slice(seen.get(root)!)
		}
		seen.set(root, i)
	}
	return null
}

/**
 * Formats a list of function roots into a readable trace
 */
function formatRoots(roots: Function[], limit = 20): string {
	const names = roots.map((r) => r.name || '<anonymous>')
	if (names.length <= limit) return names.join(' → ')
	const start = names.slice(0, 5)
	const end = names.slice(-10)
	return `${start.join(' → ')} ... (${names.length - 15} more) ... ${end.join(' → ')}`
}

type EffectTracking = (obj: any, evolution: Evolution, prop: any) => void

export interface ActivationRecord {
	effect: EffectTrigger
	obj: any
	evolution: Evolution
	prop: any
	batchId: number
}

// Nested map structure for efficient counting and batch cleanup
// batchId -> effect root -> obj -> prop -> count
let activationRegistry: Map<Function, Map<any, Map<any, number>>> | undefined

export const activationLog: Omit<ActivationRecord, 'batchId'>[] = new Array(100)

/**
 * Returns the activation log containing recent effect activations for debugging.
 * The log is a circular buffer of the last 100 activations.
 * 
 * @returns Array of activation records
 */
export function getActivationLog() {
	return activationLog
}

export function recordActivation(
	effect: EffectTrigger,
	obj: any,
	evolution: Evolution,
	prop: any
) {
	const root = getRoot(effect)

	if (!activationRegistry) return
	let effectData = activationRegistry.get(root)
	if (!effectData) {
		effectData = new Map()
		activationRegistry.set(root, effectData)
	}
	let objData = effectData.get(obj)
	if (!objData) {
		objData = new Map()
		effectData.set(obj, objData)
	}
	const count = (objData.get(prop) ?? 0) + 1
	objData.set(prop, count)

	// Keep a limited history for diagnostics
	activationLog.unshift({
		effect,
		obj,
		evolution,
		prop,
	})
	activationLog.pop()

	if (count >= options.maxTriggerPerBatch) {
		const effectName = (root as any)?.name || 'anonymous'
		const message = `Aggressive trigger detected: effect "${effectName}" triggered ${count} times in the batch by the same cause.`
		if (options.maxEffectReaction === 'throw') {
			throw new ReactiveError(message, {
				code: ReactiveErrorCode.MaxReactionExceeded,
				count,
				effect: effectName,
			})
		}
		options.warn(`[reactive] ${message}`)
	}
}

/**
 * Registers a debug callback that is called when the current effect is triggered by a dependency change
 *
 * This function is useful for debugging purposes as it pin-points exactly which reactive property
 * change triggered the effect. The callback receives information about:
 * - The object that changed
 * - The type of change (evolution)
 * - The specific property that changed
 *
 * **Note:** The tracker callback is automatically removed after being called once. If you need
 * to track multiple triggers, call `onEffectTrigger` again within the effect.
 *
 * @param onTouch - Callback function that receives (obj, evolution, prop) when the effect is triggered
 * @throws {Error} If called outside of an effect context
 *
 * @example
 * ```typescript
 * const state = reactive({ count: 0, name: 'John' })
 *
 * effect(() => {
 *   // Register a tracker to see what triggers this effect
 *   onEffectTrigger((obj, evolution, prop) => {
 *     console.log(`Effect triggered by:`, {
 *       object: obj,
 *       change: evolution.type,
 *       property: prop
 *     })
 *   })
 *
 *   // Access reactive properties
 *   console.log(state.count, state.name)
 * })
 *
 * state.count = 5
 */
export function onEffectTrigger(onTouch: EffectTracking, effect?: EffectTrigger) {
	effect ??= getActiveEffect()
	if (!effect) throw new Error('Tracking an effect trigger while not in an effect')
	if (!effectTrackers.has(effect)) effectTrackers.set(effect, [onTouch])
	else effectTrackers.get(effect).push(onTouch)
}

const effectTrackers = new WeakMap<EffectTrigger, EffectTracking[]>()

export function raiseEffectTrigger(effect: EffectTrigger, obj: any, evolution: Evolution, prop: any) {
	const trackers = effectTrackers.get(effect)
	if (trackers) {
		for (const tracker of trackers) tracker(obj, evolution, prop)
		//trackers.delete(effect)
	}
}
export function onEffectThrow(onThrow: CatchFunction, effect?: EffectTrigger) {
	effect ??= getActiveEffect()
	if (!effect) throw new Error('Tracking an effect throw while not in an effect')
	if (!effectCatchers.has(effect)) effectCatchers.set(effect, [onThrow])
	else effectCatchers.get(effect).push(onThrow)
}
const effectCatchers = new WeakMap<EffectTrigger, CatchFunction[]>()

export const opaqueEffects = new WeakSet<EffectTrigger>()

// Dependency graph: tracks which effects trigger which other effects
// Uses roots (Function) as keys for consistency
const effectTriggers = new WeakMap<Function, IterableWeakSet<Function>>()
const effectTriggeredBy = new WeakMap<Function, IterableWeakSet<Function>>()

// Transitive closures: track all indirect relationships
// causesClosure: for each effect, all effects that trigger it (directly or indirectly)
// consequencesClosure: for each effect, all effects that it triggers (directly or indirectly)
const causesClosure = new WeakMap<Function, IterableWeakSet<Function>>()
const consequencesClosure = new WeakMap<Function, IterableWeakSet<Function>>()

// Debug: Capture where an effect was created
export const effectCreationStacks = new WeakMap<Function, string>()

/**
 * Gets or creates an IterableWeakSet for a closure map
 */
function getOrCreateClosure(
	closure: WeakMap<Function, IterableWeakSet<Function>>,
	root: Function
): IterableWeakSet<Function> {
	let set = closure.get(root)
	if (!set) {
		set = new IterableWeakSet()
		closure.set(root, set)
	}
	return set
}

/**
 * Adds an edge to the dependency graph: callerRoot → targetRoot
 * Also maintains transitive closures
 * @param callerRoot - Root function of the effect that triggers
 * @param targetRoot - Root function of the effect being triggered
 */
function addGraphEdge(callerRoot: Function, targetRoot: Function) {
	if (options.cycleHandling === 'production') return
	// Skip if edge already exists
	const triggers = effectTriggers.get(callerRoot)
	if (triggers?.has(targetRoot)) {
		return // Edge already exists
	}

	// Add to forward graph: callerRoot → targetRoot
	if (!triggers) {
		const newTriggers = new IterableWeakSet<Function>()
		newTriggers.add(targetRoot)
		effectTriggers.set(callerRoot, newTriggers)
	} else {
		triggers.add(targetRoot)
	}

	// Add to reverse graph: targetRoot ← callerRoot
	let triggeredBy = effectTriggeredBy.get(targetRoot)
	if (!triggeredBy) {
		triggeredBy = new IterableWeakSet()
		effectTriggeredBy.set(targetRoot, triggeredBy)
	}
	triggeredBy.add(callerRoot)

	// Update transitive closures
	// When U→V is added, we need to propagate the relationship:
	// 1. Add U to causesClosure(V) and V to consequencesClosure(U) (direct relationship)
	// 2. For each X in causesClosure(U): add V to consequencesClosure(X) and X to causesClosure(V)
	// 3. For each Y in consequencesClosure(V): add U to causesClosure(Y) and Y to consequencesClosure(U)
	// Note: Self-loops (U→U) are not added to closures - if an effect appears in its own closure,
	// it means there's an indirect cycle that should be detected

	// Self-loops are explicitly ignored - an effect reading and writing the same property
	// (e.g., obj.prop++) should not create a dependency relationship or appear in closures
	if (callerRoot === targetRoot) {
		return
	}

	const uConsequences = getOrCreateClosure(consequencesClosure, callerRoot)
	const vCauses = getOrCreateClosure(causesClosure, targetRoot)

	// 1. Add direct relationship
	uConsequences.add(targetRoot)
	vCauses.add(callerRoot)

	// 2. For each X in causesClosure(U): X→U→V means X→V
	const uCausesSet = causesClosure.get(callerRoot)
	if (uCausesSet) {
		for (const x of uCausesSet) {
			// Skip if this would create a self-loop
			if (x === targetRoot) continue
			const xConsequences = getOrCreateClosure(consequencesClosure, x)
			xConsequences.add(targetRoot)
			vCauses.add(x)
		}
	}

	// 3. For each Y in consequencesClosure(V): U→V→Y means U→Y
	const vConsequencesSet = consequencesClosure.get(targetRoot)
	if (vConsequencesSet) {
		for (const y of vConsequencesSet) {
			// Skip if this would create a self-loop
			if (y === callerRoot) continue
			const yCauses = getOrCreateClosure(causesClosure, y)
			yCauses.add(callerRoot)
			uConsequences.add(y)
		}
	}

	// 4. Cross-product: for each X in causesClosure(U) and Y in consequencesClosure(V): X→Y
	if (uCausesSet && vConsequencesSet) {
		for (const x of uCausesSet) {
			const xConsequences = getOrCreateClosure(consequencesClosure, x)
			for (const y of vConsequencesSet) {
				// Skip if this would create a self-loop
				if (x === y) continue
				xConsequences.add(y)
				const yCauses = getOrCreateClosure(causesClosure, y)
				yCauses.add(x)
			}
		}
	}
}

/**
 * Checks if there's a path from start to end in the dependency graph, excluding a specific node
 * Uses BFS to find any path that doesn't go through the excluded node
 * @param start - Starting node
 * @param end - Target node
 * @param exclude - Node to exclude from the path
 * @returns true if a path exists without going through the excluded node
 */
function hasPathExcluding(start: Function, end: Function, exclude: Function): boolean {
	if (start === end) return true
	if (start === exclude) return false

	const visited = new Set<Function>()
	const queue: Function[] = [start]
	visited.add(start)
	visited.add(exclude) // Pre-mark excluded node as visited to skip it

	while (queue.length > 0) {
		const current = queue.shift()!
		const triggers = effectTriggers.get(current)
		if (!triggers) continue

		for (const next of triggers) {
			if (next === end) return true
			if (!visited.has(next)) {
				visited.add(next)
				queue.push(next)
			}
		}
	}

	return false
}

/**
 * Removes all edges involving the given effect from the dependency graph
 * Also cleans up transitive closures by propagating cleanup to all affected effects
 * Called when an effect is stopped/cleaned up
 * @param effect - The effect being cleaned up
 */
function cleanupEffectFromGraph(effect: EffectTrigger) {
	if (options.cycleHandling === 'production') return
	const root = getRoot(effect)

	// Get closures before removing direct edges (needed for propagation)
	const rootCauses = causesClosure.get(root)
	const rootConsequences = consequencesClosure.get(root)

	// Remove from effectTriggers (outgoing edges)
	const triggers = effectTriggers.get(root)
	if (triggers) {
		// Remove this root from all targets' effectTriggeredBy sets
		for (const targetRoot of triggers) {
			const triggeredBy = effectTriggeredBy.get(targetRoot)
			triggeredBy?.delete(root)
		}
		effectTriggers.delete(root)
	}

	// Remove from effectTriggeredBy (incoming edges)
	const triggeredBy = effectTriggeredBy.get(root)
	if (triggeredBy) {
		// Remove this root from all sources' effectTriggers sets
		for (const sourceRoot of triggeredBy) {
			const triggers = effectTriggers.get(sourceRoot)
			triggers?.delete(root)
		}
		effectTriggeredBy.delete(root)
	}

	// Propagate closure cleanup to all affected effects
	// When removing B from A → B → C:
	// - Remove B from causesClosure(C) and consequencesClosure(A)
	// - For each X in causesClosure(B): remove C from consequencesClosure(X) if B was the only path
	// - For each Y in consequencesClosure(B): remove A from causesClosure(Y) if B was the only path
	// - Remove transitive relationships that depended on B

	if (rootCauses) {
		// For each X that triggers root: remove root from X's consequences
		// Only remove root's consequences if no alternate path exists
		for (const causeRoot of rootCauses) {
			const causeConsequences = consequencesClosure.get(causeRoot)
			if (causeConsequences) {
				// Remove root itself (it's being cleaned up)
				causeConsequences.delete(root)
				// Only remove consequences of root if there's no alternate path from causeRoot to them
				if (rootConsequences) {
					for (const consequence of rootConsequences) {
						// Check if causeRoot can still reach consequence without going through root
						if (!hasPathExcluding(causeRoot, consequence, root)) {
							causeConsequences.delete(consequence)
						}
					}
				}
			}
		}
	}

	if (rootConsequences) {
		// For each Y that root triggers: remove root from Y's causes
		// Only remove root's causes if no alternate path exists
		for (const consequenceRoot of rootConsequences) {
			const consequenceCauses = causesClosure.get(consequenceRoot)
			if (consequenceCauses) {
				// Remove root itself (it's being cleaned up)
				consequenceCauses.delete(root)
				// Only remove causes of root if there's no alternate path from them to consequenceRoot
				if (rootCauses) {
					for (const cause of rootCauses) {
						// Check if cause can still reach consequenceRoot without going through root
						if (!hasPathExcluding(cause, consequenceRoot, root)) {
							consequenceCauses.delete(cause)
						}
					}
				}
			}
		}
	}

	// Cross-product cleanup: for each X in causesClosure(B) and Y in consequencesClosure(B),
	// remove X→Y if B was the only path connecting them
	if (rootCauses && rootConsequences) {
		for (const x of rootCauses) {
			const xConsequences = consequencesClosure.get(x)
			if (xConsequences) {
				for (const y of rootConsequences) {
					// Check if there's still a path from X to Y without going through root
					// Use BFS to find any path that doesn't include root
					if (!hasPathExcluding(x, y, root)) {
						xConsequences.delete(y)
						const yCauses = causesClosure.get(y)
						yCauses?.delete(x)
					}
				}
			}
		}
	}

	// Finally, delete the closures for this effect
	causesClosure.delete(root)
	consequencesClosure.delete(root)
}

// Batch queue structure - optimized with cached in-degrees
interface BatchQueue {
	// All effects in the current batch that still need to be executed (todos)
	all: Map<Function, EffectTrigger> // root → effect
	// Cached in-degrees for each effect in the batch (number of causes in batch)
	inDegrees: Map<Function, number> // root → in-degree count
}

// Track currently executing effects to prevent re-execution
// These are all the effects triggered under `activeEffect`
let batchQueue: BatchQueue | undefined
export function hasBatched(effect: EffectTrigger) {
	return batchQueue?.all.has(getRoot(effect))
}
const batchCleanups = new Set<EffectCleanup>()

/**
 * Computes and caches in-degrees for all effects in the batch
 * Called once when batch starts or when new effects are added
 */
function computeAllInDegrees(batch: BatchQueue): void {
	if (options.cycleHandling === 'production') return
	const activeEffect = getActiveEffect()
	const activeRoot = activeEffect ? getRoot(activeEffect) : null

	// Reset all in-degrees
	batch.inDegrees.clear()

	for (const [root] of batch.all) {
		let inDegree = 0
		const causes = causesClosure.get(root)
		if (causes) {
			for (const causeRoot of causes) {
				// Only count if it's in the batch and not the active/self effect
				if (batch.all.has(causeRoot) && causeRoot !== activeRoot && causeRoot !== root) {
					inDegree++
				}
			}
		}
		batch.inDegrees.set(root, inDegree)
	}
}

/**
 * Decrements in-degrees of all effects that depend on the executed effect
 * Called after an effect is executed to update the cached in-degrees
 */
function decrementInDegreesForExecuted(batch: BatchQueue, executedRoot: Function): void {
	// Get all effects that this executed effect triggers
	const consequences = consequencesClosure.get(executedRoot)
	if (!consequences) return

	for (const consequenceRoot of consequences) {
		// Only update if it's still in the batch
		if (batch.all.has(consequenceRoot)) {
			const currentDegree = batch.inDegrees.get(consequenceRoot) ?? 0
			if (currentDegree > 0) {
				batch.inDegrees.set(consequenceRoot, currentDegree - 1)
			}
		}
	}
}

/**
 * Finds a path from startRoot to endRoot in the dependency graph
 * Uses DFS to find the path through direct edges
 * @param startRoot - Starting effect root
 * @param endRoot - Target effect root
 * @param visited - Set of visited nodes (for recursion)
 * @param path - Current path being explored
 * @returns Path from startRoot to endRoot, or empty array if no path exists
 */
function findPath(
	startRoot: Function,
	endRoot: Function,
	visited: Set<Function> = new Set(),
	path: Function[] = []
): Function[] {
	if (startRoot === endRoot) {
		return [...path, endRoot]
	}

	if (visited.has(startRoot)) {
		return []
	}

	visited.add(startRoot)
	const newPath = [...path, startRoot]

	const triggers = effectTriggers.get(startRoot)
	if (triggers) {
		for (const targetRoot of triggers) {
			const result = findPath(targetRoot, endRoot, visited, newPath)
			if (result.length > 0) {
				return result
			}
		}
	}

	return []
}

/**
 * Gets the cycle path when adding an edge would create a cycle
 * @param callerRoot - Root of the effect that triggers
 * @param targetRoot - Root of the effect being triggered
 * @returns Array of effect roots forming the cycle, or empty array if no cycle
 */
function getCyclePathForEdge(callerRoot: Function, targetRoot: Function): Function[] {
	// Find path from targetRoot back to callerRoot (this is the existing path)
	// Then adding callerRoot -> targetRoot completes the cycle
	const path = findPath(targetRoot, callerRoot)
	if (path.length > 0) {
		// The cycle is: callerRoot -> targetRoot -> ... -> callerRoot
		return [callerRoot, ...path]
	}
	return []
}

/**
 * Checks if adding an edge would create a cycle
 * Uses causesClosure to check if callerRoot is already a cause of targetRoot
 * Self-loops (callerRoot === targetRoot) are explicitly ignored and return false
 *
 * **Note**: This is the primary optimization benefit of the transitive closure system.
 * It allows detecting cycles in O(1) time before they are executed.
 *
 * @param callerRoot - Root of the effect that triggers
 * @param targetRoot - Root of the effect being triggered
 * @returns true if adding this edge would create a cycle
 */
function wouldCreateCycle(callerRoot: Function, targetRoot: Function): boolean {
	// Self-loops are explicitly ignored - an effect reading and writing the same property
	// (e.g., obj.prop++) should not create a dependency relationship
	if (callerRoot === targetRoot) {
		return false
	}

	// Check if targetRoot already triggers callerRoot (directly or indirectly)
	// This would create a cycle: callerRoot -> targetRoot -> ... -> callerRoot
	// Using consequencesClosure: if targetRoot triggers callerRoot, then callerRoot is in consequencesClosure(targetRoot)
	const targetConsequences = consequencesClosure.get(targetRoot)
	if (targetConsequences?.has(callerRoot)) {
		return true // Cycle detected: targetRoot -> ... -> callerRoot, and we're adding callerRoot -> targetRoot
	}

	return false
}

/**
 * Adds an effect to the batch queue
 * @param effect - The effect to add
 * @param caller - The active effect that triggered this one (optional)
 * @param immediate - If true, don't create edges in the dependency graph
 */
function addToBatch(effect: EffectTrigger, caller?: EffectTrigger, immediate?: boolean) {
	(effect as any)[cleanupSymbol]?.()
	// If the effect was stopped during cleanup (e.g. lazy memoization), don't add it to the batch
	if ((effect as any)[stopped]) return

	if (!batchQueue) return

	const root = getRoot(effect)

	// 1. Add to batch first (needed for cycle detection)
	if (options.cycleHandling === 'production' && batchQueue.all.has(root)) {
		// If already present in flat mode, remove it so that the next set puts it at the end
		batchQueue.all.delete(root)
	}

	batchQueue.all.set(root, effect)

	// 2. Add to global graph (if caller exists and not immediate) - USE ROOTS ONLY
	// When immediate is true, don't create edges - the effect is not considered as a consequence
	if (caller && !immediate && options.cycleHandling !== 'production') {
		const callerRoot = getRoot(caller)

		// Check for cycle BEFORE adding edge
		// We check if adding callerRoot -> root would create a cycle
		// This means checking if root already triggers callerRoot (directly or transitively)
		if (wouldCreateCycle(callerRoot, root)) {
			// Cycle detected! Get the full cycle path for debugging
			const cyclePath = getCyclePathForEdge(callerRoot, root)
			const cycleMessage =
				cyclePath.length > 0
					? `Cycle detected: ${cyclePath.map((r) => r.name || r.toString()).join(' → ')}`
					: `Cycle detected: ${callerRoot.name || callerRoot.toString()} → ${root.name || root.toString()} (and back)`

			batchQueue.all.delete(root)
			const causalChain = getTriggerChain(effect)
			const creationStack = effectCreationStacks.get(root)

			throw new ReactiveError(`[reactive] ${cycleMessage}`, {
				code: ReactiveErrorCode.CycleDetected,
				cycle: cyclePath.map((r) => r.name || r.toString()),
				details: cycleMessage,
				causalChain,
				creationStack,
			})
		}

		addGraphEdge(callerRoot, root) // Add to persistent graph using roots
	}
}

/**
 * Adds a cleanup function to be called when the current batch of effects completes
 * @param cleanup - The cleanup function to add
 */
export function addBatchCleanup(cleanup: EffectCleanup) {
	if (!batchQueue) cleanup()
	else batchCleanups.add(cleanup)
}

/**
 * Semantic alias for `addBatchCleanup` - defers work to the end of the current reactive batch.
 *
 * Use this when an effect needs to perform an action that would modify state the effect depends on,
 * which would create a reactive cycle. The deferred callback runs after all effects complete.
 *
 * @param callback - The callback to defer until after the current batch completes
 *
 * @example
 * ```typescript
 * effect(() => {
 *   processData()
 *
 *   // Defer to avoid cycle (createMovement modifies state this effect reads)
 *   defer(() => {
 *     createMovement(data)
 *   })
 * })
 * ```
 */
export const defer = addBatchCleanup

/**
 * Gets a cycle path for debugging
 * Uses DFS to find cycles in the batch
 * @param batchQueue - The batch queue
 * @returns Array of effect roots forming a cycle
 */
function getCyclePath(batchQueue: BatchQueue): Function[] {
	// If all effects have in-degree > 0, there must be a cycle
	// Use DFS to find it
	const visited = new Set<Function>()
	const recursionStack = new Set<Function>()
	const path: Function[] = []

	for (const [root] of batchQueue.all) {
		if (visited.has(root)) continue
		const cycle = findCycle(root, visited, recursionStack, path, batchQueue)
		if (cycle.length > 0) {
			return cycle
		}
	}

	return []
}

function findCycle(
	root: Function,
	visited: Set<Function>,
	recursionStack: Set<Function>,
	path: Function[],
	batchQueue: BatchQueue
): Function[] {
	if (recursionStack.has(root)) {
		// Found a cycle! Return the path from the cycle start to root
		const cycleStart = path.indexOf(root)
		return path.slice(cycleStart).concat([root])
	}

	if (visited.has(root)) {
		return []
	}

	visited.add(root)
	recursionStack.add(root)
	path.push(root)

	// Follow edges to effects in the batch
	// Use direct edges (effectTriggers) for cycle detection
	const triggers = effectTriggers.get(root)
	if (triggers) {
		for (const targetRoot of triggers) {
			if (batchQueue.all.has(targetRoot)) {
				const cycle = findCycle(targetRoot, visited, recursionStack, path, batchQueue)
				if (cycle.length > 0) {
					return cycle
				}
			}
		}
	}

	path.pop()
	recursionStack.delete(root)
	return []
}

/**
 * Executes the next effect in dependency order (using cached in-degrees)
 * Finds an effect with in-degree 0 and executes it
 * @returns The return value of the executed effect, or null if batch is complete
 */
function executeNext(effectuatedRoots: Function[]): any {
	// Find an effect with in-degree 0 using cached values
	let nextEffect: EffectTrigger | null = null
	let nextRoot: Function | null = null

	if (options.cycleHandling === 'production') {
		// In flat mode, we just take the first effect in the queue (FIFO)
		const first = batchQueue!.all.entries().next().value
		if (first) {
			;[nextRoot, nextEffect] = first
		}
	} else {
		// Find an effect with in-degree 0 (no dependencies in batch that still need execution)
		// Using cached in-degrees for O(n) lookup instead of O(n²)
		for (const [root, effect] of batchQueue!.all) {
			const inDegree = batchQueue!.inDegrees.get(root) ?? 0
			if (inDegree === 0) {
				nextEffect = effect
				nextRoot = root
				break
			}
		}
	}

	if (!nextEffect) {
		// No effect with in-degree 0 - there must be a cycle
		// If all effects have dependencies, it means there's a circular dependency
		if (batchQueue!.all.size > 0) {
			let cycle = getCyclePath(batchQueue!)
			// If we couldn't find a cycle path using direct edges, try using closures
			// (transitive relationships) - if all effects have in-degree > 0, there must be a cycle
			if (cycle.length === 0) {
				// Try to find a cycle using consequencesClosure (transitive relationships)
				// Note: Self-loops are ignored - we only look for cycles between different effects
				for (const [root] of batchQueue!.all) {
					const consequences = consequencesClosure.get(root)
					if (consequences) {
						// Check if any consequence in the batch also has root as a consequence
						for (const consequence of consequences) {
							// Skip self-loops - they are ignored
							if (consequence === root) continue
							if (batchQueue!.all.has(consequence)) {
								const consequenceConsequences = consequencesClosure.get(consequence)
								if (consequenceConsequences?.has(root)) {
									// Found cycle: root -> consequence -> root
									cycle = [root, consequence, root]
									break
								}
							}
						}
						if (cycle.length > 0) break
					}
				}
			}
			const cycleMessage =
				cycle.length > 0
					? `Cycle detected: ${cycle.map((r) => r.name || '<anonymous>').join(' → ')}`
					: 'Cycle detected in effect batch - all effects have dependencies that prevent execution'

			throw new ReactiveError(`[reactive] ${cycleMessage}`, {
				code: ReactiveErrorCode.CycleDetected,
				cycle: cycle.map((r) => r.name || r.toString()),
				details: cycleMessage,
			})
		}
		return null // Batch complete
	}

	effectuatedRoots.push(getRoot(nextEffect))
	// Execute the effect
	const result = nextEffect()

	// Remove from batch and update in-degrees of dependents
	batchQueue!.all.delete(nextRoot!)
	batchQueue!.inDegrees.delete(nextRoot!)
	decrementInDegreesForExecuted(batchQueue!, nextRoot!)

	return result
}

// Track which sub-effects have been executed to prevent infinite loops
// These are all the effects triggered under `activeEffect` and all their sub-effects
export function batch(effect: EffectTrigger | EffectTrigger[], immediate?: 'immediate') {
	if (!Array.isArray(effect)) effect = [effect]
	const roots = effect.map(getRoot)

	if (batchQueue) {
		// Nested batch - add to existing
		options?.chain(roots, getRoot(getActiveEffect()))
		const caller = getActiveEffect()
		for (let i = 0; i < effect.length; i++)
			addToBatch(effect[i], caller, immediate === 'immediate')
		if (immediate) {
			const firstReturn: { value?: any } = {}
			// Execute immediately (before batch returns)
			for (let i = 0; i < effect.length; i++) {
				try {
					const rv = effect[i]()
					if (rv !== undefined && !('value' in firstReturn)) firstReturn.value = rv
				} finally {
					const root = getRoot(effect[i])
					batchQueue.all.delete(root)
				}
			}
			return firstReturn.value
		}
		// Otherwise, effects will be picked up in next executeNext() call
	} else {
		// New batch - initialize
		if (!activationRegistry) activationRegistry = new Map()
		else throw new Error('Batch already in progress')
		options.beginChain(roots)
		batchQueue = {
			all: new Map(),
			inDegrees: new Map(),
		}

		const caller = getActiveEffect()
		const effectuatedRoots: Function[] = []
		const firstReturn: { value?: any } = {}

		try {
			if (immediate) {
				// Execute initial effects in providing order
				for (let i = 0; i < effect.length; i++) {
					try {
						const rv = effect[i]()
						if (rv !== undefined && !('value' in firstReturn)) firstReturn.value = rv
					} finally {
						batchQueue.all.delete(getRoot(effect[i]))
					}
				}
			} else {
				// Add initial effects to batch and compute dependencies
				for (let i = 0; i < effect.length; i++) addToBatch(effect[i], caller, false)
				computeAllInDegrees(batchQueue)
			}

			// Processing loop for all triggered effects and cleanups
			while (batchQueue.all.size > 0 || batchCleanups.size > 0) {
				if (batchQueue.all.size > 0) {
					if (effectuatedRoots.length > options.maxEffectChain) {
						const cycle = findCycleInChain(effectuatedRoots as any)
						const trace = formatRoots(effectuatedRoots as any)
						const message = cycle
							? `Max effect chain reached (cycle detected: ${formatRoots(cycle)})`
							: `Max effect chain reached (trace: ${trace})`

						const queuedRoots = batchQueue ? Array.from(batchQueue.all.keys()) : []
						const queued = queuedRoots.map((r) => r.name || '<anonymous>')
						const debugInfo = {
							code: ReactiveErrorCode.MaxDepthExceeded,
							effectuatedRoots,
							cycle,
							trace,
							maxEffectChain: options.maxEffectChain,
							queued: queued.slice(0, 50),
							queuedCount: queued.length,
							// Try to get causation for the last effect
							causalChain:
								effectuatedRoots.length > 0
									? getTriggerChain(
											batchQueue.all.get(effectuatedRoots[effectuatedRoots.length - 1])!
										)
									: [],
						}
						switch (options.maxEffectReaction) {
							case 'throw':
								throw new ReactiveError(`[reactive] ${message}`, debugInfo)
							case 'debug':
								// biome-ignore lint/suspicious/noDebugger: This is the whole point here
								debugger
								throw new ReactiveError(`[reactive] ${message}`, debugInfo)
							case 'warn':
								options.warn(
									`[reactive] ${message} (queued: ${queued.slice(0, 10).join(', ')}${queued.length > 10 ? ', …' : ''})`
								)
								break
						}
					}
					const rv = executeNext(effectuatedRoots)
					if (rv !== undefined && !('value' in firstReturn)) firstReturn.value = rv
				} else {
					// Process cleanups. If they trigger more effects, they will be caught in the next iteration.
					const cleanups = Array.from(batchCleanups)
					batchCleanups.clear()
					for (const cleanup of cleanups) cleanup()

					// In immediate mode, we traditionally don't process recursive effects from cleanups.
					// If we want to keep that behavior: if (immediate) break
				}
			}
			return firstReturn.value
		} catch (error) {
			console.error('Effects are broken')
			throw error
		} finally {
			activationRegistry = undefined
			batchQueue = undefined
			options.endChain()
		}
	}
}

// Inject batch function to allow atomic game loops in requestAnimationFrame/setTimeout/...
// Note: Automatic batching of async callbacks (setTimeout, Promise.then, etc.) is NOT implemented.
// Rationale: (1) asyncHooks.addHook API doesn't support knowing when callbacks complete (needed for batching),
// (2) hooking all callback-creating functions adds overhead without guaranteed benefit,
// (3) incomplete coverage in Node (async_hooks misses user-land patterns).
// Solution: Use explicit @atomic decorator or manual batch() calls where optimization is needed.

/**
 * Decorator that makes methods atomic - batches all effects triggered within the method
 */
export const atomic = decorator({
	method(original) {
		return function (this: any, ...args: any[]) {
			const atomicEffect = () => original.apply(this, args)
			// Debug: helpful to have a name
			Object.defineProperty(atomicEffect, 'name', { value: `atomic(${original.name})` })
			return batch(atomicEffect as EffectTrigger, 'immediate')
		}
	},
	default<Args extends any[], Return>(
		original: (...args: Args) => Return
	): (...args: Args) => Return {
		return function (this: any, ...args: Args) {
			const atomicEffect = () => original.apply(this, args)
			// Debug: helpful to have a name
			Object.defineProperty(atomicEffect, 'name', { value: `atomic(${original.name})` })
			return batch(atomicEffect as EffectTrigger, 'immediate')
		}
	},
})

const fr = new FinalizationRegistry<() => void>((f) => f())

/**
 * @param fn - The effect function to run - provides the cleaner
 * @returns The cleanup function
 */
/**
 * Creates a reactive effect that automatically re-runs when dependencies change
 * @param fn - The effect function that provides dependencies and may return a cleanup function or Promise
 * @param options - Options for effect execution
 * @returns A cleanup function to stop the effect
 */
export const effect = flavored((
	//biome-ignore lint/suspicious/noConfusingVoidType: We have to
	fn: (access: EffectAccess) => EffectCloser | undefined | void | Promise<any>,
	effectOptions?: EffectOptions
): EffectCleanup=> {
	if (effectOptions?.name) Object.defineProperty(fn, 'name', { value: effectOptions.name })
	// Use per-effect asyncMode or fall back to global option
	const asyncMode = effectOptions?.asyncMode ?? options.asyncMode ?? 'cancel'
	if (options.introspection.enableHistory) {
		const stack = new Error().stack
		if (stack) {
			// Clean up the stack trace to remove internal frames
			const cleanStack = stack.split('\n').slice(2).join('\n')
			effectCreationStacks.set(getRoot(fn), cleanStack)
		}
	}

	const runEffect = Object.defineProperties(() => {
		// Clear previous dependencies
		if (cleanup) {
			const prevCleanup = cleanup
			cleanup = null
			untracked(() => prevCleanup())
		}

		// Handle async modes when effect is retriggered
		if (runningPromise) {
			if (asyncMode === 'cancel' && cancelPrevious) {
				// Cancel previous execution
				cancelPrevious()
				cancelPrevious = null
				runningPromise = null
			} else if (asyncMode === 'ignore') {
				// Ignore new execution while async work is running
				return
			}
			// Note: 'queue' mode not yet implemented
		}

		// The effect has been stopped after having been planned
		if (effectStopped) return

		options.enter(getRoot(fn))
		let reactionCleanup: EffectCloser | undefined
		let result: any
		let caught = 0
		thrower = (error: any) => {
			throw error
		}
		let errorToThrow: Error | undefined
		try {
			result = tracked(() => fn(access))
			options.leave(fn)
			if (
				result &&
				typeof result !== 'function' &&
				(typeof result !== 'object' || !('then' in result))
			)
				throw new ReactiveError(`[reactive] Effect returned a non-function value: ${result}`)
			// Check if result is a Promise (async effect)
			if (result && typeof result === 'object' && typeof result.then === 'function') {
				const originalPromise = result as Promise<any>

				// Create a cancellation promise that we can reject
				let cancelReject: ((reason: any) => void) | null = null
				const cancelPromise = new Promise<never>((_, reject) => {
					cancelReject = reject
				})

				const cancelError = new ReactiveError('[reactive] Effect canceled due to dependency change')

				// Race between the actual promise and cancellation
				// If canceled, the race rejects, which will propagate through any promise chain
				runningPromise = Promise.race([originalPromise, cancelPromise])

				// Store the cancellation function
				cancelPrevious = () => {
					if (cancelReject) {
						cancelReject(cancelError)
					}
				}

				// Wrap the original promise chain so cancellation propagates
				// This ensures that when we cancel, the original promise's .catch() handlers are triggered
				// We do this by rejecting the race promise, which makes the original promise chain see the rejection
				// through the zone-wrapped .then()/.catch() handlers
			} else {
				// Synchronous result - treat as cleanup function
				reactionCleanup = result as undefined | EffectCloser
			}
		} catch (error) {
			console.error('Effect caught:', error)
			errorToThrow = error
		} finally {
			access.reaction = true
		}

		// Create cleanup function for next run
		cleanup = () => {
			cleanup = null
			reactionCleanup?.()
			reactionCleanup = undefined
			effectTrackers.delete(runEffect)
			effectCatchers.delete(runEffect)
			// Remove this effect from all reactive objects it's watching
			const effectObjects = effectToReactiveObjects.get(runEffect)
			if (effectObjects) {
				for (const reactiveObj of effectObjects) {
					const objectWatchers = watchers.get(reactiveObj)
					if (objectWatchers) {
						for (const [prop, deps] of objectWatchers.entries()) {
							deps.delete(runEffect)
							if (deps.size === 0) {
								objectWatchers.delete(prop)
							}
						}
						if (objectWatchers.size === 0) {
							watchers.delete(reactiveObj)
						}
					}
				}
				effectToReactiveObjects.delete(runEffect)
			}
			// Invoke all child stops (recursive via subEffectCleanup calling its own mainCleanup)
			const children = effectChildren.get(runEffect)
			if (children) {
				for (const childCleanup of children) childCleanup()
				effectChildren.delete(runEffect)
			}
		}

		thrower = (error: any) => {
			const catches = effectCatchers.get(runEffect)
			if(catches) while (caught < catches.length) {
				reactionCleanup?.(error)
				reactionCleanup = undefined
				try {
					reactionCleanup = catches[caught](error) as EffectCloser | undefined
					return
				} catch (e) {
					caught++
				}
			}
			if(parent) parent[forwardThrow](error)
			else throw error
		}

		if(errorToThrow) thrower(errorToThrow)
	}, {
		[forwardThrow]: {
			get: ()=> thrower,
		},
		[cleanupSymbol]: {
			value: () => {
				if (cleanup) {
					try { untracked(() => cleanup()) }
					finally { cleanup = null }
				}
			},
		},
		parent: {
			get: () => parent,
		},
	}) as EffectTrigger
	let cleanup: (() => void) | null = null
	const tracked = effectHistory.present.with(runEffect, ()=> effectAggregator.zoned)
	const ascend = effectHistory.zoned
	const parent = effectHistory.present.active
	let thrower: CatchFunction | undefined
	let effectStopped = false
	let access: EffectAccess = {
		tracked,
		ascend,
		reaction: false
	}
	let runningPromise: Promise<any> | null = null
	let cancelPrevious: (() => void) | null = null
	if (effectOptions?.dependencyHook) {
		Object.defineProperty(runEffect, 'dependencyHook', {
			value: effectOptions.dependencyHook,
		})
	}
	// Mark the runEffect callback with the original function as its root
	markWithRoot(runEffect, fn)
	function augmentedRv(rv: ScopedCallback): EffectCleanup {
		return Object.defineProperties(rv, {
			[stopped]: {
				get: ()=> effectStopped,
			},
		}) as EffectCleanup
	}

	// Register strict mode if enabled
	if (effectOptions?.opaque) {
		opaqueEffects.add(runEffect)
	}

	if (isDevtoolsEnabled()) {
		registerEffectForDebug(runEffect)
	}

	batch(runEffect, 'immediate')

	// Store parent relationship for hierarchy traversal
	effectParent.set(runEffect, parent)
	// Only ROOT effects are registered for GC cleanup and zone tracking
	const isRootEffect = !parent

	const stopEffect = (): void => {
		if (effectStopped) return
		effectStopped = true
		// Cancel any running async work
		if (cancelPrevious) {
			cancelPrevious()
			cancelPrevious = null
			runningPromise = null
		}
		cleanup?.()
		// Clean up dependency graph edges
		cleanupEffectFromGraph(runEffect)
		fr.unregister(stopEffect)
	}
	if (isRootEffect) {
		const callIfCollected = augmentedRv(() => stopEffect())
		fr.register(
			callIfCollected,
			() => {
				stopEffect()
				options.garbageCollected(fn)
			},
			stopEffect
		)
		return callIfCollected
	}
	// Register this effect to be stopped when the parent effect is cleaned up
	let children = effectChildren.get(parent)
	if (!children) {
		children = new Set()
		effectChildren.set(parent, children)
	}
	const subEffectCleanup = augmentedRv(() => {
		children.delete(subEffectCleanup)
		if (children.size === 0) {
			effectChildren.delete(parent)
		}
		// Execute this child effect cleanup (which triggers its own mainCleanup)
		stopEffect()
	})
	children.add(subEffectCleanup)

	return subEffectCleanup
}

, {
	get opaque() {
		return flavorOptions(this, { opaque: true })
	},
	named(name: string) {
		return flavorOptions(this, { name })
	},
})

/**
 * Executes a function without tracking dependencies but maintains parent cleanup relationship
 * Effects created inside will still be cleaned up when the parent effect is destroyed
 * @param fn - The function to execute
 */
export function untracked<T>(fn: () => T): T {
	return effectHistory.present.root(fn)
}

/**
 * Executes a function from a virgin/root context - no parent effect, no tracking
 * Creates completely independent effects that won't be cleaned up by any parent
 * @param fn - The function to execute
 */
export function root<T>(fn: () => T): T {
	return effectHistory.root(fn)
}

/**
 * Creates a bidirectional binding between a reactive value and a non-reactive external value
 * Prevents infinite loops by automatically suppressing circular notifications
 *
 * @param received - Function called when the reactive value changes (external setter)
 * @param get - Getter for the reactive value OR an object with `{ get, set }` properties
 * @param set - Setter for the reactive value (required if `get` is a function)
 * @returns A function to manually provide updates from the external side
 *
 * @example
 * ```typescript
 * const model = reactive({ value: '' })
 * const input = { value: '' }
 *
 * // Bidirectional binding
 * const provide = biDi(
 *   (v) => input.value = v,  // external setter
 *   () => model.value,        // reactive getter
 *   (v) => model.value = v    // reactive setter
 * )
 *
 * // External notification (e.g., from input event)
 * provide('new value')  // Updates model.value, doesn't trigger circular loop
 * ```
 *
 * @example Using object syntax
 * ```typescript
 * const provide = biDi(
 *   (v) => setHTMLValue(v),
 *   { get: () => reactiveObj.value, set: (v) => reactiveObj.value = v }
 * )
 * ```
 */
export function biDi<T>(
	received: (value: T) => void,
	value: { get: () => T; set: (value: T) => void }
): (value: T) => void
export function biDi<T>(
	received: (value: T) => void,
	get: () => T,
	set: (value: T) => void
): (value: T) => void
export function biDi<T>(
	received: (value: T) => void,
	get: (() => T) | { get: () => T; set: (value: T) => void },
	set?: (value: T) => void
): (value: T) => void {
	if (typeof get !== 'function') {
		set = get.set
		get = get.get
	}
	let programmaticallySetValue: any = Symbol()
	effect(
		markWithRoot(() => {
			const newValue = get()
			if (unwrap(newValue) !== programmaticallySetValue) received(newValue)
		}, received)
	)
	return set
		? atomic((value: T) => {
				programmaticallySetValue = unwrap(value)
				set(value)
			})
		: () => {}
}
