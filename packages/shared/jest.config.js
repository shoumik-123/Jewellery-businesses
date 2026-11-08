/** @type {import('jest').Config} */
module.exports = {
  displayName: 'shared',
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  transform: { '^.+\.ts$': ['@swc/jest', { jsc: { target: 'es2023' } }] },
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    // Barrels only re-export; they would dilute the thresholds below.
    '!index.ts',
    '!**/index.ts',
  ],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    // Money must not be wrong. This threshold is a gate, not an aspiration.
    './src/money/money.ts': { lines: 95, functions: 95, branches: 90, statements: 95 },
  },
};
