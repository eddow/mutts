import { asyncHooks, hooks, type Restorer } from '.'

const promiseContexts = new WeakMap<Promise<any>, Set<Restorer>>()

// [HACK]: Sanitization
// If a Promise is created inside the zone, it carries the "Sticky" zone context.
// If returned to the outer scope, that context leaks. We wrap it in a new Promise
// created here (in the outer scope) to break the chain and sanitize the return value.
// See BROWSER_ASYNC_POLYFILL.md for full details.
asyncHooks.sanitizePromise = (res: any) => {
	if (res && typeof (res as any).then === 'function') {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				;(res as any).then(resolve, reject)
			}, 0)
		})
	}
	return res
}

function captureRestorers() {
	const restorers = new Set<Restorer>()
	for (const hook of hooks) {
		const restorer = hook()
		if (restorer) restorers.add(restorer)
	}
	return restorers
}

function wrap<Args extends any[], R>(
	fn: ((...args: Args) => R) | null | undefined,
	capturedRestorers?: Set<Restorer>
) {
	if (typeof fn !== 'function') return fn
	const restorers = capturedRestorers || captureRestorers()
	return function (this: any, ...args: Args) {
		const undoers: (() => void)[] = []
		for (const restore of restorers) undoers.push(restore())
		try {
			return fn.apply(this, args)
		} finally {
			if (originals.queueMicrotask) {
				// Double microtask ensures we run after the first await resumption microtask
				originals.queueMicrotask.call(globalThis, () => {
					originals.queueMicrotask.call(globalThis, () => {
						originals.queueMicrotask.call(globalThis, () => {
							for (let i = undoers.length - 1; i >= 0; i--) undoers[i]()
						})
					})
				})
			} else {
				for (let i = undoers.length - 1; i >= 0; i--) undoers[i]()
			}
		}
	}
}

const GLOBAL_ORIGINALS = Symbol.for('mutts.originals')
const GLOBAL_PROMISE = Symbol.for('mutts.OriginalPromise')

let originals: any
let OriginalPromise: any

if ((globalThis as any)[GLOBAL_ORIGINALS]) {
	originals = (globalThis as any)[GLOBAL_ORIGINALS]
	OriginalPromise = (globalThis as any)[GLOBAL_PROMISE]
} else {
	OriginalPromise = globalThis.Promise
	originals = {
		then: OriginalPromise.prototype.then,
		catch: OriginalPromise.prototype.catch,
		finally: OriginalPromise.prototype.finally,
		resolve: OriginalPromise.resolve,
		reject: OriginalPromise.reject,
		all: OriginalPromise.all,
		allSettled: (OriginalPromise as any).allSettled,
		race: OriginalPromise.race,
		any: (OriginalPromise as any).any,
		setTimeout: globalThis.setTimeout,
		setInterval: globalThis.setInterval,
		setImmediate: (globalThis as any).setImmediate,
		requestAnimationFrame: (globalThis as any).requestAnimationFrame,
		queueMicrotask: globalThis.queueMicrotask,
	}
	;(globalThis as any)[GLOBAL_ORIGINALS] = originals
	;(globalThis as any)[GLOBAL_PROMISE] = OriginalPromise
}

// Ensure modern statics are captured even if originals was cached from an older version
if (!originals.allSettled) originals.allSettled = (OriginalPromise as any).allSettled
if (!originals.any) originals.any = (OriginalPromise as any).any
if (!originals.race) originals.race = OriginalPromise.race

function patchedThen(this: any, onFulfilled: any, onRejected: any) {
	const context = promiseContexts.get(this) || captureRestorers()
	const nextPromise = originals.then.call(
		this,
		wrap(onFulfilled, context),
		wrap(onRejected, context)
	)
	if (context.size > 0) promiseContexts.set(nextPromise, context)
	return nextPromise
}

function patchedCatch(this: any, onRejected: any) {
	const context = promiseContexts.get(this) || captureRestorers()
	const nextPromise = originals.catch.call(this, wrap(onRejected, context))
	if (context.size > 0) promiseContexts.set(nextPromise, context)
	return nextPromise
}

function patchedFinally(this: any, onFinally: any) {
	const context = promiseContexts.get(this) || captureRestorers()
	const nextPromise = originals.finally.call(this, wrap(onFinally, context))
	if (context.size > 0) promiseContexts.set(nextPromise, context)
	return nextPromise
}

function PatchedPromise<T>(
	this: any,
	executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void
) {
	if (typeof executor === 'function') {
		const p = new OriginalPromise((resolve, reject) => {
			const wrappedResolve = wrap(resolve)
			const wrappedReject = wrap(reject)
			executor(wrappedResolve, wrappedReject)
		})
		const context = captureRestorers()
		promiseContexts.set(p, context) // Always set, even if empty (Sticky Root)
		return p
	}
	return new OriginalPromise(executor)
}

// Copy statics
Object.assign(PatchedPromise, OriginalPromise as any)

// Inherit prototype for instanceof checks
PatchedPromise.prototype = OriginalPromise.prototype

PatchedPromise.resolve = (<T>(value?: T | PromiseLike<T>): Promise<T> => {
	const p = originals.resolve.call(OriginalPromise, value) as Promise<T>
	const context = captureRestorers()
	// Ensure we don't overwrite if it already has context (e.g. from constructor)
	if (context.size > 0 && !promiseContexts.has(p)) promiseContexts.set(p, context)
	return p
}) as any

PatchedPromise.reject = (<T = never>(reason?: any): Promise<T> => {
	const p = originals.reject.call(OriginalPromise, reason) as Promise<T>
	const context = captureRestorers()
	if (context.size > 0) promiseContexts.set(p, context)
	return p
}) as any

PatchedPromise.all = (<T>(values: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>[]> => {
	const p = originals.all.call(OriginalPromise, values) as Promise<Awaited<T>[]>
	const context = captureRestorers()
	if (context.size > 0) promiseContexts.set(p, context)
	return p
}) as any

PatchedPromise.allSettled = (<T>(
	values: Iterable<T | PromiseLike<T>>
): Promise<PromiseSettledResult<Awaited<T>>[]> => {
	const p = (originals.allSettled as any).call(OriginalPromise, values)
	const context = captureRestorers()
	if (context.size > 0) promiseContexts.set(p, context)
	return p
}) as any

PatchedPromise.race = (<T>(values: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>> => {
	const p = originals.race.call(OriginalPromise, values) as Promise<Awaited<T>>
	const context = captureRestorers()
	if (context.size > 0) promiseContexts.set(p, context)
	return p
}) as any

PatchedPromise.any = (<T>(values: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>> => {
	const p = (originals.any as any).call(OriginalPromise, values)
	const context = captureRestorers()
	if (context.size > 0) promiseContexts.set(p, context)
	return p
}) as any

// Only apply patches if not already applied (or re-apply safely)
// Note: OriginalPromise.prototype might be shared if we used the global one.
// We must ensure we don't patch it twice if it's the SAME object.
if (OriginalPromise.prototype.then !== patchedThen) {
	OriginalPromise.prototype.then = patchedThen as any
	OriginalPromise.prototype.catch = patchedCatch as any
	OriginalPromise.prototype.finally = patchedFinally as any
}

try {
	Object.defineProperty(OriginalPromise, Symbol.species, {
		get: () => PatchedPromise,
		configurable: true,
	})
} catch (e) {}

;(globalThis as any).Promise = PatchedPromise

globalThis.setTimeout = ((callback: Function, ...args: any[]) => {
	return originals.setTimeout.call(globalThis, wrap(callback as any), ...args)
}) as any

globalThis.setInterval = ((callback: Function, ...args: any[]) => {
	return originals.setInterval.call(globalThis, wrap(callback as any), ...args)
}) as any

if (originals.setImmediate) {
	;(globalThis as any).setImmediate = ((callback: Function, ...args: any[]) => {
		return originals.setImmediate.call(globalThis, wrap(callback as any), ...args)
	}) as any
}

if (originals.requestAnimationFrame) {
	globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
		return originals.requestAnimationFrame.call(globalThis, wrap(callback))
	}
}

if (originals.queueMicrotask) {
	globalThis.queueMicrotask = (callback: VoidFunction): void => {
		originals.queueMicrotask.call(globalThis, wrap(callback))
	}
}
