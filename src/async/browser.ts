import { onReactiveBroken, onReactiveReset } from '../reactive/effects'
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
			/* cf BROWSER_ASYNC_POLYFILL.md
			// Note: my fear about this code: in between 2~3~4 microtask waits, some other microtasks might have started, stopped, ...
			// We might be in the middle of another promise hook trying to setup the zone
			// TODO We might wish to have a flag :asyncZone.acquired - like a semaphore - that we falsify here and set back when we setup the zone
			// - but this might perhaps be an overkill creating more problems than it solves
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
			}*/
		}
	}
}

const GLOBAL_ORIGINALS = Symbol.for('mutts.originals')
const GLOBAL_PROMISE = Symbol.for('mutts.OriginalPromise')

type SchedulerGlobal = typeof globalThis & {
	setImmediate?: typeof setImmediate
	clearImmediate?: typeof clearImmediate
	requestAnimationFrame?: typeof requestAnimationFrame
	cancelAnimationFrame?: typeof cancelAnimationFrame
}

const schedulerGlobal = globalThis as SchedulerGlobal

let originals: any
let OriginalPromise: any

if ((globalThis as any)[GLOBAL_ORIGINALS]) {
	originals = (globalThis as any)[GLOBAL_ORIGINALS]
	OriginalPromise = (globalThis as any)[GLOBAL_PROMISE]
} else {
	OriginalPromise = globalThis.Promise
	originals = {
		// biome-ignore lint/suspicious/noThenProperty: Intentional Promise.prototype patching
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
		clearTimeout: globalThis.clearTimeout,
		setInterval: globalThis.setInterval,
		clearInterval: globalThis.clearInterval,
		setImmediate: schedulerGlobal.setImmediate,
		clearImmediate: schedulerGlobal.clearImmediate,
		requestAnimationFrame: schedulerGlobal.requestAnimationFrame,
		cancelAnimationFrame: schedulerGlobal.cancelAnimationFrame,
		queueMicrotask: globalThis.queueMicrotask,
	}
	;(globalThis as any)[GLOBAL_ORIGINALS] = originals
	;(globalThis as any)[GLOBAL_PROMISE] = OriginalPromise
}

// Ensure modern statics are captured even if originals was cached from an older version
if (!originals.allSettled) originals.allSettled = (OriginalPromise as any).allSettled
if (!originals.any) originals.any = (OriginalPromise as any).any
if (!originals.race) originals.race = OriginalPromise.race
if (!originals.clearTimeout) originals.clearTimeout = globalThis.clearTimeout
if (!originals.clearInterval) originals.clearInterval = globalThis.clearInterval
if (!originals.clearImmediate) originals.clearImmediate = schedulerGlobal.clearImmediate
if (!originals.cancelAnimationFrame)
	originals.cancelAnimationFrame = schedulerGlobal.cancelAnimationFrame

const pendingTimeouts = new Set<unknown>()
const pendingIntervals = new Set<unknown>()
const pendingImmediates = new Set<unknown>()
const pendingAnimationFrames = new Set<unknown>()
let asyncSchedulersFrozen = false

function clearPendingSchedulers() {
	for (const handle of Array.from(pendingTimeouts)) originals.clearTimeout.call(globalThis, handle)
	for (const handle of Array.from(pendingIntervals))
		originals.clearInterval.call(globalThis, handle)
	if (originals.clearImmediate) {
		for (const handle of Array.from(pendingImmediates)) {
			originals.clearImmediate.call(globalThis, handle)
		}
	}
	if (originals.cancelAnimationFrame) {
		for (const handle of Array.from(pendingAnimationFrames)) {
			originals.cancelAnimationFrame.call(globalThis, handle)
		}
	}
	pendingTimeouts.clear()
	pendingIntervals.clear()
	pendingImmediates.clear()
	pendingAnimationFrames.clear()
}

function freezeAsyncSchedulers() {
	if (asyncSchedulersFrozen) return
	asyncSchedulersFrozen = true
	clearPendingSchedulers()
}

function resumeAsyncSchedulers() {
	asyncSchedulersFrozen = false
}

function canceledTimeoutHandle() {
	const handle = originals.setTimeout.call(globalThis, () => {}, 0)
	originals.clearTimeout.call(globalThis, handle)
	return handle
}

function canceledIntervalHandle() {
	const handle = originals.setInterval.call(globalThis, () => {}, 0)
	originals.clearInterval.call(globalThis, handle)
	return handle
}

function canceledImmediateHandle() {
	if (!originals.setImmediate || !originals.clearImmediate) return undefined
	const handle = originals.setImmediate.call(globalThis, () => {})
	originals.clearImmediate.call(globalThis, handle)
	return handle
}

function canceledAnimationFrameHandle() {
	if (!originals.requestAnimationFrame || !originals.cancelAnimationFrame) return 0
	const handle = originals.requestAnimationFrame.call(globalThis, () => {})
	originals.cancelAnimationFrame.call(globalThis, handle)
	return handle
}

onReactiveBroken(freezeAsyncSchedulers)
onReactiveReset(resumeAsyncSchedulers)

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
	// biome-ignore lint/suspicious/noThenProperty: Intentional Promise.prototype patching
	OriginalPromise.prototype.then = patchedThen as any
	OriginalPromise.prototype.catch = patchedCatch as any
	OriginalPromise.prototype.finally = patchedFinally as any
}

try {
	Object.defineProperty(OriginalPromise, Symbol.species, {
		get: () => PatchedPromise,
		configurable: true,
	})
} catch (_e) {}

;(globalThis as any).Promise = PatchedPromise

globalThis.setTimeout = ((callback: Function, ...args: any[]) => {
	if (asyncSchedulersFrozen) return canceledTimeoutHandle()
	const wrapped = wrap(callback as any)
	const handle = originals.setTimeout.call(
		globalThis,
		(...callbackArgs: any[]) => {
			pendingTimeouts.delete(handle)
			wrapped(...callbackArgs)
		},
		...args
	)
	pendingTimeouts.add(handle)
	return handle
}) as typeof globalThis.setTimeout

globalThis.clearTimeout = ((handle?: unknown) => {
	pendingTimeouts.delete(handle)
	return originals.clearTimeout.call(globalThis, handle)
}) as typeof globalThis.clearTimeout

globalThis.setInterval = ((callback: Function, ...args: any[]) => {
	if (asyncSchedulersFrozen) return canceledIntervalHandle()
	const wrapped = wrap(callback as any)
	const handle = originals.setInterval.call(
		globalThis,
		(...callbackArgs: any[]) => {
			wrapped(...callbackArgs)
		},
		...args
	)
	pendingIntervals.add(handle)
	return handle
}) as typeof globalThis.setInterval

globalThis.clearInterval = ((handle?: unknown) => {
	pendingIntervals.delete(handle)
	return originals.clearInterval.call(globalThis, handle)
}) as typeof globalThis.clearInterval

if (originals.setImmediate) {
	schedulerGlobal.setImmediate = ((callback: Function, ...args: any[]) => {
		if (asyncSchedulersFrozen) return canceledImmediateHandle()
		const wrapped = wrap(callback as any)
		const handle = originals.setImmediate.call(
			globalThis,
			(...callbackArgs: any[]) => {
				pendingImmediates.delete(handle)
				wrapped(...callbackArgs)
			},
			...args
		)
		pendingImmediates.add(handle)
		return handle
	}) as typeof setImmediate
}

if (originals.clearImmediate) {
	schedulerGlobal.clearImmediate = ((handle?: unknown) => {
		pendingImmediates.delete(handle)
		return originals.clearImmediate.call(globalThis, handle)
	}) as typeof clearImmediate
}

if (originals.requestAnimationFrame) {
	globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
		if (asyncSchedulersFrozen) return canceledAnimationFrameHandle()
		const wrapped = wrap(callback)
		const handle = originals.requestAnimationFrame.call(globalThis, (time: DOMHighResTimeStamp) => {
			pendingAnimationFrames.delete(handle)
			wrapped(time)
		})
		pendingAnimationFrames.add(handle)
		return handle
	}
}

if (originals.cancelAnimationFrame) {
	globalThis.cancelAnimationFrame = (handle: number) => {
		pendingAnimationFrames.delete(handle)
		return originals.cancelAnimationFrame.call(globalThis, handle)
	}
}

if (originals.queueMicrotask) {
	globalThis.queueMicrotask = (callback: VoidFunction): void => {
		originals.queueMicrotask.call(globalThis, wrap(callback))
	}
}
