import { createHook } from 'node:async_hooks'
import { onReactiveBroken, onReactiveReset } from '../reactive/effects'
import { hooks, type Restorer } from '.'

// 1. Generic async_hooks implementation for Hooks
// This maintains support for 'asyncHooks.addHook' for generic use cases.

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
	init(asyncId, _type, _triggerId, _resource) {
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
	// biome-ignore lint/suspicious/noThenProperty: Intentional Promise.prototype patching
	then: OriginalPromise.prototype.then,
	catch: OriginalPromise.prototype.catch,
	finally: OriginalPromise.prototype.finally,
	resolve: OriginalPromise.resolve,
	reject: OriginalPromise.reject,
	all: OriginalPromise.all,
	setTimeout: globalThis.setTimeout,
	clearTimeout: globalThis.clearTimeout,
	setInterval: globalThis.setInterval,
	clearInterval: globalThis.clearInterval,
	setImmediate: globalThis.setImmediate,
	clearImmediate: globalThis.clearImmediate,
}

const pendingTimeouts = new Set<unknown>()
const pendingIntervals = new Set<unknown>()
const pendingImmediates = new Set<unknown>()
let asyncSchedulersFrozen = false

function clearPendingSchedulers() {
	for (const handle of Array.from(pendingTimeouts))
		originalMethods.clearTimeout.call(globalThis, handle)
	for (const handle of Array.from(pendingIntervals))
		originalMethods.clearInterval.call(globalThis, handle)
	for (const handle of Array.from(pendingImmediates))
		originalMethods.clearImmediate.call(globalThis, handle)
	pendingTimeouts.clear()
	pendingIntervals.clear()
	pendingImmediates.clear()
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
	const handle = originalMethods.setTimeout.call(globalThis, () => {}, 0)
	originalMethods.clearTimeout.call(globalThis, handle)
	return handle
}

function canceledIntervalHandle() {
	const handle = originalMethods.setInterval.call(globalThis, () => {}, 0)
	originalMethods.clearInterval.call(globalThis, handle)
	return handle
}

function canceledImmediateHandle() {
	const handle = originalMethods.setImmediate.call(globalThis, () => {})
	originalMethods.clearImmediate.call(globalThis, handle)
	return handle
}

onReactiveBroken(freezeAsyncSchedulers)
onReactiveReset(resumeAsyncSchedulers)

globalThis.setTimeout = ((callback: Function, ...args: any[]) => {
	if (asyncSchedulersFrozen) return canceledTimeoutHandle()
	const handle = originalMethods.setTimeout.call(
		globalThis,
		(...callbackArgs: any[]) => {
			pendingTimeouts.delete(handle)
			callback(...callbackArgs)
		},
		...args
	)
	pendingTimeouts.add(handle)
	return handle
}) as typeof globalThis.setTimeout

globalThis.clearTimeout = ((handle?: unknown) => {
	pendingTimeouts.delete(handle)
	return originalMethods.clearTimeout.call(globalThis, handle)
}) as typeof globalThis.clearTimeout

globalThis.setInterval = ((callback: Function, ...args: any[]) => {
	if (asyncSchedulersFrozen) return canceledIntervalHandle()
	const handle = originalMethods.setInterval.call(
		globalThis,
		(...callbackArgs: any[]) => {
			callback(...callbackArgs)
		},
		...args
	)
	pendingIntervals.add(handle)
	return handle
}) as typeof globalThis.setInterval

globalThis.clearInterval = ((handle?: unknown) => {
	pendingIntervals.delete(handle)
	return originalMethods.clearInterval.call(globalThis, handle)
}) as typeof globalThis.clearInterval

globalThis.setImmediate = ((callback: Function, ...args: any[]) => {
	if (asyncSchedulersFrozen) return canceledImmediateHandle()
	const handle = originalMethods.setImmediate.call(
		globalThis,
		(...callbackArgs: any[]) => {
			pendingImmediates.delete(handle)
			callback(...callbackArgs)
		},
		...args
	)
	pendingImmediates.add(handle)
	return handle
}) as typeof globalThis.setImmediate

globalThis.clearImmediate = ((handle?: unknown) => {
	pendingImmediates.delete(handle)
	return originalMethods.clearImmediate.call(globalThis, handle)
}) as typeof globalThis.clearImmediate

// Patch prototype
// biome-ignore lint/suspicious/noThenProperty: Intentional Promise.prototype patching
OriginalPromise.prototype.then = function (onFulfilled, onRejected) {
	return originalMethods.then.call(this, wrap(onFulfilled), wrap(onRejected))
} as any
OriginalPromise.prototype.catch = function (onRejected) {
	return originalMethods.catch.call(this, wrap(onRejected))
} as any
OriginalPromise.prototype.finally = function (onFinally) {
	return originalMethods.finally.call(this, wrap(onFinally))
} as any
