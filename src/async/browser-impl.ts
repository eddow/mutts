import { Hook, Restorer, asyncHooks } from '.'

const hooks = new Set<Hook>()
const promiseContexts = new WeakMap<Promise<any>, Set<Restorer>>()

asyncHooks.addHook = function (hook: Hook) {
	hooks.add(hook)
	return () => {
		hooks.delete(hook)
	}
}

function captureRestorers() {
	const restorers = new Set<Restorer>()
	for (const hook of hooks) {
		const restorer = hook()
		if (restorer) restorers.add(restorer)
	}
	return restorers
}

function wrap<Args extends any[], R>(fn: ((...args: Args) => R) | null | undefined, capturedRestorers?: Set<Restorer>) {
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
						for (let i = undoers.length - 1; i >= 0; i--) undoers[i]()
					})
				})
			} else {
				for (let i = undoers.length - 1; i >= 0; i--) undoers[i]()
			}
		}
	}
}

const targetWrappers = new WeakMap<any, Map<string, WeakMap<Function, Function>>>()

function patchEventTarget(proto: any) {
	if (!proto || !proto.addEventListener || !proto.removeEventListener) return
	const nativeAdd = proto.addEventListener
	const nativeRemove = proto.removeEventListener

	proto.addEventListener = function (this: any, type: string, listener: any, options: any) {
		if (typeof listener !== 'function') {
			return nativeAdd.call(this, type, listener, options)
		}

		let types = targetWrappers.get(this)
		if (!types) {
			types = new Map()
			targetWrappers.set(this, types)
		}
		let listeners = types.get(type)
		if (!listeners) {
			listeners = new WeakMap()
			types.set(type, listeners)
		}

		let wrapped = listeners.get(listener)
		if (!wrapped) {
			wrapped = wrap(listener)
			listeners.set(listener, wrapped)
		}
		
		return nativeAdd.call(this, type, wrapped, options)
	}

	proto.removeEventListener = function (this: any, type: string, listener: any, options: any) {
		if (typeof listener !== 'function') {
			return nativeRemove.call(this, type, listener, options)
		}

		const types = targetWrappers.get(this)
		if (types) {
			const listeners = types.get(type)
			if (listeners) {
				const wrapped = listeners.get(listener)
				if (wrapped) {
					return nativeRemove.call(this, type, wrapped, options)
				}
			}
		}
		
		return nativeRemove.call(this, type, listener, options)
	}
}

function patchOnProperties(proto: any) {
	if (!proto) return
	for (const prop of Object.getOwnPropertyNames(proto)) {
		if (prop.startsWith('on')) {
			const desc = Object.getOwnPropertyDescriptor(proto, prop)
			if (desc && desc.set && desc.configurable) {
				const nativeSet = desc.set
				Object.defineProperty(proto, prop, {
					...desc,
					set: function (this: any, fn: any) {
						nativeSet.call(this, wrap(fn))
					}
				})
			}
		}
	}
}

if (typeof EventTarget !== 'undefined') {
	patchEventTarget(EventTarget.prototype)
}

const prototypesToPatch = [
	typeof EventTarget !== 'undefined' && EventTarget.prototype,
	typeof HTMLElement !== 'undefined' && HTMLElement.prototype,
	typeof Window !== 'undefined' && Window.prototype,
	typeof Document !== 'undefined' && Document.prototype,
	typeof MessagePort !== 'undefined' && MessagePort.prototype,
	typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype,
	typeof IDBRequest !== 'undefined' && IDBRequest.prototype,
	typeof IDBTransaction !== 'undefined' && IDBTransaction.prototype,
	typeof IDBDatabase !== 'undefined' && IDBDatabase.prototype,
	typeof FileReader !== 'undefined' && FileReader.prototype,
	typeof AbortSignal !== 'undefined' && AbortSignal.prototype,
]

for (const proto of prototypesToPatch) {
	if (proto) {
		patchOnProperties(proto)
	}
}

const OriginalPromise = globalThis.Promise

const originals = {
	then: OriginalPromise.prototype.then,
	catch: OriginalPromise.prototype.catch,
	finally: OriginalPromise.prototype.finally,
	resolve: OriginalPromise.resolve,
	reject: OriginalPromise.reject,
	all: OriginalPromise.all,
	race: OriginalPromise.race,
	setTimeout: globalThis.setTimeout,
	setInterval: globalThis.setInterval,
	setImmediate: (globalThis as any).setImmediate,
	requestAnimationFrame: (globalThis as any).requestAnimationFrame,
	queueMicrotask: globalThis.queueMicrotask,
}

function patchedThen(this: any, onFulfilled: any, onRejected: any) {
	const context = promiseContexts.get(this) || captureRestorers()
	const nextPromise = originals.then.call(this, wrap(onFulfilled, context), wrap(onRejected, context))
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

class PatchedPromise<T> extends OriginalPromise<T> {
	constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) {
		let resolveRef: any, rejectRef: any
		super((res, rej) => {
			resolveRef = res
			rejectRef = rej
		})

		const creationContext = captureRestorers()
		if (creationContext.size > 0) promiseContexts.set(this, creationContext)

		const wrappedResolve = (val: any) => {
			const resolveContext = captureRestorers()
			if (resolveContext.size > 0) promiseContexts.set(this, resolveContext)
			return resolveRef(val)
		}

		const wrappedReject = (err: any) => {
			const rejectContext = captureRestorers()
			if (rejectContext.size > 0) promiseContexts.set(this, rejectContext)
			return rejectRef(err)
		}

		try {
			if (typeof executor === 'function') {
				executor(wrappedResolve, wrappedReject)
			}
		} catch (e) {
			wrappedReject(e)
		}
	}

	static get [Symbol.species]() {
		return PatchedPromise
	}

	static resolve<T>(value?: T | PromiseLike<T>): Promise<T> {
		const p = originals.resolve.call(this, value) as Promise<T>
		const context = captureRestorers()
		if (context.size > 0) promiseContexts.set(p, context)
		return p
	}

	static reject<T = never>(reason?: any): Promise<T> {
		const p = originals.reject.call(this, reason) as Promise<T>
		const context = captureRestorers()
		if (context.size > 0) promiseContexts.set(p, context)
		return p
	}

	static all<T>(values: Iterable<T | PromiseLike<T>>): Promise<T[]> {
		const p = originals.all.call(this, values) as Promise<T[]>
		const context = captureRestorers()
		if (context.size > 0) promiseContexts.set(p, context)
		return p
	}

	then(onFulfilled?: any, onRejected?: any): any {
		return patchedThen.call(this, onFulfilled, onRejected)
	}

	catch(onRejected?: any): any {
		return patchedCatch.call(this, onRejected)
	}

	finally(onFinally?: any): any {
		return patchedFinally.call(this, onFinally)
	}
}

OriginalPromise.prototype.then = patchedThen as any
OriginalPromise.prototype.catch = patchedCatch as any
OriginalPromise.prototype.finally = patchedFinally as any

try {
	Object.defineProperty(OriginalPromise, Symbol.species, {
		get: () => PatchedPromise,
		configurable: true
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
