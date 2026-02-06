import { decorator } from '../decorator'
import { deepCompare, renamed } from '../utils'
import { touched1 } from './change'
import { effect, root, untracked } from './effects'
import { getRoot, markWithRoot } from './registry'
import { dependant } from './tracking'
import { options, rootFunction } from './types'

export type Memoizable = object | any[] | symbol | ((...args: any[]) => any)

type MemoCacheTree<Result> = {
	result?: Result
	cleanup?: () => void
	branches?: WeakMap<Memoizable, MemoCacheTree<Result>>
}

const memoizedRegistry = new WeakMap<any, Function>()
const wrapperRegistry = new WeakMap<Function, Function>()

function getBranch<Result>(tree: MemoCacheTree<Result>, key: Memoizable): MemoCacheTree<Result> {
	tree.branches ??= new WeakMap()
	let branch = tree.branches.get(key)
	if (!branch) {
		branch = {}
		tree.branches.set(key, branch)
	}
	return branch
}

function memoizeFunction<Result, Args extends Memoizable[]>(
	fn: (...args: Args) => Result
): (...args: Args) => Result {
	const fnRoot = getRoot(fn)
	const existing = memoizedRegistry.get(fnRoot)
	if (existing) return existing as (...args: Args) => Result

	const cacheRoot: MemoCacheTree<Result> = {}
	const memoized = markWithRoot((...args: Args): Result => {
		const localArgs = args //: Args = maxArgs !== undefined ? (args.slice(0, maxArgs) as Args) : args
		if (localArgs.some((arg) => !(arg && ['object', 'symbol', 'function'].includes(typeof arg))))
			throw new Error('memoize expects non-null object arguments')

		let node: MemoCacheTree<Result> = cacheRoot
		// Note: decorators add `this` as first argument
		for (const arg of localArgs) {
			node = getBranch(node, arg)
		}

		dependant(node, 'memoize')
		if ('result' in node) {
			if (options.onMemoizationDiscrepancy) {
				const wasVerification = options.isVerificationRun
				options.isVerificationRun = true
				try {
					const fresh = untracked(() => fn(...localArgs))
					if (!deepCompare(node.result, fresh)) {
						options.onMemoizationDiscrepancy(node.result, fresh, fn, localArgs, 'calculation')
					}
				} finally {
					options.isVerificationRun = wasVerification
				}
			}
			return node.result!
		}

		// Create memoize internal effect to track dependencies and invalidate cache
		// Use untracked to prevent the effect creation from being affected by parent effects
		node.cleanup = root(() =>
			effect(
				() => {
					// Execute the function and track its dependencies
					// The function execution will automatically track dependencies on reactive objects
					node.result = fn(...localArgs)
					return () => {
						// When dependencies change, clear the cache and notify consumers
						delete node.result
						touched1(node, { type: 'invalidate', prop: localArgs }, 'memoize')
						// Lazy memoization: stop the effect so it doesn't re-run immediately.
						// It will be re-created on next access.
						if (node.cleanup) {
							node.cleanup()
							node.cleanup = undefined
						}
					}
				},
				{ opaque: true }
			)
		)

		if (options.onMemoizationDiscrepancy) {
			const wasVerification = options.isVerificationRun
			options.isVerificationRun = true
			try {
				const fresh = untracked(() => fn(...localArgs))
				if (!deepCompare(node.result, fresh)) {
					options.onMemoizationDiscrepancy(node.result, fresh, fn, localArgs, 'comparison')
				}
			} finally {
				options.isVerificationRun = wasVerification
			}
		}

		return node.result!
	}, fn)

	memoizedRegistry.set(fnRoot, memoized)
	memoizedRegistry.set(memoized, memoized)
	return memoized as (...args: Args) => Result
}

/**
 * Decorator and function wrapper for memoizing computed values based on reactive dependencies.
 *
 * When used as a decorator on getters or methods, it caches the result and automatically
 * invalidates the cache when reactive dependencies change.
 *
 * When used as a function wrapper, it memoizes based on object arguments (WeakMap-based cache).
 *
 * @example
 * ```typescript
 * class User {
 *   @memoize
 *   get fullName() {
 *     return `${this.firstName} ${this.lastName}`
 *   }
 * }
 *
 * // Or as a function wrapper
 * const expensive = memoize((obj: SomeObject) => {
 *   return heavyComputation(obj)
 * })
 * ```
 */
export const memoize = decorator({
	getter(original, target, propertyKey) {
		return function (this: any) {
			let wrapper = wrapperRegistry.get(original)
			if (!wrapper) {
				wrapper = markWithRoot(
					renamed(
						(that: object) => {
							return original.call(that)
						},
						`${String(target?.constructor?.name ?? target?.name ?? 'Object')}.${String(propertyKey)}`
					),
					{
						method: original,
						propertyKey,
						...((original as any)[rootFunction]
							? { [rootFunction]: (original as any)[rootFunction] }
							: {}),
					}
				)
				wrapperRegistry.set(original, wrapper)
			}
			const memoized = memoizeFunction(wrapper as any)
			return memoized(this)
		}
	},
	method(original, target, name) {
		return function (this: any, ...args: object[]) {
			let wrapper = wrapperRegistry.get(original)
			if (!wrapper) {
				wrapper = markWithRoot(
					renamed(
						(that: object, ...args: object[]) => {
							return original.call(that, ...args)
						},
						`${String(target?.constructor?.name ?? target?.name ?? 'Object')}.${String(name)}`
					),
					{
						method: original,
						propertyKey: name,
						...((original as any)[rootFunction]
							? { [rootFunction]: (original as any)[rootFunction] }
							: {}),
					}
				)
				wrapperRegistry.set(original, wrapper)
			}
			const memoized = memoizeFunction(wrapper as any) as (...args: object[]) => unknown
			return memoized(this, ...args)
		}
	},
	default: memoizeFunction,
})
