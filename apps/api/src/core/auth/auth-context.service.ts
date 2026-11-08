import { Injectable } from '@nestjs/common';
import { hashToken } from '@jh/security';
import { UserStatus } from '@jh/db';
import { DatabaseService } from '../database/database.service.js';
import type { Principal, StoreMembership } from './principal.js';

/**
 * Turns a session token into a principal.
 *
 * Runs through `withIdentity`: resolving who someone is happens before any
 * tenant context exists, and the identity role is granted only the identity
 * and routing tables. A bug in this file therefore cannot read a product, an
 * order or a customer (docs/03-multi-tenancy.md section 4).
 *
 * The raw token never reaches the database. Only its SHA-256 is stored and
 * compared, so a dump of the Session table cannot be replayed as a login.
 */
@Injectable()
export class AuthContextService {
  constructor(private readonly db: DatabaseService) {}

  async resolve(rawToken: string): Promise<Principal | null> {
    const refreshHash = hashToken(rawToken);

    return this.db.withIdentity(async (tx) => {
      const session = await tx.session.findUnique({
        where: { refreshHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          revokedAt: true,
          replacedById: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              status: true,
              isSuperAdmin: true,
              deletedAt: true,
              platformRoles: {
                select: {
                  role: {
                    select: { permissions: { select: { permission: { select: { key: true } } } } },
                  },
                },
              },
              memberships: {
                where: { deletedAt: null, status: UserStatus.ACTIVE },
                select: {
                  storeId: true,
                  isOwner: true,
                  store: { select: { slug: true, name: true, deletedAt: true } },
                  role: {
                    select: {
                      key: true,
                      name: true,
                      permissions: { select: { permission: { select: { key: true } } } },
                    },
                  },
                  permissions: {
                    select: { effect: true, permission: { select: { key: true } } },
                  },
                },
              },
            },
          },
        },
      });

      // A customer session has no userId; it is not a principal for the
      // dashboard, and must not be mistaken for one.
      if (!session?.user) return null;
      if (session.revokedAt !== null) return null;
      if (session.replacedById !== null) return null;
      if (session.expiresAt.getTime() <= Date.now()) return null;

      const user = session.user;
      if (user.deletedAt !== null) return null;
      if (user.status !== UserStatus.ACTIVE) return null;

      const platformPermissions = new Set<string>();
      for (const assignment of user.platformRoles) {
        for (const grant of assignment.role.permissions) {
          platformPermissions.add(grant.permission.key);
        }
      }

      const memberships = new Map<string, StoreMembership>();
      for (const membership of user.memberships) {
        if (membership.store.deletedAt !== null) continue;

        // Role grants first, then per-member overrides. DENY is applied last
        // and always wins, so revoking one capability from one person never
        // depends on the order rows happen to come back in.
        const permissions = new Set<string>();
        for (const grant of membership.role.permissions) {
          permissions.add(grant.permission.key);
        }
        for (const override of membership.permissions) {
          if (override.effect === 'ALLOW') permissions.add(override.permission.key);
        }
        for (const override of membership.permissions) {
          if (override.effect === 'DENY') permissions.delete(override.permission.key);
        }

        memberships.set(membership.storeId, {
          storeId: membership.storeId,
          storeSlug: membership.store.slug,
          storeName: membership.store.name,
          roleKey: membership.role.key,
          roleName: membership.role.name,
          isOwner: membership.isOwner,
          permissions,
        });
      }

      return {
        sessionId: session.id,
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isSuperAdmin: user.isSuperAdmin,
        platformPermissions,
        memberships,
      };
    });
  }

  /** Records that a session was used. Best effort: never fails a request. */
  async touch(sessionId: string): Promise<void> {
    try {
      await this.db.withIdentity(async (tx) =>
        tx.session.update({ where: { id: sessionId }, data: { lastUsedAt: new Date() } }),
      );
    } catch {
      // A failed bookkeeping write must not turn a good request into a 500.
    }
  }
}
