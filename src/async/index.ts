export type Restorer = () => () => void
export type Hook = () => Restorer

export const asyncHooks = {
	addHook(_hook: Hook): () => void {
		throw 'One must import the library from the server or the client side'
	}
}

/**
 * Register a hook that will be called whenever an asynchronous operation is initiated.
 * The hook should return a restorer function which will be called just before the async callback runs.
 * That restorer should in turn return an undoer function which will be called just after the async callback finishes.
 */
export const asyncHook = (hook: Hook) => asyncHooks.addHook(hook)