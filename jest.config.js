export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Exclude profiling tests from normal runs (can be overridden via CLI)
  testPathIgnorePatterns: process.env.RUN_PROFILING ? [] : ['/tests/profiling/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: process.env.TSCONFIG || 'tests/tsconfig.json'
    }],
  },
  moduleNameMapper: {
    '^mutts/(.*)$': '<rootDir>/src/$1',
    '^mutts$': '<rootDir>/src/index.ts'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/profiling/**',
    '!tests/**',
  ],
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json',
  ],
  coverageDirectory: 'coverage',
  // Optional: Set coverage thresholds to track quality
  // coverageThreshold: {
  //   global: {
  //     branches: 80,
  //     functions: 80,
  //     lines: 80,
  //     statements: 80,
  //   },
  // },
}; 