import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from 'rollup-plugin-typescript2'
import pluginDts from 'rollup-plugin-dts'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { rm } from 'node:fs/promises'
import terser from '@rollup/plugin-terser'
import json from '@rollup/plugin-json'

const external = [
	// Add any external dependencies here
]

const isWatch = process.argv.includes('--watch')

if (!isWatch) {
	await rm('dist', { recursive: true, force: true })
}

function ensureStableTypeEntrypoints() {
	const distDir = resolvePath('dist')
	const entrypoints = [
		['browser.d.ts', "export * from './src/entry-browser'\n"],
		['browser.dev.d.ts', "export * from './src/entry-browser.dev'\n"],
		['node.d.ts', "export * from './src/entry-node'\n"],
		['node.dev.d.ts', "export * from './src/entry-node.dev'\n"],
		['debug.d.ts', "export * from './debug/index'\n"],
	]
	return {
		name: 'ensure-stable-type-entrypoints',
		buildStart() {
			mkdirSync(distDir, { recursive: true })
			for (const [file, content] of entrypoints) {
				const target = resolvePath(distDir, file)
				mkdirSync(dirname(target), { recursive: true })
				if (!existsSync(target)) writeFileSync(target, content)
			}
		},
	}
}

const plugins = [
	resolve({
		preferBuiltins: true,
	}),
	commonjs(),
	typescript({
		tsconfig: './tsconfig.build.json',
		declaration: false,
		sourceMap: true,
		exclude: ['**/*.test.ts', '**/*.spec.ts'],
	}),
	json(),
	...(isWatch ? [ensureStableTypeEntrypoints()] : []),
]

// Single entry with multiple inputs for efficient chunking
const input = {
	browser: 'src/entry-browser.ts',
	'browser.dev': 'src/entry-browser.dev.ts',
	node: 'src/entry-node.ts',
	'node.dev': 'src/entry-node.dev.ts',
	debug: 'debug/index.ts'
}

const config = [
	// CJS/ESM bundles with chunking
	{
		input,
		output: [
			{
				dir: 'dist',
				format: 'cjs',
				sourcemap: true,
				entryFileNames: '[name].cjs',
				chunkFileNames: 'chunks/[name]-[hash].cjs',
			},
			{
				dir: 'dist',
				format: 'esm',
				sourcemap: true,
				entryFileNames: '[name].esm.js',
				chunkFileNames: 'chunks/[name]-[hash].esm.js',
			},
		],
		external,
		plugins,
	},
	// DTS bundles with chunking
	{
		input,
		output: [
			{
				dir: 'dist',
				format: 'es',
				entryFileNames: '[name].d.ts',
				chunkFileNames: '[name].d.ts',
			},
		],
		external,
		plugins: [
			...(isWatch ? [ensureStableTypeEntrypoints()] : []),
			pluginDts(),
		],
	},
	// UMD bundle for browser usage
	{
		input: 'src/entry-browser.ts',
		output: [
			{
				file: 'dist/mutts.umd.js',
				format: 'umd',
				name: 'Mutts',
				sourcemap: true,
			},
			{
				file: 'dist/mutts.umd.min.js',
				format: 'umd',
				name: 'Mutts',
				sourcemap: true,
				plugins: [
					terser({
						compress: {
							drop_console: true,
							drop_debugger: true,
						},
					}),
				],
			},
		],
		external,
		plugins
	},
]

export default config
