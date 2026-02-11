export * from './async'
export * from './decorator'
export * from './destroyable'
export * from './eventful'
export * from './flavored'
export * from './indexable'
export * from './iterableWeak'
export * from './mixins'
export * from './promiseChain'
export * from './reactive'
export * from './std-decorators'
export * from './utils'
export * from './zone'

import pkg from '../package.json'

const { version } = pkg

// Singleton verification
const GLOBAL_MUTTS_KEY = '__MUTTS_INSTANCE__'
const globalScope = (
	typeof globalThis !== 'undefined'
		? globalThis
		: typeof window !== 'undefined'
			? window
			: typeof global !== 'undefined'
				? global
				: false
) as any
if (globalScope) {
	// Skip singleton check in development to avoid issues with linked packages
	const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV !== false
	if (!isDev) {
		// Detect the source of this instance safely across different environments
		let source = 'mutts/index'
		const viteEval = eval
		try {
			if (typeof __filename !== 'undefined') source = __filename
			else {
				// Using eval to avoid SyntaxError in CJS environments where import.meta is not allowed
				const meta = viteEval('import.meta')
				if (meta && meta.url) source = meta.url
			}
		} catch (e) {
			// Fallback for environments where neither is available or accessible
		}

		const currentSourceInfo = {
			version,
			source,
			timestamp: Date.now(),
		}

		if (globalScope[GLOBAL_MUTTS_KEY]) {
			const existing = globalScope[GLOBAL_MUTTS_KEY]
			throw new Error(
				`[Mutts] Multiple instances detected!\n` +
					`Existing instance: ${JSON.stringify(existing, null, 2)}\n` +
					`New instance: ${JSON.stringify(currentSourceInfo, null, 2)}\n` +
					`This usually happens when 'mutts' is both installed as a dependency and bundled, ` +
					`or when different versions are loaded. ` +
					`Please check your build configuration (aliases, externals) to ensure a single source of truth.`
			)
		}

		globalScope[GLOBAL_MUTTS_KEY] = currentSourceInfo
	}
}
