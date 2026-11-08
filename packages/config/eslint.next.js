import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';
import { base } from './eslint.base.js';

/** Frontend rules. The web app must never reach past the API. */
export default tseslint.config(...base, {
  files: ['src/**/*.{ts,tsx}'],
  languageOptions: {
    globals: { ...globals.browser, ...globals.node },
  },
  plugins: {
    'react-hooks': reactHooks,
    '@next/next': nextPlugin,
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
    ...nextPlugin.configs.recommended.rules,
    ...nextPlugin.configs['core-web-vitals'].rules,

    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@prisma/client',
            message:
              'The web app never talks to the database. Call the API through lib/api-client.',
          },
          { name: 'pg', message: 'The web app never talks to the database.' },
        ],
      },
    ],
    // Server Components are the default; be deliberate about client islands.
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
});
