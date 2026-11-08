import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  familyId as newFamilyId,
  hashToken,
  sessionToken,
  verifyAgainstDummy,
  verifyPassword,
} from '@jh/security';
import { ErrorCodes } from '@jh/shared/errors';
import { UserStatus, type TransactionClient } from '@jh/db';
import { ENV, type Env } from '../../core/config/env.js';
import { DatabaseService } from '../../core/database/database.service.js';
import { ApiError } from '../../core/http/api-error.js';
import { AuthContextService } from '../../core/auth/auth-context.service.js';
import { toPrincipalView, type PrincipalView } from '../../core/auth/principal.js';

export interface SignInResult {
  token: string;
  expiresAt: Date;
  user: PrincipalView;
}

interface ClientInfo {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: DatabaseService,
    private readonly authContext: AuthContextService,
  ) {}

  /**
   * Sign in with email and password.
   *
   * Three things this does deliberately:
   *
   * 1. **Every failure looks identical.** Unknown email, wrong password,
   *    locked, suspended, no password set - all return the same
   *    CREDENTIALS_INVALID. Distinguishing them turns the login form into a
   *    tool for discovering who has an account here.
   *
   * 2. **Unknown emails still pay for a hash.** `verifyAgainstDummy` runs
   *    argon2 against a throwaway hash so a missing user takes about as long
   *    as a wrong password. Without it, response time answers the question
   *    the error message refuses to.
   *
   * 3. **Failures are counted and lock the account.** The counter is per
   *    user, and the lock is a timestamp rather than a flag, so it expires on
   *    its own and never needs an unlock job.
   */
  async signIn(email: string, password: string, client: ClientInfo): Promise<SignInResult> {
    const normalised = email.trim().toLowerCase();

    const outcome = await this.db.withIdentity(async (tx) => {
      const user = await tx.user.findUnique({
        where: { email: normalised },
        select: {
          id: true,
          passwordHash: true,
          status: true,
          deletedAt: true,
          failedLogins: true,
          lockedUntil: true,
        },
      });

      if (!user || user.deletedAt !== null || user.passwordHash === null) {
        await verifyAgainstDummy(password);
        return { ok: false } as const;
      }

      if (user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now()) {
        await verifyAgainstDummy(password);
        return { ok: false } as const;
      }

      const correct = await verifyPassword(user.passwordHash, password);

      if (!correct) {
        await this.recordFailure(tx, user.id, user.failedLogins);
        return { ok: false } as const;
      }

      // A correct password still does not get in if the account is not
      // active. Checked after verification so that a suspended account is
      // indistinguishable from a wrong password.
      if (user.status !== UserStatus.ACTIVE) {
        return { ok: false } as const;
      }

      const issued = await this.createSession(tx, user.id, client);
      await tx.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
      });

      return { ok: true, ...issued } as const;
    });

    if (!outcome.ok) {
      throw new ApiError(
        ErrorCodes.CREDENTIALS_INVALID,
        'That email and password do not match an account.',
      );
    }

    const principal = await this.authContext.resolve(outcome.token);
    if (!principal) {
      // Should be unreachable: the session was created moments ago.
      throw new ApiError(ErrorCodes.INTERNAL);
    }

    return { token: outcome.token, expiresAt: outcome.expiresAt, user: toPrincipalView(principal) };
  }

  /**
   * Rotate a session: issue a new token and retire the current one.
   *
   * If a token that has already been rotated away is presented, that is the
   * signature of a stolen token being replayed - the legitimate client has
   * the newer one. The entire family is revoked, which signs out both the
   * attacker and the victim. Being signed out is the correct outcome: the
   * alternative is leaving an intruder with a working session.
   */
  async rotate(rawToken: string, client: ClientInfo): Promise<SignInResult> {
    const refreshHash = hashToken(rawToken);

    const outcome = await this.db.withIdentity(async (tx) => {
      const current = await tx.session.findUnique({
        where: { refreshHash },
        select: {
          id: true,
          userId: true,
          familyId: true,
          expiresAt: true,
          revokedAt: true,
          replacedById: true,
        },
      });

      if (!current?.userId) return { ok: false } as const;

      if (current.replacedById !== null) {
        await tx.session.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'REFRESH_REUSE_DETECTED' },
        });
        return { ok: false, reuse: true, familyId: current.familyId } as const;
      }

      if (current.revokedAt !== null || current.expiresAt.getTime() <= Date.now()) {
        return { ok: false } as const;
      }

      const issued = await this.createSession(tx, current.userId, client, current.familyId);
      await tx.session.update({
        where: { id: current.id },
        data: { replacedById: issued.sessionId, revokedAt: new Date(), revokedReason: 'ROTATED' },
      });

      return { ok: true, ...issued } as const;
    });

    if (!outcome.ok) {
      if ('reuse' in outcome && outcome.reuse) {
        this.logger.warn(
          `Refresh token reuse detected; revoked session family ${outcome.familyId}`,
        );
      }
      throw new ApiError(ErrorCodes.TOKEN_INVALID, 'Your session is no longer valid.');
    }

    const principal = await this.authContext.resolve(outcome.token);
    if (!principal) throw new ApiError(ErrorCodes.INTERNAL);

    return { token: outcome.token, expiresAt: outcome.expiresAt, user: toPrincipalView(principal) };
  }

  /** Sign out. Revokes only this session, not the user's other devices. */
  async signOut(rawToken: string): Promise<void> {
    const refreshHash = hashToken(rawToken);
    await this.db.withIdentity(async (tx) =>
      tx.session.updateMany({
        where: { refreshHash, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'SIGNED_OUT' },
      }),
    );
  }

  private async createSession(
    tx: TransactionClient,
    userId: string,
    client: ClientInfo,
    family?: string,
  ): Promise<{ sessionId: string; token: string; expiresAt: Date }> {
    const token = sessionToken();
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const session = await tx.session.create({
      data: {
        userId,
        // Only the hash is stored. The raw token exists in this process and
        // in the client, and nowhere else.
        refreshHash: hashToken(token),
        familyId: family ?? newFamilyId(),
        expiresAt,
        ...(client.userAgent !== undefined ? { userAgent: client.userAgent.slice(0, 500) } : {}),
        ...(client.ipAddress !== undefined ? { ipAddress: client.ipAddress.slice(0, 64) } : {}),
      },
      select: { id: true },
    });

    return { sessionId: session.id, token, expiresAt };
  }

  private async recordFailure(
    tx: TransactionClient,
    userId: string,
    currentFailures: number,
  ): Promise<void> {
    const failures = currentFailures + 1;
    const locked = failures >= this.env.LOGIN_MAX_ATTEMPTS;

    await tx.user.update({
      where: { id: userId },
      data: {
        failedLogins: locked ? 0 : failures,
        ...(locked
          ? { lockedUntil: new Date(Date.now() + this.env.LOGIN_LOCKOUT_MINUTES * 60 * 1000) }
          : {}),
      },
    });
  }
}
