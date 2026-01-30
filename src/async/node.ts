import { createHook } from 'node:async_hooks'
import { Hook, Restorer, asyncHooks } from '.'

const hooks = new Set<Hook>()
const restorersPerAsyncId = new Map<number, Set<Restorer>>()
const undoersPerAsyncId = new Map<number, Set<() => void>>()

createHook({
	init(asyncId) {
		const restorers = new Set<Restorer>()
		for (const hook of hooks) {
			restorers.add(hook())
		}
		restorersPerAsyncId.set(asyncId, restorers)
	},
	before(asyncId) {
		const restorers = restorersPerAsyncId.get(asyncId)
		if (restorers) {
			const undoers = new Set<() => void>()
			for (const restore of restorers) {
				undoers.add(restore())
			}
			undoersPerAsyncId.set(asyncId, undoers)
		}
	},
	after(asyncId) {
		const undoers = undoersPerAsyncId.get(asyncId)
		if (undoers) {
			for (const undo of undoers) undo()
			undoersPerAsyncId.delete(asyncId)
		}
	},
	destroy(asyncId) {
		restorersPerAsyncId.delete(asyncId)
		undoersPerAsyncId.delete(asyncId)
	}
}).enable()

asyncHooks.addHook = function (hook: Hook) {
	hooks.add(hook)
	return () => {
		hooks.delete(hook)
	}
}

export * from '../index'
