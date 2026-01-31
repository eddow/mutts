export type Restorer = () => () => void
export type Hook = () => Restorer

export const asyncHooks = {
	addHook(_hook: Hook): () => void {
		throw 'One must import the library from the server or the client side'
	},
    /** 
     * [Hack] Sanitize a promise (or value) to prevent context leaks. 
     * Default: Identity function.
     * Browser: Uses Macrotask wrapping to break microtask chains.
     */
    sanitizePromise(p: any): any {
        return p
    }
}

/**
 * Register a hook that will be called whenever an asynchronous operation is initiated.
 * The hook should return a restorer function which will be called just before the async callback runs.
 * That restorer should in turn return an undoer function which will be called just after the async callback finishes.
 */
export const asyncHook = (hook: Hook) => asyncHooks.addHook(hook)