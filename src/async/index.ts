export type Restorer = () => () => void
export type Hook = () => Restorer

export const asyncHooks = {
	addHook(_hook: Hook): () => void {
		throw 'One must import the library from the server or the client side'
	}
}