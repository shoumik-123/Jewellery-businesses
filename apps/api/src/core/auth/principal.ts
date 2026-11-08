/**
 * Who is making this request.
 *
 * Assembled once per request by AuthContextService and never trusted from the
 * client. A principal carries its effective permissions already resolved, so
 * a guard is a set lookup rather than another database round trip.
 */

export interface StoreMembership {
  storeId: string;
  storeSlug: string;
  storeName: string;
  roleKey: string;
  roleName: string;
  isOwner: boolean;
  /** Effective store permissions: role grants, plus ALLOW, minus DENY. */
  permissions: ReadonlySet<string>;
}

export interface Principal {
  sessionId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string | null;
  isSuperAdmin: boolean;
  /** Platform-scope permissions. Empty for an ordinary store user. */
  platformPermissions: ReadonlySet<string>;
  /** Every store this user belongs to, keyed by storeId. */
  memberships: ReadonlyMap<string, StoreMembership>;
}

/**
 * Does this principal hold `permission` in `storeId`?
 *
 * A super admin is deliberately NOT allowed through here. Platform staff
 * reaching into a tenant's data is a separate, audited path
 * (docs/03-multi-tenancy.md section 8), not an implicit override on every
 * store endpoint - otherwise one compromised admin account is every store.
 */
export function hasStorePermission(
  principal: Principal,
  storeId: string,
  permission: string,
): boolean {
  return principal.memberships.get(storeId)?.permissions.has(permission) ?? false;
}

export function hasPlatformPermission(principal: Principal, permission: string): boolean {
  return principal.platformPermissions.has(permission);
}

/** The shape returned to the client. Never includes the session token. */
export interface PrincipalView {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  isSuperAdmin: boolean;
  platformPermissions: string[];
  stores: {
    storeId: string;
    slug: string;
    name: string;
    role: string;
    roleName: string;
    isOwner: boolean;
    permissions: string[];
  }[];
}

export function toPrincipalView(principal: Principal): PrincipalView {
  return {
    id: principal.userId,
    email: principal.email,
    firstName: principal.firstName,
    lastName: principal.lastName,
    isSuperAdmin: principal.isSuperAdmin,
    platformPermissions: [...principal.platformPermissions].sort(),
    stores: [...principal.memberships.values()]
      .map((membership) => ({
        storeId: membership.storeId,
        slug: membership.storeSlug,
        name: membership.storeName,
        role: membership.roleKey,
        roleName: membership.roleName,
        isOwner: membership.isOwner,
        permissions: [...membership.permissions].sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
