export * from './async'
export * from './decorator'
export * from './destroyable'
export * from './diff'
export * from './eventful'
export * from './flavored'
export * from './indexable'
export * from './iterableWeak'
export * from './mixins'
export * from './promiseChain'
export * from './reactive'
export * from './std-decorators'
export {
	arrayEquals,
	CompareSymbol,
	deepCompare,
	isConstructor,
	isDev,
	isObject,
	isProd,
	isTest,
	named,
	tag,
	zip,
} from './utils'
export * from './zone'

// Important: let it here!
import pkg from '../package.json'

const { version } = pkg

const GLOBAL_MUTTS_KEY = '__MUTTS_INSTANCE__'
const runtimeGlobals = globalThis as typeof globalThis & {
	window?: typeof window
	global?: typeof globalThis
	__filename?: string
	[GLOBAL_MUTTS_KEY]?: unknown
}
const globalScope = (
	typeof globalThis !== 'undefined'
		? globalThis
		: runtimeGlobals.window
			? runtimeGlobals.window
			: runtimeGlobals.global
				? runtimeGlobals.global
				: false
) as any
if (globalScope) {
	let source = 'mutts/index'
	try {
		if (runtimeGlobals.__filename) source = runtimeGlobals.__filename
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
