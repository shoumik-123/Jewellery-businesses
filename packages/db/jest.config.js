/** @type {import('jest').Config} */
module.exports = {
  displayName: 'db',
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  transform: { '^.+\.ts$': ['@swc/jest', { jsc: { target: 'es2023' } }] },
  // The generated Prisma client is not ours to cover.
  testPathIgnorePatterns: ['/generated/'],
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!index.ts', '!generated/**'],
  coverageDirectory: '../coverage',
};
