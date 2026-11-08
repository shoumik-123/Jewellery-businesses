/**
 * Sets a user's password from the command line.
 *
 * Needed because the seed deliberately never overwrites an existing
 * password - re-running it must not silently reset a live account - and
 * because self-service reset needs an email service that is not wired up yet
 * (Phase 2 continues). Until then this is the recovery path for a forgotten
 * super-admin or shop-owner password.
 *
 * The password is read from an environment variable rather than an argument,
 * because a command-line argument is visible in shell history and in the
 * process list to every other user on the machine.
 *
 * Usage:
 *   NEW_PASSWORD='a-long-passphrase' pnpm user:set-password admin@example.com
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { hashPassword } from '@jh/security';
import { PrismaClient } from '../packages/db/src/generated/prisma/client.ts';

const MIN_LENGTH = 12;

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.env['NEW_PASSWORD'];

  if (!email) {
    throw new Error("Usage: NEW_PASSWORD='…' pnpm user:set-password <email>");
  }
  if (!password) {
    throw new Error(
      'NEW_PASSWORD is required. Pass it as an environment variable, not an argument.',
    );
  }
  if (password.length < MIN_LENGTH) {
    throw new Error(
      `NEW_PASSWORD must be at least ${MIN_LENGTH} characters (got ${password.length}). ` +
        'Length is what makes a password hard to guess; a long phrase beats a short one with symbols.',
    );
  }
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'Refusing to run with NODE_ENV=production. Resetting a password on a live system ' +
        'should be an audited action in the admin console, not an untracked script.',
    );
  }

  const connectionString = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DIRECT_DATABASE_URL (or DATABASE_URL) is required.');

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ['warn', 'error'] });

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, status: true, isSuperAdmin: true },
    });

    if (!user) {
      throw new Error(`No user with the email ${email}.`);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        // Clear any lockout: being locked out is usually why someone is here.
        failedLogins: 0,
        lockedUntil: null,
      },
    });

    // Existing sessions are cut. Changing a password because it may be known
    // to someone else is pointless if their session keeps working.
    const { count } = await prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'PASSWORD_CHANGED' },
    });

    console.log(`Password updated for ${user.email}${user.isSuperAdmin ? ' (super admin)' : ''}.`);
    console.log(`Any lockout cleared. ${count} active session(s) signed out.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
