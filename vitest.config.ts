import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

console.error('[CONFIG] TEST_ENV:', process.env.TEST_ENV)

export default defineConfig({
  resolve: {
    alias: {
      'mutts': resolve(__dirname, process.env.TEST_ENV === 'browser' ? './src/entry-browser.ts' : './src/entry-node.ts')
    },
    conditions: [
      process.env.TEST_ENV === 'browser' ? 'test-browser' : 'test-node'
    ]
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: process.env.TEST_ENV === 'browser' ? ['tests/profiling/**'] : [],
    globals: true,
    browser: {
      enabled: process.env.TEST_ENV === 'browser',
      headless: true,
      instances: [
        { 
          browser: 'chromium',
          name: 'chromium', 
          provider: playwright(),
        }
      ]
    },
  },
})
