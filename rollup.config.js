import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from 'rollup-plugin-typescript2'
import pluginDts from 'rollup-plugin-dts'
import { rm } from 'node:fs/promises'
import terser from '@rollup/plugin-terser'
import { readFileSync } from 'fs'

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
  index: 'src/index.ts',
  'reactive/index': 'src/reactive/index.ts',
  'reactive/collections': 'src/reactive/collections.ts',
  'std-decorators': 'src/std-decorators.ts',
  eventful: 'src/eventful.ts',
  indexable: 'src/indexable.ts',
  promiseChain: 'src/promiseChain.ts',
  destroyable: 'src/destroyable.ts',
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
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
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
    plugins: [pluginDts()],
  },
  // UMD bundle for browser usage
  {
    input: 'src/index.ts',
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
