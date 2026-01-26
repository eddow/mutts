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
  index: 'src/index.ts',
  'reactive': 'src/reactive/index.ts',
  'std-decorators': 'src/std-decorators.ts',
  eventful: 'src/eventful.ts',
  decorator: 'src/decorator.ts',
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
    plugins: [
      pluginDts(),
      { // TODO: Might be an overkill for Array augmentation ?
        name: 'append-array-augmentation',
        closeBundle() {
          // Run after all bundles are closed to ensure rollup-plugin-dts has finished
          const indexPath = join('dist', 'index.d.ts')
          const augmentationContent = readFileSync('src/index.d.ts', 'utf8')

          try {
            // Read the current content
            let currentContent = readFileSync(indexPath, 'utf8').trim()

            // If the file is empty or only has export {}, rollup-plugin-dts didn't generate exports
            // In this case, we need to manually read the exports from the individual .d.ts files
            if (!currentContent || currentContent === 'export {};' || currentContent === 'export { };') {
              // Read source index.ts to get export statements and convert to .js extensions for declarations
              const sourceExports = readFileSync('src/index.ts', 'utf8')
                .split('\n')
                .filter(line => line.trim().startsWith('export'))
                .map(line => line.replace(/from ['"]\.\/([^'"]+)['"]/g, "from './$1.js'"))

              currentContent = sourceExports.join('\n')
            } else {
              // Remove any trailing export { } statements
              currentContent = currentContent.replace(/\n\s*export\s*{\s*}\s*;?\s*$/m, '')
            }

            // Append augmentation at the end
            const finalContent = currentContent.trim() + '\n\n' + augmentationContent
            writeFileSync(indexPath, finalContent, 'utf8')
            console.log('✓ Array augmentation included in index.d.ts')
          } catch (error) {
            console.warn('Failed to process index.d.ts:', error.message)
          }
        },
      },
    ],
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
