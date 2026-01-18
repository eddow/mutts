type Resolved<T> =
	T extends Promise<infer U>
		? Resolved<U>
		: T extends (...args: infer Args) => infer R
			? (...args: Args) => Resolved<R>
			: T extends object
				? {
						[k in keyof T]: k extends 'then' | 'catch' | 'finally' ? T[k] : Resolved<T[k]>
					}
				: T
type PromiseAnd<T> = Resolved<T> & Promise<Resolved<T>>
/**
 * Type that transforms promises into chainable objects
 * Allows calling methods directly on promise results without awaiting them first
 */
export type PromiseChain<T> = T extends (...args: infer Args) => infer R
	? PromiseAnd<(...args: Args) => PromiseChain<Resolved<R>>>
	: T extends object
		? PromiseAnd<{
				[k in keyof T]: k extends 'then' | 'catch' | 'finally' ? T[k] : PromiseChain<Resolved<T[k]>>
			}>
		: Promise<Resolved<T>>

const forward =
	(name: string, target: any) =>
	(...args: any[]) => {
		return target[name](...args)
	}

const alreadyChained = new WeakMap<any, PromiseChain<any>>()
const originals = new WeakMap<Promise<any>, any>()

function cache(target: any, rv: PromiseChain<any>) {
	originals.set(rv, target)
	alreadyChained.set(target, rv)
}

type ChainedFunction<T> = ((...args: any[]) => PromiseChain<T>) & {
	then: Promise<T>['then']
	catch: Promise<T>['catch']
	finally: Promise<T>['finally']
}

const promiseProxyHandler: ProxyHandler<ChainedFunction<any>> = {
	//@ts-expect-error
	[Symbol.toStringTag]: 'MutTs PromiseChain function',
	get(target, prop) {
		if (prop === Symbol.toStringTag) return 'PromiseProxy'
		if (typeof prop === 'string' && ['then', 'catch', 'finally'].includes(prop))
			return target[prop as keyof typeof target]
		return chainPromise(target.then((r) => r[prop as keyof typeof r]))
	},
}
const promiseForward = (target: any) => ({
	// biome-ignore lint/suspicious/noThenProperty: This one is the whole point
	then: forward('then', target),
	catch: forward('catch', target),
	finally: forward('finally', target),
})
const objectProxyHandler: ProxyHandler<any> = {
	//@ts-expect-error
	[Symbol.toStringTag]: 'MutTs PromiseChain object',
	get(target, prop, receiver) {
		const getter = Object.getOwnPropertyDescriptor(target, prop)?.get
		const rv = getter ? getter.call(receiver) : target[prop]
		// Allows fct.call or fct.apply to bypass the chain system
		if (typeof target === 'function') return rv
		return chainPromise(rv)
	},
	apply(target, thisArg, args) {
		return chainPromise(target.apply(thisArg, args))
	},
}
function chainObject<T extends object | Function>(given: T): PromiseChain<T> {
	const rv = new Proxy(given, objectProxyHandler) as PromiseChain<T>
	cache(given, rv)
	return rv
}

function chainable(x: any): x is object | Function {
	return x && ['function', 'object'].includes(typeof x)
}
/**
 * Transforms a promise or value into a chainable object
 * Allows calling methods directly on promise results without awaiting them first
 * @param given - The promise or value to make chainable
 * @returns A chainable version of the input
 */
export function chainPromise<T>(given: Promise<T> | T): PromiseChain<T> {
	if (!chainable(given)) return given as PromiseChain<T>
	if (alreadyChained.has(given)) return alreadyChained.get(given) as PromiseChain<T>
	if (!(given instanceof Promise)) return chainObject(given)
	// @ts-expect-error It's ok as we check if it's an object above
	given = given.then((r) => (chainable(r) ? chainObject(r) : r))
	const target = Object.assign(function (this: any, ...args: any[]) {
		return chainPromise(
			given.then((r) => {
				return this?.then
					? this.then((t: any) => (r as any).apply(t, args))
					: (r as any).apply(this, args)
			})
		)
	}, promiseForward(given)) as ChainedFunction<T>
	const chained = new Proxy(
		target,
		promiseProxyHandler as ProxyHandler<ChainedFunction<T>>
	) as PromiseChain<T>
	cache(given, chained as PromiseChain<any>)
	return chained
}
