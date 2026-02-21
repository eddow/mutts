import type { FunctionWrapper } from '../zone'
import { debugHooks } from './debug-hooks'

export type EffectAccessEvents = {
	triggered(event: string, ...args: any[]): void
}

/**
 * Effect access passed to user callbacks within effects/watch
 * Provides functions to track dependencies and information about the effect execution
 */
export interface EffectAccess {
	/**
	 * Tracks dependencies in the current effect context
	 * Use this for normal dependency tracking within the effect
	 * @example
	 * ```typescript
	 * effect(({ tracked }) => {
	 *   // In async context, use tracked to restore dependency tracking
	 *   await someAsyncOperation()
	 *   const value = tracked(() => state.count) // Tracks state.count in this effect
	 * })
	 * ```
	 */
	tracked: FunctionWrapper
	/**
	 * Tracks dependencies in the parent effect context
	 * Use this when child effects should track dependencies in the parent,
	 * allowing parent cleanup to manage child effects while dependencies trigger the parent
	 * @example
	 * ```typescript
	 * effect(({ ascend }) => {
	 *   const length = inputs.length
	 *   if (length > 0) {
	 *     ascend(() => {
	 *       // Dependencies here are tracked in the parent effect
	 *       inputs.forEach(item => console.log(item))
	 *     })
	 *   }
	 * })
	 * ```
	 */
	ascend: FunctionWrapper
	/**
	 * `false` on the first execution, `true` or `CleanupReason` on subsequent runs.
	 * `true` means this is a re-run but detailed reason gathering is disabled or unavailable.
	 * A `CleanupReason` describes *why* the previous run was torn down.
	 * @example
	 * ```typescript
	 * effect(({ reaction }) => {
	 *   if (!reaction) {
	 *     // First run — setup
	 *   } else if (reaction !== true && reaction.type === 'propChange') {
	 *     // Re-run due to dependency change (with details)
	 *     for (const { evolution } of reaction.triggers)
	 *       console.log(`${'prop' in evolution ? evolution.prop : evolution.method}: ${evolution.type}`)
	 *   }
	 * })
	 * ```
	 */
	reaction: boolean | CleanupReason
}
// Zone-based async context preservation is implemented in zone.ts
// It automatically preserves effect context across Promise boundaries (.then, .catch, .finally)

/**
 * Base type for effect callbacks - simple function without additional properties
 */
export type ScopedCallback = (reason?: CleanupReason) => void

export const effectMarker = {
	enter: 'effect:enter',
	leave: 'effect:leave',
}

export type PropTrigger = {
	obj: object
	evolution: Evolution
	dependency?: unknown // Stack from when dependency was created
	touch?: unknown // Stack from when touch occurred
}

/**
 * Reason for an effect cleanup/reaction
 */
export type CleanupReason =
	| { type: 'propChange'; triggers: PropTrigger[] }
	| { type: 'invalidate'; cause: CleanupReason }
	| { type: 'stopped' } // explicit stop() call
	| { type: 'gc' } // FinalizationRegistry collected the holder
	| { type: 'lineage'; parent: CleanupReason } // parent effect cleaned up (recursive)
	| { type: 'error'; error: unknown } // error handler chain (reactionCleanup called with error)
	| { type: 'multiple'; reasons: CleanupReason[] }

function formatTrigger({ obj, evolution, dependency, touch }: PropTrigger): unknown[] {
	const detail = evolution.type === 'bunch' ? evolution.method : String(evolution.prop)
	const parts: unknown[] = [`${evolution.type} ${detail} on`, obj]

	if (dependency) {
		parts.push('\n  Dependency created at:')
		parts.push(...debugHooks.formatStack(dependency))
	}

	if (touch) {
		parts.push('\n  Touched from:')
		parts.push(...debugHooks.formatStack(touch))
	}

	return parts
}

/**
 * Console-friendly description of a `CleanupReason`.
 * Returns an array of arguments to spread into `console.log` / `console.warn`,
 * mixing strings and raw object references so the console can render them as inspectable values.
 *
 * @example
 * ```typescript
 * effect(({ reaction }) => {
 *   if (reaction !== true) console.log(...formatCleanupReason(reaction))
 * })
 * ```
 */
export function formatCleanupReason(reason: CleanupReason, depth = 0): unknown[] {
	const indent = depth ? '  '.repeat(depth) : ''
	switch (reason.type) {
		case 'propChange': {
			const parts: unknown[] = [`${indent}propChange:`]
			for (let i = 0; i < reason.triggers.length; i++) {
				if (i > 0) parts.push(',')
				parts.push(...formatTrigger(reason.triggers[i]))
			}
			return parts
		}
		case 'stopped':
			return [`${indent}stopped`]
		case 'gc':
			return [`${indent}gc`]
		case 'error':
			return [`${indent}error:`, reason.error]
		case 'lineage':
			return [`${indent}lineage ←\n`, ...formatCleanupReason(reason.parent, depth + 1)]
		case 'invalidate':
			return [`${indent}invalidate ←\n`, ...formatCleanupReason(reason.cause, depth + 1)]
		case 'multiple': {
			const parts: unknown[] = []
			for (let i = 0; i < reason.reasons.length; i++) {
				if (i > 0) parts.push('\n')
				parts.push(...formatCleanupReason(reason.reasons[i], depth))
			}
			return parts
		}
	}
}

/**
 * Type for effect cleanup functions.
 */
export type EffectCleanup = ScopedCallback

/**
 * Centralized node for all effect metadata and relationships
 */
export interface EffectNode {
	// Graph relationships
	parent?: EffectTrigger
	children?: Set<EffectCleanup>

	// Lifecycle
	cleanup?: ScopedCallback
	stopped?: boolean
	/** The reason why the effect is (re-)executing */
	nextReason?: CleanupReason

	// Error handling
	forwardThrow?: CatchFunction
	catchers?: CatchFunction[]

	// Debug / Metadata
	creationStack?: unknown
	dependencyHook?: (obj: any, prop: any) => void

	// Configuration
	isOpaque?: boolean

	// Pending triggers to be batched into CleanupReason
	pendingTriggers?: PropTrigger[]
}

/**
 * Type for the `runEffect` function of an effect - argument-less function to call to trigger the effect
 */
export type EffectTrigger = ScopedCallback

/**
 * Async execution mode for effects
 * - `cancel`: Cancel previous async execution when dependencies change (default)
 * - `queue`: Queue next execution to run after current completes
 * - `ignore`: Ignore new executions while async work is running
 */
export type AsyncExecutionMode = 'cancel' | 'queue' | 'ignore'

/**
 * Options for effect creation
 */
export interface EffectOptions {
	/**
	 * How to handle async effect executions when dependencies change
	 * @default 'cancel'
	 */
	asyncMode?: AsyncExecutionMode
	/**
	 * If true, this effect is "opaque" to deep optimizations: it sees the object reference itself
	 * and must be notified when it changes, regardless of deep content similarity.
	 * Use this for effects that depend on object identity (like memoize).
	 */
	opaque?: boolean
	/**
	 * Used for debugging purpose. Provides a callback to be called every time a dependency is created.
	 */
	dependencyHook?: (obj: any, prop: any) => void
	/**
	 * Used for debugging purpose. Provides a name for the effect.
	 */
	name?: string
}

/**
 * Type for property evolution events
 */
export type PropEvolution = {
	type: 'set' | 'del' | 'add' | 'invalidate'
	prop: any
}

/**
 * Type for collection operation evolution events
 */
export type BunchEvolution = {
	type: 'bunch'
	method: string
}
export type Evolution = PropEvolution | BunchEvolution

export type State =
	| {
			evolution: Evolution
			next: State
	  }
	| {}

// Track native reactivity

/**
 * Symbol to mark class properties as non-reactive
 */
export const unreactiveProperties = Symbol('unreactive-properties')

/**
 * Symbol representing all properties in reactive tracking
 */
export const allProps = Symbol('all-props')

/**
 * Symbol for structure-only tracking (triggered on key add/delete, not value changes).
 * Used by ownKeys proxy trap — Object.keys(), for..in, Map.keys() depend on this.
 */
export const keysOf = Symbol('keys-of')

/**
 * Symbol for accessing projection information on reactive objects
 */
export const projectionInfo = Symbol('projection-info')

export const forwardThrow = Symbol('throw')

export type EffectCloser = (reason?: CleanupReason) => void
// biome-ignore lint/suspicious/noConfusingVoidType: Catch handlers commonly return void
export type CatchFunction = (error: any) => EffectCloser | undefined | void

/**
 * Context for a running projection item effect
 */
export interface ProjectionContext {
	source: any
	key?: any
	target: any
	depth: number
	parent?: ProjectionContext
}

/**
 * Structured error codes for machine-readable diagnosis
 */
export enum ReactiveErrorCode {
	CycleDetected = 'Cycle detected',
	MaxDepthExceeded = 'Max depth exceeded',
	MaxReactionExceeded = 'Max reaction exceeded',
	WriteInComputed = 'Write in computed',
	TrackingError = 'Tracking error',
	BrokenEffects = 'Broken effects',
}

export type CycleDebugInfo = {
	code: ReactiveErrorCode.CycleDetected
	cycle: string[]
	details?: string
	causalChain?: string[]
	lineage?: unknown
}

export type MaxDepthDebugInfo = {
	code: ReactiveErrorCode.MaxDepthExceeded
	effectuatedRoots: any[]
	cycle: any[] | null
	trace: string
	maxEffectChain: number
	queued: string[]
	queuedCount: number
	causalChain?: string[]
	lineage?: unknown
}

export type MaxReactionDebugInfo = {
	code: ReactiveErrorCode.MaxReactionExceeded
	count: number
	effect: string
	causalChain?: string[]
	lineage?: unknown
}

export type GenericDebugInfo = {
	code: ReactiveErrorCode
	causalChain?: string[]
	lineage?: unknown
	[key: string]: any
}

export type ReactiveDebugInfo =
	| CycleDebugInfo
	| MaxDepthDebugInfo
	| MaxReactionDebugInfo
	| GenericDebugInfo

/**
 * Error class for reactive system errors
 */
export class ReactiveError extends Error {
	constructor(
		message: string,
		public debugInfo?: ReactiveDebugInfo
	) {
		super(message)
		this.name = 'ReactiveError'
	}

	get code(): ReactiveErrorCode | undefined {
		return this.debugInfo?.code
	}

	get cause(): any {
		return (this.debugInfo as any)?.cause
	}
}

// biome-ignore-start lint/correctness/noUnusedFunctionParameters: Interface declaration with empty defaults
/**
 * Global options for the reactive system
 */
export const options = {
	/**
	 * Debug purpose: called when an effect is entered
	 * @param effect - The effect that is entered
	 */
	enter: (_effect: Function) => {},
	/**
	 * Debug purpose: called when an effect is left
	 * @param effect - The effect that is left
	 */
	leave: (_effect: Function) => {},
	/**
	 * Debug purpose: called when an effect is chained
	 * @param target - The effect that is being triggered
	 * @param caller - The effect that is calling the target
	 */
	chain: (_targets: Function[], _caller?: Function) => {},
	/**
	 * Debug purpose: called when an effect chain is started
	 * @param target - The effect that is being triggered
	 */
	beginChain: (_targets: Function[]) => {},
	/**
	 * Debug purpose: called when an effect chain is ended
	 */
	endChain: () => {},
	garbageCollected: (_fn: Function) => {},
	/**
	 * Debug purpose: called when an object is touched
	 * @param obj - The object that is touched
	 * @param evolution - The type of change
	 * @param props - The properties that changed
	 * @param deps - The dependencies that changed
	 */
	touched: (_obj: any, _evolution: Evolution, _props?: any[], _deps?: EffectTrigger[]) => {},
	/**
	 * Debug purpose: called when an effect is skipped because it's already running
	 * @param effect - The effect that is already running
	 * @param runningChain - The array of effects from the detected one to the currently running one
	 */
	skipRunningEffect: (_effect: EffectTrigger) => {},
	/**
	 * Debug purpose: maximum effect chain (like call stack max depth)
	 * Used to prevent infinite loops
	 * @default 100
	 */
	maxEffectChain: 100,
	/**
	 * Maximum number of times an effect can be triggered by the same cause in a single batch
	 * Used to detect aggressive re-computation or infinite loops
	 * @default 10
	 */
	maxTriggerPerBatch: 10,
	/**
	 * Debug purpose: maximum effect reaction (like call stack max depth)
	 * Used to prevent infinite loops
	 * @default 'throw'
	 */
	maxEffectReaction: 'throw' as 'throw' | 'debug' | 'warn',
	/**
	 * Callback called when a memoization discrepancy is detected (debug only)
	 * When defined, memoized functions will run a second time (untracked) to verify consistency.
	 * If the untracked run returns a different value than the cached one, this callback is triggered.
	 *
	 * This is the primary tool for detecting missing reactive dependencies in computed values.
	 *
	 * @param cached - The value currently in the memoization cache
	 * @param fresh - The value obtained by re-running the function untracked
	 * @param fn - The memoized function itself
	 * @param args - Arguments passed to the function
	 *
	 * @example
	 * ```typescript
	 * reactiveOptions.onMemoizationDiscrepancy = (cached, fresh, fn, args) => {
	 *   throw new Error(`Memoization discrepancy in ${fn.name}!`);
	 * };
	 * ```
	 */
	onMemoizationDiscrepancy: undefined as
		| ((
				cached: any,
				fresh: any,
				fn: Function,
				args: any[],
				cause: 'calculation' | 'comparison'
		  ) => void)
		| undefined,
	/**
	 * How to handle cycles detected in effect batches.
	 *
	 * - `'production'` (Default): High-performance mode. Disables dependency graph maintenance and
	 *   Topological Sorting in favor of a simple FIFO queue. Use this for trustworthy, acyclic UI code.
	 *   Cycle detection is heuristic (uses maxEffectChain execution counts).
	 *
	 * - `'development'`: Maintains direct dependency graph for early cycle detection during edge creation.
	 *   Catches cycles before effects execute via DFS check when adding edges. Throws immediately with
	 *   basic path information. Good balance of debugging help with moderate overhead.
	 *
	 * - `'debug'`: Full diagnostic mode with transitive closures and topological sorting.
	 *   Provides detailed cycle path reporting. Highest overhead but most informative for bug hunting.
	 *
	 * @default 'production'
	 */
	cycleHandling: 'development' as 'production' | 'development' | 'debug',
	/**
	 * Internal flag used by memoization discrepancy detector to avoid counting calls in tests
	 * @warning Do not modify this flag manually, this flag is given by the engine
	 */
	isVerificationRun: false,
	/**
	 * Maximum depth for deep watching traversal
	 * Used to prevent infinite recursion in circular references
	 * @default 100
	 */
	maxDeepWatchDepth: 100,
	/**
	 * Only react on instance members modification (not inherited properties)
	 * For instance, do not track class methods
	 * @default true
	 */
	instanceMembers: true,
	/**
	 * Ignore accessors (getters and setters) and only track direct properties
	 * @default true
	 */
	ignoreAccessors: true,
	/**
	 * Enable recursive touching when objects with the same prototype are replaced
	 * When enabled, replacing an object with another of the same prototype triggers
	 * recursive diffing instead of notifying parent effects
	 * @default true
	 */
	recursiveTouching: true,
	/**
	 * Default async execution mode for effects that return Promises
	 * - 'cancel': Cancel previous async execution when dependencies change (default, enables async zone)
	 * - 'queue': Queue next execution to run after current completes (enables async zone)
	 * - 'ignore': Ignore new executions while async work is running (enables async zone)
	 * - false: Disable async zone and async mode handling (effects run concurrently)
	 *
	 * **When truthy:** Enables async zone (Promise.prototype wrapping) for automatic context
	 * preservation in Promise callbacks. Warning: This modifies Promise.prototype globally.
	 * Only enable if no other library modifies Promise.prototype.
	 *
	 * **When false:** Async zone is disabled. Use `tracked()` manually in Promise callbacks.
	 *
	 * Can be overridden per-effect via EffectOptions
	 * @default 'cancel'
	 */
	asyncMode: 'cancel' as AsyncExecutionMode | false,
	// biome-ignore lint/suspicious/noConsole: This is the whole point here
	warn: (...args: any[]) => console.warn(...args),

	/**
	 * Introspection and debug aids. Set to `null` to disable all debug overhead in production.
	 *
	 * - `gatherReasons`: collect `PropTrigger[]` for `CleanupReason` on effect re-runs (default `true`)
	 *   - `lineages`: what lineages to capture in PropTrigger (default `'touch'`)
	 * - `logErrors`: log errors with detailed context (default `true`)
	 * - `enableHistory`: keep a history of mutations (default `true`)
	 * - `historySize`: number of mutations to keep in history (default `50`)
	 *
	 * `enableDevTools()` sets `logErrors` to `true` automatically.
	 *
	 * @example
	 * ```typescript
	 * // Production: disable all introspection
	 * reactiveOptions.introspection = null
	 * ```
	 */
	introspection: {
		gatherReasons: { lineages: 'touch' },
		logErrors: true,
		enableHistory: true,
		historySize: 50,
	} as {
		gatherReasons: { lineages: 'none' | 'touch' | 'dependency' | 'both' }
		logErrors: boolean
		enableHistory: boolean
		historySize: number
	} | null,

	/**
	 * Configuration for zone hooks - control which async APIs are hooked
	 * Each option controls whether the corresponding async API is wrapped to preserve effect context
	 * Only applies when asyncMode is enabled (truthy)
	 * @deprecated Should take all when we made sure PIXI.create, Game.create, ... are -> .root()
	 */
	zones: {
		/**
		 * Hook setTimeout to preserve effect context
		 * @default true
		 */
		setTimeout: true,
		/**
		 * Hook setInterval to preserve effect context
		 * @default true
		 */
		setInterval: true,
		/**
		 * Hook requestAnimationFrame (runs in untracked context when hooked)
		 * @default true
		 */
		requestAnimationFrame: true,
		/**
		 * Hook queueMicrotask to preserve effect context
		 * @default true
		 */
		queueMicrotask: true,
	},
}
// biome-ignore-end lint/correctness/noUnusedFunctionParameters: Interface declaration with empty defaults

type CallableOption = {
	[K in keyof typeof options]: (typeof options)[K] extends ((...args: any[]) => any) | undefined
		? K
		: never
}[keyof typeof options]

export function optionCall<K extends CallableOption>(
	name: K,
	...args: NonNullable<(typeof options)[K]> extends (...a: infer A) => unknown ? A : never
): void {
	const fn = options[name]
	if (typeof fn !== 'function') return
	try {
		;(fn as Function)(...args)
	} catch (error) {
		options.warn(`options.${name} threw`, error)
	}
}

/** Production preset: no introspection, heuristic cycle detection, minimal overhead */
export const prodPreset: Partial<typeof options> = {
	maxEffectReaction: 'throw',
	cycleHandling: 'production',
	introspection: null,
	onMemoizationDiscrepancy: undefined,
}

/** Development preset (default): introspection on, early cycle detection, warnings */
export const devPreset: Partial<typeof options> = {
	maxEffectReaction: 'warn',
	cycleHandling: 'development',
	introspection: {
		gatherReasons: { lineages: 'touch' },
		logErrors: true,
		enableHistory: true,
		historySize: 50,
	},
	onMemoizationDiscrepancy: undefined,
}

/** Debug preset: full diagnostics, throws on violations, rich lineage capture */
export const debugPreset: Partial<typeof options> = {
	maxEffectReaction: 'debug',
	cycleHandling: 'debug',
	introspection: {
		gatherReasons: { lineages: 'both' },
		logErrors: true,
		enableHistory: true,
		historySize: 200,
	},
}

// --- Proxy State (Merged from proxy-state.ts) ---

export const objectToProxy = new WeakMap<object, object>()
export const proxyToObject = new WeakMap<object, object>()

export function storeProxyRelationship(target: object, proxy: object) {
	objectToProxy.set(target, proxy)
	proxyToObject.set(proxy, target)
}

export function getExistingProxy<T extends object>(target: T): T | undefined {
	return objectToProxy.get(target) as T | undefined
}

export function trackProxyObject(proxy: object, target: object) {
	proxyToObject.set(proxy, target)
}

export function unwrap<T>(obj: T): T {
	if (!obj || typeof obj !== 'object') return obj
	return (proxyToObject.get(obj as object) as T) || obj
}

export function isReactive(obj: any): boolean {
	return proxyToObject.has(obj)
}
