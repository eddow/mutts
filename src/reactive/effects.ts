import { decorator } from '../decorator'
import { IterableWeakSet } from '../iterableWeak'
import {
	captureEffectStack,
	effectStack,
	getActiveEffect,
	withEffectContext,
	withEffectStack,
} from './effect-context'
import {
	effectChildren,
	effectParent,
	effectToReactiveObjects,
	getRoot,
	markWithRoot,
	watchers,
} from './tracking'
import {
	type DependencyAccess,
	type EffectOptions,
	type Evolution,
	options,
	ReactiveError,
	type ScopedCallback,
} from './types'
import { ensureZoneHooked } from './zone'

type EffectTracking = (obj: any, evolution: Evolution, prop: any) => void

export { captureEffectStack, withEffectStack, getActiveEffect, effectStack }
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
 * to track multiple triggers, call `trackEffect` again within the effect.
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
 *   trackEffect((obj, evolution, prop) => {
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
 * // Logs: Effect triggered by: { object: state, change: 'set', property: 'count' }
 * ```
 */
export function trackEffect(onTouch: EffectTracking) {
	const activeEffect = getActiveEffect()
	if (!activeEffect) throw new Error('Not in an effect')
	if (!effectTrackers.has(activeEffect)) effectTrackers.set(activeEffect, new Set([onTouch]))
	else effectTrackers.get(activeEffect)!.add(onTouch)
}

const effectTrackers = new WeakMap<ScopedCallback, Set<EffectTracking>>()

// Dependency graph: tracks which effects trigger which other effects
// Uses roots (Function) as keys for consistency
const effectTriggers = new WeakMap<Function, IterableWeakSet<Function>>()
const effectTriggeredBy = new WeakMap<Function, IterableWeakSet<Function>>()

// Transitive closures: track all indirect relationships
// causesClosure: for each effect, all effects that trigger it (directly or indirectly)
// consequencesClosure: for each effect, all effects that it triggers (directly or indirectly)
const causesClosure = new WeakMap<Function, IterableWeakSet<Function>>()
const consequencesClosure = new WeakMap<Function, IterableWeakSet<Function>>()

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

	// Skip self-loops - they don't create closure entries
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
 * Removes all edges involving the given effect from the dependency graph
 * Also cleans up transitive closures
 * Called when an effect is stopped/cleaned up
 * @param effect - The effect being cleaned up
 */
function cleanupEffectFromGraph(effect: ScopedCallback) {
	const root = getRoot(effect)

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

	// Clean up closures
	// Note: Full cleanup of closures is expensive, but effects are rarely cleaned up
	// For now, we just delete the closures for this effect
	causesClosure.delete(root)
	consequencesClosure.delete(root)
}

// Batch queue structure - simplified, using closures for ordering
interface BatchQueue {
	// All effects in the current batch
	all: Map<Function, ScopedCallback> // root → effect
	// Effects that have been executed in this batch
	executed: Set<Function> // root
}

// Track currently executing effects to prevent re-execution
// These are all the effects triggered under `activeEffect`
let batchQueue: BatchQueue | undefined
const batchCleanups = new Set<ScopedCallback>()

/**
 * Computes the in-degree (number of dependencies) for an effect in the current batch
 * Uses causesClosure to count all effects (directly or indirectly) that trigger this effect
 * @param root - Root function of the effect
 * @param batchEffects - Map of all effects in current batch
 * @param executed - Set of effects that have been executed
 * @returns Number of effects in batch that trigger this effect (directly or indirectly)
 */
function computeInDegreeInBatch(
	root: Function,
	batchEffects: Map<Function, ScopedCallback>,
	_executed: Set<Function>
): number {
	let inDegree = 0
	const activeEffect = getActiveEffect()
	const activeRoot = activeEffect ? getRoot(activeEffect) : null

	// Count effects in batch that trigger this effect (directly or indirectly)
	// Using causesClosure which contains all transitive causes
	const causes = causesClosure.get(root)
	if (causes) {
		for (const causeRoot of causes) {
			// Only count if it's in the batch
			// BUT: don't count the currently executing effect (active effect)
			// This handles the case where an effect is triggered during another effect's execution
			// Note: We don't check if the cause has been executed - some batches might cause
			// the same effect through different routes, and we want to allow that
			// Note: Self-loops should not appear in closures - if they do, it means an indirect cycle
			// But we still check to be safe
			if (batchEffects.has(causeRoot) && causeRoot !== activeRoot && causeRoot !== root) {
				inDegree++
			}
		}
	}

	return inDegree
}

/**
 * Checks if adding an edge would create a cycle
 * Uses causesClosure to check if callerRoot is already a cause of targetRoot
 * @param callerRoot - Root of the effect that triggers
 * @param targetRoot - Root of the effect being triggered
 * @returns true if adding this edge would create a cycle
 */
function wouldCreateCycle(callerRoot: Function, targetRoot: Function): boolean {
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
function addToBatch(effect: ScopedCallback, caller?: ScopedCallback, immediate?: boolean) {
	if (!batchQueue) return

	const root = getRoot(effect)

	// 1. Add to batch first (needed for cycle detection)
	batchQueue.all.set(root, effect)

	// 2. Add to global graph (if caller exists and not immediate) - USE ROOTS ONLY
	// When immediate is true, don't create edges - the effect is not considered as a consequence
	if (caller && !immediate) {
		const callerRoot = getRoot(caller)

		// Check for cycle BEFORE adding edge
		// We check if adding callerRoot -> root would create a cycle
		// This means checking if root already triggers callerRoot (directly or transitively)
		if (wouldCreateCycle(callerRoot, root)) {
			// Cycle detected! Handle according to options
			const cycleHandling = options.cycleHandling
			const cycleMessage = `Cycle detected: ${callerRoot.name || '<anonymous>'} → ${root.name || '<anonymous>'} (and back)`

			switch (cycleHandling) {
				case 'throw':
					// Remove from batch before throwing
					batchQueue.all.delete(root)
					throw new ReactiveError(`[reactive] ${cycleMessage}`)
				case 'warn':
					options.warn(`[reactive] ${cycleMessage}`)
					// Don't add the edge, break the cycle
					batchQueue.all.delete(root)
					return
				case 'break':
					// Silently break cycle, don't add the edge
					batchQueue.all.delete(root)
					return
			}
		}

		addGraphEdge(callerRoot, root) // Add to persistent graph using roots
	}
}

/**
 * Adds a cleanup function to be called when the current batch of effects completes
 * @param cleanup - The cleanup function to add
 */
export function addBatchCleanup(cleanup: ScopedCallback) {
	if (!batchQueue) cleanup()
	else batchCleanups.add(cleanup)
}

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
 * Executes the next effect in dependency order (using closures)
 * Finds an effect with in-degree 0 and executes it
 * @returns The return value of the executed effect, or null if batch is complete
 */
function executeNext(): any {
	// Find an effect with in-degree 0 (no dependencies in batch that haven't executed)
	let nextEffect: ScopedCallback | null = null
	let nextRoot: Function | null = null

	// First, try to find an effect with in-degree 0
	// batchQueue.all is the todo list - effects that need to be executed
	// Effects can be added multiple times through different routes, and can be re-executed
	// if triggered again after execution
	for (const [root, effect] of batchQueue.all) {
		const inDegree = computeInDegreeInBatch(root, batchQueue.all, batchQueue.executed)
		if (inDegree === 0) {
			nextEffect = effect
			nextRoot = root
			break
		}
	}

	// If no effect has in-degree 0, check if all dependencies have already executed
	// This can happen when effects are created inside other effects
	// Also exclude the currently executing effect (active effect) from blocking
	if (!nextEffect) {
		const activeEffect = getActiveEffect()
		const activeRoot = activeEffect ? getRoot(activeEffect) : null

		for (const [root, effect] of batchQueue.all) {
			const causes = causesClosure.get(root)
			if (causes) {
				let allCausesExecuted = true
				for (const causeRoot of causes) {
					// Don't count the active effect as blocking
					if (
						batchQueue.all.has(causeRoot) &&
						!batchQueue.executed.has(causeRoot) &&
						causeRoot !== activeRoot
					) {
						allCausesExecuted = false
						break
					}
				}
				if (allCausesExecuted) {
					// All dependencies have executed (or are the currently executing effect), so this effect is ready
					nextEffect = effect
					nextRoot = root
					break
				}
			} else {
				// No dependencies at all, so it's ready
				nextEffect = effect
				nextRoot = root
				break
			}
		}
	}

	if (!nextEffect) {
		// No effect with in-degree 0 - there must be a cycle
		// If all effects have dependencies, it means there's a circular dependency
		if (batchQueue.all.size > 0) {
			let cycle = getCyclePath(batchQueue)
			// If we couldn't find a cycle path using direct edges, try using closures
			// (transitive relationships) - if all effects have in-degree > 0, there must be a cycle
			if (cycle.length === 0) {
				// Try to find a cycle using consequencesClosure (transitive relationships)
				// Note: Self-loops are ignored - we only look for cycles between different effects
				for (const [root] of batchQueue.all) {
					const consequences = consequencesClosure.get(root)
					if (consequences) {
						// Check if any consequence in the batch also has root as a consequence
						for (const consequence of consequences) {
							// Skip self-loops - they are ignored
							if (consequence === root) continue
							if (batchQueue.all.has(consequence)) {
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

			const cycleHandling = options.cycleHandling
			switch (cycleHandling) {
				case 'throw':
					throw new ReactiveError(`[reactive] ${cycleMessage}`)
				case 'warn': {
					options.warn(`[reactive] ${cycleMessage}`)
					// Break the cycle by executing one effect anyway
					const firstEffect = batchQueue.all.values().next().value
					if (firstEffect) {
						const firstRoot = getRoot(firstEffect)
						batchQueue.all.delete(firstRoot)
						return firstEffect()
					}
					break
				}
				case 'break': {
					// Silently break cycle
					const firstEffect2 = batchQueue.all.values().next().value
					if (firstEffect2) {
						const firstRoot2 = getRoot(firstEffect2)
						batchQueue.all.delete(firstRoot2)
						return firstEffect2()
					}
					break
				}
			}
		}
		return null // Batch complete
	}

	// Execute the effect
	const result = nextEffect()

	// Mark as executed and remove from batch
	batchQueue.executed.add(nextRoot)
	batchQueue.all.delete(nextRoot)

	return result
}

// Track which sub-effects have been executed to prevent infinite loops
// These are all the effects triggered under `activeEffect` and all their sub-effects
export function batch(effect: ScopedCallback | ScopedCallback[], immediate?: 'immediate') {
	if (!Array.isArray(effect)) effect = [effect]
	const roots = effect.map(getRoot)

	if (batchQueue) {
		// Nested batch - add to existing
		options?.chain(roots, getRoot(getActiveEffect()))
		const caller = getActiveEffect()
		for (let i = 0; i < effect.length; i++) {
			addToBatch(effect[i], caller, immediate === 'immediate')
		}
		if (immediate) {
			// Execute immediately (before batch returns)
			for (let i = 0; i < effect.length; i++) {
				try {
					effect[i]()
				} finally {
					const root = getRoot(effect[i])
					batchQueue.all.delete(root)
					batchQueue.executed.add(root)
				}
			}
		}
		// Otherwise, effects will be picked up in next executeNext() call
	} else {
		// New batch - initialize
		options.beginChain(roots)
		batchQueue = {
			all: new Map(),
			executed: new Set(),
		}

		// Add initial effects
		const caller = getActiveEffect()
		for (let i = 0; i < effect.length; i++) {
			addToBatch(effect[i], caller, immediate === 'immediate')
		}

		if (immediate) {
			// Execute immediately (before batch returns)
			try {
				for (let i = 0; i < effect.length; i++) {
					try {
						effect[i]()
					} finally {
						const root = getRoot(effect[i])
						batchQueue.all.delete(root)
						batchQueue.executed.add(root)
					}
				}
				// After immediate execution, execute any effects that were triggered during execution
				// This is important for @atomic decorator - effects triggered inside should still run
				const runEffects: any[] = []
				const firstReturn: { value?: any } = {}
				while (batchQueue.all.size > 0) {
					if (runEffects.length > options.maxEffectChain) {
						switch (options.maxEffectReaction) {
							case 'throw':
								throw new ReactiveError('[reactive] Max effect chain reached')
							case 'debug':
								// biome-ignore lint/suspicious/noDebugger: This is the whole point here
								debugger
								break
							case 'warn':
								options.warn('[reactive] Max effect chain reached')
								break
						}
					}
					if (!batchQueue || batchQueue.all.size === 0) break
					const rv = executeNext()
					// If executeNext() returned null but batch is not empty, it means a cycle was detected
					// and an error was thrown, so we won't reach here
					if (rv !== undefined && !('value' in firstReturn)) firstReturn.value = rv
				}
				const cleanups = Array.from(batchCleanups)
				batchCleanups.clear()
				for (const cleanup of cleanups) cleanup()
				return firstReturn.value
			} finally {
				batchQueue = undefined
				options.endChain()
			}
		} else {
			// Execute in dependency order
			const runEffects: any[] = []
			const firstReturn: { value?: any } = {}
			try {
				while (batchQueue.all.size > 0) {
					if (runEffects.length > options.maxEffectChain) {
						switch (options.maxEffectReaction) {
							case 'throw':
								throw new ReactiveError('[reactive] Max effect chain reached')
							case 'debug':
								// biome-ignore lint/suspicious/noDebugger: This is the whole point here
								debugger
								break
							case 'warn':
								options.warn('[reactive] Max effect chain reached')
								break
						}
					}
					const rv = executeNext()
					// executeNext() returns null when batch is complete or cycle detected (throws error)
					// But functions can legitimately return null, so we check batchQueue.all.size instead
					if (batchQueue.all.size === 0) {
						// Batch complete
						break
					}
					// If executeNext() returned null but batch is not empty, it means a cycle was detected
					// and an error was thrown, so we won't reach here
					if (rv !== undefined && !('value' in firstReturn)) firstReturn.value = rv
					// Track executed effect root for maxEffectChain check
					// Note: executeNext() already removed it from batchQueue, so we track by count
				}
				const cleanups = Array.from(batchCleanups)
				batchCleanups.clear()
				for (const cleanup of cleanups) cleanup()
				return firstReturn.value
			} finally {
				batchQueue = undefined
				options.endChain()
			}
		}
	}
}

/**
 * Decorator that makes methods atomic - batches all effects triggered within the method
 */
export const atomic = decorator({
	method(original) {
		return function (...args: any[]) {
			return batch(
				markWithRoot(() => original.apply(this, args), original),
				'immediate'
			)
		}
	},
	default<Args extends any[], Return>(
		original: (...args: Args) => Return
	): (...args: Args) => Return {
		return function (...args: Args) {
			return batch(
				markWithRoot(() => original.apply(this, args), original),
				'immediate'
			)
		}
	},
})

/**
 * Executes a function with a specific effect context
 * @param effect - The effect to use as context
 * @param fn - The function to execute
 * @param keepParent - Whether to keep the parent effect context
 * @returns The result of the function
 */
export function withEffect<T>(effect: ScopedCallback | undefined, fn: () => T): T {
	if (getRoot(effect) === getRoot(getActiveEffect())) return fn()
	return withEffectContext(effect, fn)
}

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
export function effect(
	//biome-ignore lint/suspicious/noConfusingVoidType: We have to
	fn: (access: DependencyAccess) => ScopedCallback | undefined | void | Promise<any>,
	effectOptions?: EffectOptions
): ScopedCallback {
	// Ensure zone is hooked if asyncZone option is enabled (lazy initialization)
	ensureZoneHooked()

	// Use per-effect asyncMode or fall back to global option
	const asyncMode = effectOptions?.asyncMode ?? options.asyncMode ?? 'cancel'
	let cleanup: (() => void) | null = null
	// capture the parent effect at creation time for ascend
	const parentsForAscend = captureEffectStack()
	const tracked = markWithRoot(<T>(cb: () => T) => withEffect(runEffect, cb), fn)
	const ascend = <T>(cb: () => T) => withEffectStack(parentsForAscend, cb)
	let effectStopped = false
	let hasReacted = false
	let runningPromise: Promise<any> | null = null
	let cancelPrevious: (() => void) | null = null

	function runEffect() {
		// Clear previous dependencies
		cleanup?.()

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
		let reactionCleanup: ScopedCallback | undefined
		let result: any
		try {
			result = withEffect(runEffect, () => fn({ tracked, ascend, reaction: hasReacted }))
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
				reactionCleanup = result as undefined | ScopedCallback
			}
		} finally {
			hasReacted = true
			options.leave(fn)
		}

		// Create cleanup function for next run
		cleanup = () => {
			cleanup = null
			reactionCleanup?.()
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
	}
	// Mark the runEffect callback with the original function as its root
	markWithRoot(runEffect, fn)

	batch(runEffect, 'immediate')

	const parent = parentsForAscend[0]
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
		const callIfCollected = () => stopEffect()
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
	const subEffectCleanup = (): void => {
		children.delete(subEffectCleanup)
		if (children.size === 0) {
			effectChildren.delete(parent)
		}
		// Execute this child effect cleanup (which triggers its own mainCleanup)
		stopEffect()
	}
	children.add(subEffectCleanup)
	return subEffectCleanup
}

/**
 * Executes a function without tracking dependencies
 * @param fn - The function to execute
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

export { effectTrackers }

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
)
export function biDi<T>(received: (value: T) => void, get: () => T, set: (value: T) => void)
export function biDi<T>(
	received: (value: T) => void,
	get: (() => T) | { get: () => T; set: (value: T) => void },
	set?: (value: T) => void
) {
	if (typeof get !== 'function') {
		set = get.set
		get = get.get
	}
	const root = getRoot(received)
	effect(
		markWithRoot(() => {
			received(get())
		}, root)
	)
	return atomic((value: T) => {
		set(value)
		if (!batchQueue?.all.has(root)) {
			options.warn('Value change has not triggered an effect')
		} else {
			// Remove the effect from the batch queue so it doesn't execute
			// This prevents circular updates in bidirectional bindings
			batchQueue.all.delete(root)
		}
	})
}
