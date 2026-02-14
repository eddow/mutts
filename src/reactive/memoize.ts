import { decorator } from '../decorator'
import { deepCompare, renamed } from '../utils'
import { touched1 } from './change'
import { effect, root, untracked } from './effects'
import { proxyToObject } from './types'
import { getRoot, markWithRoot, rootFunctions } from './registry'
import { dependant } from './tracking'
import { type CleanupReason, optionCall, options } from './types'

export type Memoizable = object | any[] | ((...args: any[]) => any)

type MemoCacheTree<Result> = {
	result?: Result
	cleanup?: (reason?: CleanupReason) => void
	branches?: WeakMap<Memoizable, MemoCacheTree<Result>>
}

const memoizedRegistry = new WeakMap<any, Function>()
const wrapperRegistry = new WeakMap<Function, (that: object)=> unknown>()

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
						optionCall('onMemoizationDiscrepancy', node.result, fresh, fn, localArgs, 'calculation')
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
			effect.named('memoize')(
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
							node.cleanup({ type: 'stopped' })
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
					optionCall('onMemoizationDiscrepancy', node.result, fresh, fn, localArgs, 'comparison')
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
					}
				)
				const origRoot = rootFunctions.get(original)
				if (origRoot) rootFunctions.set(wrapper, origRoot)
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
					}
				)
				const origRoot = rootFunctions.get(original)
				if (origRoot) rootFunctions.set(wrapper, origRoot)
				wrapperRegistry.set(original, wrapper)
			}
			const memoized = memoizeFunction(wrapper as any) as (...args: object[]) => unknown
			return memoized(this, ...args)
		}
	},
	default: (target: any) => {
		if (
			typeof target === 'object' &&
			target !== null &&
			!(target instanceof Date) &&
			!(target instanceof RegExp)
		) {
			// Check identity first
			const existing = memoizedRegistry.get(target)
			if (existing) return existing

			const proxy = new Proxy(target, {
				get(source, prop, receiver) {
					// 1. Walk prototype chain to find descriptor
					let current = source
					let desc: PropertyDescriptor | undefined
					while (current) {
						desc = Object.getOwnPropertyDescriptor(current, prop)
						if (desc) break
						current = Object.getPrototypeOf(current)
					}

					// 2. If getter, memoize
					if (desc?.get) {
						const originalGetter = desc.get
						// Re-use wrapper registry idea from decorator
						let wrapper = wrapperRegistry.get(originalGetter)
						if (!wrapper) {
							// wrapper must accept 'receiver' as argument to fit memoizeFunction signature
							wrapper = markWithRoot(
								renamed(
									(that: any) => {
										return originalGetter.call(that)
									},
									`${String(source?.constructor?.name ?? 'Object')}.${String(prop)}`
								),
								{
									//method: originalGetter, // Optional: tracking origin
									propertyKey: prop,
								}
							)
							const origRoot = rootFunctions.get(originalGetter)
							if (origRoot) rootFunctions.set(wrapper, origRoot)
							wrapperRegistry.set(originalGetter, wrapper)
						}
						// memoizeFunction returns a function that takes keys (receiver)
						const memoized = memoizeFunction(wrapper)
						return memoized(receiver)
					}

					// 3. Otherwise forward
					return Reflect.get(source, prop, receiver)
				},
				// Forward set to the target (source) to ensure it acts as the receiver for reactivity notifications
				set(source, prop, value, receiver) {
					// By strictly passing `source` as receiver, we ensure that if `source` is a reactive proxy,
					// it recognizes itself and triggers change notifications.
					return Reflect.set(source, prop, value, source)
				},
			})

			// Register relationship to allow unwrap() to work
			proxyToObject.set(proxy, target)
			memoizedRegistry.set(target, proxy)
			return proxy
		}
		return memoizeFunction(target as any)
	},
})
