import pkg from '../package.json'

const { version } = pkg

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
	let source = 'mutts/index'
	try {
		if (typeof __filename !== 'undefined') source = __filename
		else if (typeof import.meta !== 'undefined' && import.meta.url) {
			source = import.meta.url
		}
	} catch (_e) {}

	const currentSourceInfo = { version, source, timestamp: Date.now() }

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
