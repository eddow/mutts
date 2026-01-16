import { decorator } from '../decorator'
import { renamed } from '../utils'
import { touched1 } from './change'
import { effect, root } from './effects'
import { dependant, getRoot, markWithRoot } from './tracking'

export type Memoizable = object | any[] | symbol | ((...args: any[]) => any)

type MemoCacheTree<Result> = {
	result?: Result
	cleanup?: () => void
	branches?: WeakMap<Memoizable, MemoCacheTree<Result>>
}

const memoizedRegistry = new WeakMap<Function, Function>()

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
		for (const arg of localArgs) {
			node = getBranch(node, arg)
		}

		dependant(node, 'memoize')
		if ('result' in node) return node.result!

		// Create memoize internal effect to track dependencies and invalidate cache
		// Use untracked to prevent the effect creation from being affected by parent effects
		node.cleanup = root(() => effect(
			markWithRoot(() => {
				// Execute the function and track its dependencies
				// The function execution will automatically track dependencies on reactive objects
				node.result = fn(...localArgs)
				return () => {
					// When dependencies change, clear the cache and notify consumers
					delete node.result
					touched1(node, { type: 'invalidate', prop: localArgs }, 'memoize')
				}
			}, fnRoot), { opaque: true }
		))
		return node.result!
	}, fn)

	memoizedRegistry.set(fnRoot, memoized)
	memoizedRegistry.set(memoized, memoized)
	return memoized as (...args: Args) => Result
}

export const memoize = decorator({
	getter(original, propertyKey) {
		const memoized = memoizeFunction(
			markWithRoot(
				renamed(
					(that: object) => {
						return original.call(that)
					},
					`${String(this.constructor.name)}.${String(propertyKey)}`
				),
				original
			)
		)
		return function (this: any) {
			return memoized(this)
		}
	},
	method(original, name) {
		const memoized = memoizeFunction(
			markWithRoot(
				renamed(
					(that: object, ...args: object[]) => {
						return original.call(that, ...args)
					},
					`${String(this.constructor.name)}.${String(name)}`
				),
				original
			)
		) as (...args: object[]) => unknown
		return function (this: any, ...args: object[]) {
			return memoized(this, ...args)
		}
	},
	default: memoizeFunction,
})
