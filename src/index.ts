export * from './decorator'
export * from './destroyable'
export * from './eventful'
export * from './indexable'
export * from './iterableWeak'
export * from './mixins'
export * from './reactive'
export * from './std-decorators'
export * from './utils'

import pkg from '../package.json'
const { version } = pkg

// Singleton verification
const GLOBAL_MUTTS_KEY = '__MUTTS_INSTANCE__'
const globalScope = 
	(typeof globalThis !== 'undefined' ? globalThis : 
	(typeof window !== 'undefined' ? window : 
	(typeof global !== 'undefined' ? global : false))) as any
if(globalScope) {
	// Detect the source of this instance safely across different environments
	let source = 'mutts/index'
	try {
		// @ts-ignore
		if (typeof __filename !== 'undefined') source = __filename
		// @ts-ignore
		else {
			// Using eval to avoid SyntaxError in CJS environments where import.meta is not allowed
			const meta = eval('import.meta')
			if (meta && meta.url) source = meta.url
		}
	} catch (e) {
		// Fallback for environments where neither is available or accessible
	}

	const currentSourceInfo = {
		version,
		source,
		timestamp: Date.now()
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
