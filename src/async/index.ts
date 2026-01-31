export type Restorer = () => () => void
export type Hook = () => Restorer

const ASYNC_HOOKS_KEY = '__MUTTS_ASYNC_HOOKS__'
const globalScope = (typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {}))) as any

if (!globalScope[ASYNC_HOOKS_KEY]) {
	globalScope[ASYNC_HOOKS_KEY] = {
		addHook(_hook: Hook): () => void {
			throw 'One must import the library from the server or the client side'
		}
	}
}

export const asyncHooks = globalScope[ASYNC_HOOKS_KEY]

/**
 * Register a hook that will be called whenever an asynchronous operation is initiated.
 * The hook should return a restorer function which will be called just before the async callback runs.
 * That restorer should in turn return an undoer function which will be called just after the async callback finishes.
 */
export const asyncHook = (hook: Hook) => asyncHooks.addHook(hook)