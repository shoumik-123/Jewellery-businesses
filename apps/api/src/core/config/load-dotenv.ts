import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

/**
 * Loads the nearest .env walking up from this file, which in a monorepo is the
 * one at the repository root.
 *
 * Only outside production. A production process gets its configuration from
 * the platform, and silently picking up a stray .env from the image is how a
 * staging secret ends up serving live traffic. Existing variables always win,
 * so an explicitly exported value is never overwritten by the file.
 */
export function loadDotenv(): void {
  if (process.env['NODE_ENV'] === 'production') return;

  let dir = dirname(fileURLToPath(import.meta.url));
  const { root } = parse(dir);

  while (true) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      config({ path: candidate, override: false, quiet: true });
      return;
    }
    if (dir === root) return;
    dir = dirname(dir);
  }
}
