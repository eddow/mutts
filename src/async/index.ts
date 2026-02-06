export type Restorer = () => () => void
export type Hook = () => Restorer

// Queue for hooks registered before the environment is ready (circular dependency fix)
export const hooks = new Set<Hook>()

export const asyncHooks = {
	addHook(hook: Hook): () => void {
		hooks.add(hook)
		return () => hooks.delete(hook)
	},
	/**
	 * [Hack] Sanitize a promise (or value) to prevent context leaks.
	 * Default: Identity function.
	 * Browser: Uses Macrotask wrapping to break microtask chains.
	 */
	sanitizePromise(p: any): any {
		return p
	},
}

/**
 * Register a hook that will be called whenever an asynchronous operation is initiated.
 * The hook should return a restorer function which will be called just before the async callback runs.
 * That restorer should in turn return an undoer function which will be called just after the async callback finishes.
 */
export const asyncHook = (hook: Hook) => asyncHooks.addHook(hook)
