import tseslint from 'typescript-eslint';
import { base } from './eslint.base.js';

/**
 * Backend rules. These are the architectural boundaries from
 * docs/07-project-structure.md, made mechanical so review does not have to
 * remember them.
 */
export default tseslint.config(
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Decorator metadata means empty constructors and parameter properties.
      '@typescript-eslint/no-useless-constructor': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',

      'no-restricted-syntax': [
        'error',
        {
          // Money is Decimal. Floats are how e-commerce loses pennies at scale.
          selector: "CallExpression[callee.name='parseFloat']",
          message:
            'Money must not pass through floats. Use the Decimal helpers in @jh/shared/money.',
        },
        {
          selector: "MemberExpression[property.name='toFixed']",
          message: 'Use @jh/shared/money formatting instead of toFixed (binary rounding).',
        },
        {
          selector: "MemberExpression[property.name='$queryRawUnsafe']",
          message: '$queryRawUnsafe bypasses tenant scoping. Use $queryRaw with a store predicate.',
        },
        {
          selector: "MemberExpression[property.name='$executeRawUnsafe']",
          message: '$executeRawUnsafe bypasses tenant scoping. Use $executeRaw.',
        },
      ],
    },
  },
  {
    // Only the database layer may touch the unscoped client or raw pg.
    files: ['src/**/*.ts'],
    ignores: ['src/core/database/**', 'src/core/tenancy/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'Import the scoped client from core/database (TenantPrisma) instead. Raw client access is restricted to core/database.',
            },
            {
              name: 'pg',
              message: 'Database drivers belong in core/database only.',
            },
          ],
          patterns: [
            {
              group: ['**/generated/prisma', '**/generated/prisma/**'],
              message:
                'Import Prisma types from @jh/shared or core/database, not the generated path.',
            },
          ],
        },
      ],
    },
  },
  {
    // Controllers are HTTP adapters: no data access, no business rules.
    files: ['src/**/*.controller.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/*.repository', '**/*.repository.js', '**/prisma.service'],
              message: 'Controllers must call a service, never a repository or Prisma directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // Pure domain: no framework, no I/O. This is what keeps pricing testable.
    files: ['src/modules/**/pricing/**/*.ts', 'src/modules/orders/order-state-machine.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*', '@prisma/*', 'pg', '**/*.service', '**/*.repository'],
              message:
                'Domain logic must stay pure (no Nest, no Prisma, no I/O) so it can be unit tested without a database.',
            },
          ],
        },
      ],
    },
  },
);
