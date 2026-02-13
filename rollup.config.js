import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from 'rollup-plugin-typescript2'
import pluginDts from 'rollup-plugin-dts'
import { rm } from 'node:fs/promises'
import terser from '@rollup/plugin-terser'
import json from '@rollup/plugin-json'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

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
    tsconfig: './tsconfig.json',
    declaration: false,
    sourceMap: true,
    exclude: ['**/*.test.ts', '**/*.spec.ts'],
  }),
  json(),
]

const umdPlugins = [
  ...plugins,
  terser({
    compress: {
      drop_console: true,
      drop_debugger: true,
    },
  }),
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
    input,
    output: [
      {
        dir: 'dist',
        format: 'es',
      },
    ],
    external,
    plugins: [
      pluginDts(),
      { //TOTO: remove the demand - try to remove it and see why pounce/* make problems
        name: 'generate-index-dts',
        closeBundle() {
          // rollup-plugin-dts generates browser.d.ts/node.d.ts from the entry keys,
          // but package consumers also expect dist/index.d.ts.
          // The rolled-up .d.ts files can drop named re-exports (rollup-plugin-dts bug),
          // so we re-export from the complete intermediate files instead.
          const indexPath = join('dist', 'index.d.ts')
          writeFileSync(indexPath, "export * from './src/index'\n", 'utf8')
          console.log('✓ dist/index.d.ts generated')
        },
      },
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
      },
    ],
    external,
    plugins: umdPlugins,
  },
]

export default config
