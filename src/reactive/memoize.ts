import { decorator } from '../decorator'
import { flavored } from '../flavored'
import { deepCompare, renamed } from '../utils'
import { touched1 } from './change'
import { effect, root, untracked } from './effects'
import { getRoot, markWithRoot, rootFunctionSymbol } from './registry'
import { dependant } from './tracking'
import { type CleanupReason, optionCall, options, proxyToObject } from './types'

export type MemoizableArgument = object | any[] | ((...args: any[]) => any)
export type Memoizable = ((...args: MemoizableArgument[]) => unknown) | Record<string, any>

type MemoCacheTree<Result> = {
	result?: Result
	cleanup?: (reason?: CleanupReason) => void
	branches?: WeakMap<MemoizableArgument, MemoCacheTree<Result>>
}

const memoizedRegistry = new WeakMap<any, Memoizable>()
const wrapperRegistry = new WeakMap<Function, (that: object) => unknown>()

function getBranch<Result>(
	tree: MemoCacheTree<Result>,
	key: MemoizableArgument
): MemoCacheTree<Result> {
	tree.branches ??= new WeakMap()
	let branch = tree.branches.get(key)
	if (!branch) {
		branch = {}
		tree.branches.set(key, branch)
	}
	return branch
}

function memoizeFunction<Result, Args extends MemoizableArgument[]>(
	fn: (...args: Args) => Result,
	opts?: {
		lenient?: boolean
	}
): (...args: Args) => Result {
	const fnRoot = getRoot(fn)
	const existing = memoizedRegistry.get(fnRoot)
	if (existing) return existing as (...args: Args) => Result

	const cacheRoot: MemoCacheTree<Result> = {}
	const memoized = markWithRoot(function memoized(...args: Args): Result {
		if (args.some((arg) => !(arg && ['object', 'symbol', 'function'].includes(typeof arg)))) {
			if (opts?.lenient) return fn.apply(this, args)
			throw new Error('memoize expects non-null object arguments')
		}

		let node: MemoCacheTree<Result> = cacheRoot
		// Note: decorators add `this` as first argument
		for (const arg of args) {
			node = getBranch(node, arg)
		}

		dependant(node, 'memoize')
		if ('result' in node) {
			if (options.onMemoizationDiscrepancy) {
				const wasVerification = options.isVerificationRun
				options.isVerificationRun = true
				try {
					const fresh = untracked(() => fn.apply(this, args))
					if (!deepCompare(node.result, fresh)) {
						optionCall('onMemoizationDiscrepancy', node.result, fresh, fn, args, 'calculation')
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
					node.result = fn.apply(this, args)
					return (reason) => {
						// When dependencies change, clear the cache and notify consumers
						delete node.result
						touched1(node, { type: 'invalidate', prop: args }, 'memoize')
						// Lazy memoization: stop the effect so it doesn't re-run immediately.
						// It will be re-created on next access.
						if (node.cleanup) {
							node.cleanup({ type: 'invalidate', cause: reason })
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
				const fresh = untracked(() => fn.apply(this, args))
				if (!deepCompare(node.result, fresh)) {
					optionCall('onMemoizationDiscrepancy', node.result, fresh, fn, args, 'comparison')
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

function memoizeObject<T extends Record<string, any>>(target: T, opts?: { lenient?: boolean }): T {
	const existing = memoizedRegistry.get(target)
	if (existing) return existing as T

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
			if (!desc) return Reflect.get(source, prop, receiver)
			// 2. If getter, memoize
			if (desc.get) {
				const originalGetter = desc.get
				let wrapper = wrapperRegistry.get(originalGetter)
				if (!wrapper) {
					wrapper = markWithRoot(
						renamed(
							(that: any) => {
								return originalGetter.call(that)
							},
							`${String(source?.constructor?.name ?? 'Object')}.${String(prop)}`
						),
						{
							propertyKey: prop,
						}
					)
					const origRoot = originalGetter[rootFunctionSymbol]
					if (origRoot) wrapper[rootFunctionSymbol] = origRoot
					wrapperRegistry.set(originalGetter, wrapper)
				}
				const memoized = memoizeFunction(wrapper, opts)
				return memoized(receiver)
			}

			// 3. Otherwise forward
			return Reflect.get(source, prop, receiver)
		},
		// Forward set to the target (source) to ensure it acts as the receiver for reactivity notifications
		set(source, prop, value, _receiver) {
			// By strictly passing `source` as receiver, we ensure that if `source` is a reactive proxy,
			// it recognizes itself and triggers change notifications.
			return Reflect.set(source, prop, value, source)
		},
	})

	proxyToObject.set(proxy, target)
	memoizedRegistry.set(target, proxy)
	return proxy
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
function makeMemoizeDecorator(memoizeOpts?: { lenient?: boolean }) {
	return decorator({
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
					const origRoot = original[rootFunctionSymbol]
					if (origRoot) wrapper[rootFunctionSymbol] = origRoot
					wrapperRegistry.set(original, wrapper)
				}
				const memoized = memoizeFunction(wrapper as any, memoizeOpts)
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
					const origRoot = original[rootFunctionSymbol]
					if (origRoot) wrapper[rootFunctionSymbol] = origRoot
					wrapperRegistry.set(original, wrapper)
				}
				const memoized = memoizeFunction(wrapper as any, memoizeOpts) as (
					...args: object[]
				) => unknown
				return memoized(this, ...args)
			}
		},
		default: <T extends Memoizable>(target: T): T =>
			typeof target === 'object'
				? (memoizeObject(target, memoizeOpts) as T)
				: (memoizeFunction(target, memoizeOpts) as T),
	})
}

export const memoize: ReturnType<typeof makeMemoizeDecorator> & {
	readonly lenient: ReturnType<typeof makeMemoizeDecorator>
} = flavored(makeMemoizeDecorator(), {
	get lenient() {
		return makeMemoizeDecorator({ lenient: true })
	},
})
