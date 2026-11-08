/** @type {import('jest').Config} */
module.exports = {
  displayName: 'security',
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  transform: { '^.+\.ts$': ['@swc/jest', { jsc: { target: 'es2023' } }] },
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!index.ts'],
  coverageDirectory: '../coverage',
};
