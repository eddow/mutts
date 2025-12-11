import { defineConfig } from 'rollup'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from 'rollup-plugin-typescript2'
import copy from 'rollup-plugin-copy'

export default defineConfig({
  input: {
    devtools: 'devtool/devtools.ts',
    panel: 'devtool/panel.ts',
  },
  output: {
    dir: 'dist/devtools',
    format: 'esm',
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    sourcemap: true,
  },
  plugins: [
    resolve({ browser: true, extensions: ['.mjs', '.js', '.json', '.ts'] }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.devtools.json',
      clean: false,
      verbosity: 2,
    }),
    copy({
      targets: [
        { src: 'devtool/devtools.html', dest: 'dist/devtools' },
        { src: 'devtool/panel.html', dest: 'dist/devtools' },
        { src: 'devtool/panel.css', dest: 'dist/devtools' },
        { src: 'devtool/manifest.json', dest: 'dist/devtools' },
      ],
    }),
  ],
})

