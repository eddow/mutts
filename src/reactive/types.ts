// biome-ignore-all lint/suspicious/noConfusingVoidType: Type 'void' is not assignable to type 'ScopedCallback | undefined'.
// Argument of type '() => void' is not assignable to parameter of type '(dep: DependencyFunction) => ScopedCallback | undefined'.

import { FunctionWrapper } from "../zone"

/**
 * Dependency access passed to user callbacks within effects/watch
 * Provides functions to track dependencies and information about the effect execution
 */
export interface DependencyAccess {
	// TODO: remove tracked (async is managed)
	// TODO: remove ascend (make a global like `untracked` who  withEffect(parentEffect, () => {}))
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
	 * Indicates whether the effect is running as a reaction (i.e. not the first call)
	 * - `false`: First execution when the effect is created
	 * - `true`: Subsequent executions triggered by dependency changes
	 * @example
	 * ```typescript
	 * effect(({ reaction }) => {
	 *   if (!reaction) {
	 *     console.log('Effect initialized')
	 *     // Setup code that should only run once
	 *   } else {
	 *     console.log('Effect re-ran due to dependency change')
	 *     // Code that runs on every update
	 *   }
	 * })
	 * ```
	 */
	reaction: boolean
}
// Zone-based async context preservation is implemented in zone.ts
// It automatically preserves effect context across Promise boundaries (.then, .catch, .finally)

/**
 * Type for effect cleanup functions
 */
export type ScopedCallback = () => void

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

type State =
	| {
			evolution: Evolution
			next: State
	  }
	| {}

// Track native reactivity
const nativeReactive = Symbol('native-reactive')

/**
 * Symbol to mark individual objects as non-reactive
 */
export const nonReactiveMark = Symbol('non-reactive')
/**
 * Symbol to mark class properties as non-reactive
 */
export const unreactiveProperties = Symbol('unreactive-properties')

/**
 * Symbol representing all properties in reactive tracking
 */
export const allProps = Symbol('all-props')

/**
 * Symbol for accessing projection information on reactive objects
 */
export const projectionInfo = Symbol('projection-info')

/**
 * Symbol to check if an effect is stopped
 */
export const stopped = Symbol('stopped')

/**
 * Symbol to access effect cleanup function
 */
export const cleanup = Symbol('cleanup')

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

// Symbol to mark functions with their root function
const rootFunction = Symbol('root-function')

/**
 * Structured error codes for machine-readable diagnosis
 */
export enum ReactiveErrorCode {
	CycleDetected = 'CYCLE_DETECTED',
	MaxDepthExceeded = 'MAX_DEPTH_EXCEEDED',
	MaxReactionExceeded = 'MAX_REACTION_EXCEEDED',
	WriteInComputed = 'WRITE_IN_COMPUTED',
	TrackingError = 'TRACKING_ERROR',
	BrokenEffects = 'BROKEN_EFFECTS',
}

export type CycleDebugInfo = {
	code: ReactiveErrorCode.CycleDetected
	cycle: string[]
	details?: string
}

export type MaxDepthDebugInfo = {
	code: ReactiveErrorCode.MaxDepthExceeded
	depth: number
	chain: string[]
}

export type MaxReactionDebugInfo = {
	code: ReactiveErrorCode.MaxReactionExceeded
	count: number
	effect: string
}

export type BrokenEffectsDebugInfo = {
	code: ReactiveErrorCode.BrokenEffects
	cause: any
}

export type GenericDebugInfo = {
	code: ReactiveErrorCode
	causalChain?: string[]
	creationStack?: string
	[key: string]: any
}

export type ReactiveDebugInfo =
	| CycleDebugInfo
	| MaxDepthDebugInfo
	| MaxReactionDebugInfo
	| BrokenEffectsDebugInfo
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
	touched: (_obj: any, _evolution: Evolution, _props?: any[], _deps?: Set<ScopedCallback>) => {},
	/**
	 * Debug purpose: called when an effect is skipped because it's already running
	 * @param effect - The effect that is already running
	 * @param runningChain - The array of effects from the detected one to the currently running one
	 */
	skipRunningEffect: (_effect: ScopedCallback) => {},
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
	 * - `'none'` (Default): High-performance mode. Disables dependency graph maintenance and
	 *   Topological Sorting in favor of a simple FIFO queue. Use this for trustworthy, acyclic UI code.
	 *   Cycle detection is heuristic (uses execution counts).
	 *
	 * - `'throw'`: Traditional Topological Sorting. Guarantees dependency order and catches
	 *   circular dependencies mathematically before execution.
	 *
	 * - `'warn'`: Topological sorting, but logs a warning instead of throwing on cycles.
	 * - `'break'`: Topological sorting, but silently breaks cycles.
	 * - `'strict'`: Prevents cycle creation by checking the graph *during* dependency discovery.
	 *
	 * @default 'none'
	 */
	cycleHandling: 'none' as 'none' | 'throw' | 'warn' | 'break' | 'strict',
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
	 * Configuration for the introspection system
	 */
	introspection: {
		/**
		 * Whether to keep a history of mutations for debugging
		 * @default false
		 */
		enableHistory: false,
		/**
		 * Number of mutations to keep in history
		 * @default 50
		 */
		historySize: 50,
	},

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

export { type State, nativeReactive, rootFunction }
