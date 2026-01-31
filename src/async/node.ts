import { createHook } from 'node:async_hooks'
import { Hook, Restorer, asyncHooks } from '.'

// 1. Generic async_hooks implementation for Hooks
// This maintains support for 'asyncHooks.addHook' for generic use cases.

const hooks = new Set<Hook>()
asyncHooks.addHook = function (hook: Hook) {
	hooks.add(hook)
	return () => {
		hooks.delete(hook)
	}
}

const contexts = new Map<number, Restorer[]>()
const activeUndoers = new Map<number, (() => void)[]>()

// Helper to capture current hooks state
function captureRestorers() {
	if (hooks.size === 0) return []
	const restorers: Restorer[] = []
	for (const h of hooks) {
		const r = h()
		if (r) restorers.push(r)
	}
	return restorers
}

// Manual Wrap function to handle Promise callbacks
function wrap<Args extends any[], R>(fn: ((...args: Args) => R) | null | undefined) {
	if (typeof fn !== 'function') return fn
	const restorers = captureRestorers()
	if (restorers.length === 0) return fn

	return function (this: any, ...args: Args) {
		const undoers: (() => void)[] = []
		for (const restore of restorers) {
			const u = restore()
			if (u) undoers.push(u)
		}
		try {
			return fn.apply(this, args)
		} finally {
			for (let i = undoers.length - 1; i >= 0; i--) undoers[i]()
		}
	}
}

const hook = createHook({
	init(asyncId, type, triggerId, resource) {
		// Used for native resources like Timers
		const restorers = captureRestorers()
		if (restorers.length > 0) contexts.set(asyncId, restorers)
	},
	before(asyncId) {
		const restorers = contexts.get(asyncId)
		if (!restorers) return
		const undoers: (() => void)[] = []
		for (const restore of restorers) {
			const u = restore()
			if (u) undoers.push(u)
		}
		if (undoers.length > 0) activeUndoers.set(asyncId, undoers)
	},
	after(asyncId) {
		const undoers = activeUndoers.get(asyncId)
		if (!undoers) return
		for (let i = undoers.length - 1; i >= 0; i--) undoers[i]()
		activeUndoers.delete(asyncId)
	},
	destroy(asyncId) {
		contexts.delete(asyncId)
		activeUndoers.delete(asyncId)
	},
})
hook.enable()

// 2. Shadow Promise Implementation
// Ensures V8 await resumptions are visible as .then callbacks, wrapping them to restore context.

const OriginalPromise = globalThis.Promise
const originalMethods = {
	then: OriginalPromise.prototype.then,
	catch: OriginalPromise.prototype.catch,
	finally: OriginalPromise.prototype.finally,
	resolve: OriginalPromise.resolve,
	reject: OriginalPromise.reject,
	all: OriginalPromise.all,
}



// Patch prototype
OriginalPromise.prototype.then = function(onFulfilled, onRejected) {
	return originalMethods.then.call(this, wrap(onFulfilled), wrap(onRejected))
} as any
OriginalPromise.prototype.catch = function(onRejected) {
	return originalMethods.catch.call(this, wrap(onRejected))
} as any
OriginalPromise.prototype.finally = function(onFinally) {
	return originalMethods.finally.call(this, wrap(onFinally))
} as any


