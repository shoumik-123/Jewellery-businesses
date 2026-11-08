import config from '@jh/config/eslint';

export default [
  ...config,
  // Generated client: not ours to lint.
  { ignores: ['src/generated/**'] },
];
