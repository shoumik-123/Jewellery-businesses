import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 moved the connection URL out of schema.prisma.
 *
 * Migrations and introspection use DIRECT_DATABASE_URL (the owner role, which
 * bypasses row-level security on purpose). The application never uses this
 * file: it builds its own PrismaClient over a pg driver adapter with
 * DATABASE_URL. See apps/api/src/core/database.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'],
  },
});
