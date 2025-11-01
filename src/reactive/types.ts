// biome-ignore-all lint/suspicious/noConfusingVoidType: Type 'void' is not assignable to type 'ScopedCallback | undefined'.
// Argument of type '() => void' is not assignable to parameter of type '(dep: DependencyFunction) => ScopedCallback | undefined'.

/**
 * Function type for dependency tracking in effects
 * Restores the active effect context for dependency tracking
 */
export type DependencyFunction = <T>(cb: () => T) => T
/**
 * Dependency access passed to user callbacks within effects/watch
 * Provides functions to track dependencies and information about the effect execution
 */
export interface DependencyAccess {
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
	tracked: DependencyFunction
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
	ascend: DependencyFunction
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
// TODO: proper async management, read when fn returns a promise and let the effect as "running",
//  either to cancel the running one or to avoid running 2 in "parallel" and debounce the second one

/**
 * Type for effect cleanup functions
 */
export type ScopedCallback = () => void

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
 * Symbol for prototype forwarding in reactive objects
 */
export const prototypeForwarding: unique symbol = Symbol('prototype-forwarding')

/**
 * Symbol representing all properties in reactive tracking
 */
export const allProps = Symbol('all-props')

// Symbol to mark functions with their root function
const rootFunction = Symbol('root-function')

/**
 * Error class for reactive system errors
 */
export class ReactiveError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ReactiveError'
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
	enter: (effect: Function) => {},
	/**
	 * Debug purpose: called when an effect is left
	 * @param effect - The effect that is left
	 */
	leave: (effect: Function) => {},
	/**
	 * Debug purpose: called when an effect is chained
	 * @param target - The effect that is being triggered
	 * @param caller - The effect that is calling the target
	 */
	chain: (targets: Function[], caller?: Function) => {},
	/**
	 * Debug purpose: called when an effect chain is started
	 * @param target - The effect that is being triggered
	 */
	beginChain: (targets: Function[]) => {},
	/**
	 * Debug purpose: called when an effect chain is ended
	 */
	endChain: () => {},
	/**
	 * Debug purpose: called when an object is touched
	 * @param obj - The object that is touched
	 * @param evolution - The type of change
	 * @param props - The properties that changed
	 * @param deps - The dependencies that changed
	 */
	touched: (obj: any, evolution: Evolution, props?: any[], deps?: Set<ScopedCallback>) => {},
	/**
	 * Debug purpose: maximum effect chain (like call stack max depth)
	 * Used to prevent infinite loops
	 * @default 100
	 */
	maxEffectChain: 100,
	/**
	 * Debug purpose: maximum effect reaction (like call stack max depth)
	 * Used to prevent infinite loops
	 * @default 'throw'
	 */
	maxEffectReaction: 'throw' as 'throw' | 'debug' | 'warn',
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
	// biome-ignore lint/suspicious/noConsole: This is the whole point here
	warn: (...args: any[]) => console.warn(...args),
}
// biome-ignore-end lint/correctness/noUnusedFunctionParameters: Interface declaration with empty defaults

export { type State, nativeReactive, rootFunction }
