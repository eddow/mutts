import { Hook, Restorer, asyncHooks } from '.'

const hooks = new Set<Hook>()

asyncHooks.addHook = function (hook: Hook) {
	hooks.add(hook)
	return () => {
		hooks.delete(hook)
	}
}

export * from '../index'

function wrap<Args extends any[], R>(fn: ((...args: Args) => R) | null | undefined) {
	if (typeof fn !== 'function') return fn
	const restorers = new Set<Restorer>()
	for (const hook of hooks) restorers.add(hook())

	return function (this: any, ...args: Args) {
		const undoers = new Set<() => void>()
		for (const restore of restorers) undoers.add(restore())
		try {
			return fn.apply(this, args)
		} finally {
			for (const undo of undoers) undo()
		}
	}
}

const originals = {
	then: Promise.prototype.then,
	catch: Promise.prototype.catch,
	finally: Promise.prototype.finally,
	setTimeout: globalThis.setTimeout,
	setInterval: globalThis.setInterval,
	setImmediate: globalThis.setImmediate,
	requestAnimationFrame: globalThis.requestAnimationFrame,
	queueMicrotask: globalThis.queueMicrotask,
}

Promise.prototype.then = function <T, R1, R2>(
	this: Promise<T>,
	onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
	onRejected?: ((reason: any) => R2 | PromiseLike<R2>) | null
): Promise<R1 | R2> {
	return originals.then.call(this, wrap(onFulfilled), wrap(onRejected))
}

Promise.prototype.catch = function <T>(
	this: Promise<T>,
	onRejected?: ((reason: any) => T | PromiseLike<T>) | null
): Promise<T> {
	return originals.catch.call(this, wrap(onRejected))
}

Promise.prototype.finally = function <T>(
	this: Promise<T>,
	onFinally?: (() => void) | null
): Promise<T> {
	return originals.finally.call(this, wrap(onFinally))
}

globalThis.setTimeout = ((callback: Function, ...args: any[]) => {
	return originals.setTimeout.call(globalThis, wrap(callback as any), ...args)
}) as any

globalThis.setInterval = ((callback: Function, ...args: any[]) => {
	return originals.setInterval.call(globalThis, wrap(callback as any), ...args)
}) as any

if (originals.setImmediate) {
	globalThis.setImmediate = ((callback: Function, ...args: any[]) => {
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