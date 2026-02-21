import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from 'rollup-plugin-typescript2'
import pluginDts from 'rollup-plugin-dts'
import { rm } from 'node:fs/promises'
import terser from '@rollup/plugin-terser'
import json from '@rollup/plugin-json'

await rm('dist', { recursive: true, force: true })

const external = [
	// Add any external dependencies here
]

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
				manualChunks: {
					'async-core': ['src/async/index.ts'],
					'async-node': ['src/async/node.ts'],
					'async-browser': ['src/async/browser.ts'],
				},
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
		input: { ...input, index: 'src/index.ts' },
		output: [
			{
				dir: 'dist',
				format: 'es',
				entryFileNames: '[name].d.ts',
				chunkFileNames: '[name]-[hash].d.ts',
			},
		],
		external,
		plugins: [
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
