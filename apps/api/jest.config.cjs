/** @type {import('jest').Config} */
module.exports = {
  displayName: 'api',
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          target: 'es2023',
          // The same two flags the dev runner needs: Nest's DI reads parameter
          // types from decorator metadata, and a transform that drops them
          // turns every injected dependency into undefined at runtime.
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
        },
      },
    ],
  },
  /**
   * The source is ESM and imports its own files with a `.js` extension, which
   * is what Node requires and what Jest's CommonJS resolver cannot follow.
   *
   * The pattern is anchored and the dots are escaped deliberately. An
   * unescaped `.` here matches any character, so `./x/y.cjs` inside a
   * dependency gets rewritten too and that package stops resolving - which is
   * exactly what happened before this comment existed.
   */
  moduleNameMapper: { '^(\\.{1,2}\\/.*)\\.js$': '$1' },
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!main.ts'],
  coverageDirectory: '../coverage',
};
