import { Inject, Injectable } from '@nestjs/common';
import { hashPassword } from '@jh/security';
import { ErrorCodes } from '@jh/shared/errors';
import { RESERVED_SLUGS, ROLE_KEYS } from '@jh/shared/constants';
import { StoreStatus, TenantStatus, UserStatus, type TransactionClient } from '@jh/db';
import { ENV, type Env } from '../../core/config/env.js';
import { DatabaseService } from '../../core/database/database.service.js';
import { ApiError } from '../../core/http/api-error.js';
import type { CreateStoreInput } from './admin.dto.js';

export interface StoreSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  city: string | null;
  createdAt: string;
  ownerEmail: string | null;
  productCount: number;
}

export interface CreatedStore {
  id: string;
  slug: string;
  name: string;
  storefrontUrl: string;
  owner: { email: string; temporaryPassword: string };
}

/**
 * Platform administration.
 *
 * Shops do not sign themselves up. A Super Admin creates each one here, which
 * is why there is no public registration endpoint anywhere in this API - the
 * absence is the design, not an omission.
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: DatabaseService,
  ) {}

  async listStores(): Promise<StoreSummary[]> {
    const stores = await this.db.withPlatform(async (tx) =>
      tx.store.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          city: true,
          createdAt: true,
          _count: { select: { products: true } },
          members: {
            where: { isOwner: true },
            take: 1,
            select: { user: { select: { email: true } } },
          },
        },
      }),
    );

    return stores.map((store) => ({
      id: store.id,
      slug: store.slug,
      name: store.name,
      status: store.status,
      city: store.city,
      createdAt: store.createdAt.toISOString(),
      ownerEmail: store.members[0]?.user.email ?? null,
      productCount: store._count.products,
    }));
  }

  /**
   * Create a shop and its owner, in one transaction.
   *
   * A shop is not one row. It needs a Tenant to bill, a Store, an owner User,
   * a StoreMember binding the two with the owner role, StoreSettings, and a
   * subdomain. Half of that is not a shop - it is a support ticket. So either
   * all of it exists or none of it does.
   */
  async createStore(input: CreateStoreInput, actorUserId: string): Promise<CreatedStore> {
    const slug = input.slug.trim().toLowerCase();
    const email = input.ownerEmail.trim().toLowerCase();

    if (RESERVED_SLUGS.includes(slug)) {
      throw new ApiError(ErrorCodes.SLUG_TAKEN, `"${slug}" is reserved and cannot be used.`);
    }

    // Generated rather than chosen by the admin: a password typed into a
    // "create shop" form gets reused, emailed in plain text, and written on a
    // sticky note. This one is shown once, and Phase 2's password-reset flow
    // replaces it.
    const temporaryPassword = generatePassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const created = await this.db.withPlatform(async (tx) => {
      await this.assertAvailable(tx, slug, email);

      const ownerRole = await tx.role.findUnique({
        where: { key: ROLE_KEYS.STORE_OWNER },
        select: { id: true },
      });
      if (!ownerRole) {
        throw new ApiError(
          ErrorCodes.INTERNAL,
          'The store_owner role is missing. Run the seed before creating stores.',
        );
      }

      const owner = await tx.user.upsert({
        where: { email },
        create: {
          email,
          firstName: input.ownerFirstName,
          lastName: input.ownerLastName ?? null,
          phone: input.ownerPhone ?? null,
          passwordHash,
          status: UserStatus.ACTIVE,
          // Created by an administrator who already knows who this is, so the
          // address is treated as confirmed. A self-service signup would not
          // get this, which is one more reason there isn't one.
          emailVerifiedAt: new Date(),
        },
        update: {},
        select: { id: true, email: true },
      });

      // One tenant per store for now. The schema allows a tenant to hold
      // several stores, which is what a chain would need; nothing in this
      // flow creates that yet, so the tenant simply mirrors the store.
      const tenant = await tx.tenant.create({
        data: {
          name: input.name,
          slug,
          ownerUserId: owner.id,
          status: TenantStatus.ACTIVE,
          billingEmail: owner.email,
        },
        select: { id: true },
      });

      const store = await tx.store.create({
        data: {
          tenantId: tenant.id,
          name: input.name,
          slug,
          tagline: input.tagline ?? null,
          phone: input.phone ?? null,
          city: input.city ?? null,
          email: owner.email,
          // Live immediately: an admin creating a shop means it should exist.
          status: StoreStatus.ACTIVE,
          publishedAt: new Date(),
        },
        select: { id: true, slug: true, name: true },
      });

      await tx.storeMember.create({
        data: {
          storeId: store.id,
          userId: owner.id,
          roleId: ownerRole.id,
          isOwner: true,
          status: UserStatus.ACTIVE,
          invitedByUserId: actorUserId,
          acceptedAt: new Date(),
        },
      });

      await tx.storeSettings.create({ data: { storeId: store.id } });

      await tx.storeDomain.create({
        data: {
          storeId: store.id,
          hostname: `${slug}.${this.env.ROOT_DOMAIN.split(':')[0]}`,
          type: 'SUBDOMAIN',
          isPrimary: true,
          verifiedAt: new Date(),
        },
      });

      return { store, ownerEmail: owner.email };
    });

    return {
      id: created.store.id,
      slug: created.store.slug,
      name: created.store.name,
      storefrontUrl: `/s/${created.store.slug}`,
      owner: { email: created.ownerEmail, temporaryPassword },
    };
  }

  private async assertAvailable(tx: TransactionClient, slug: string, email: string): Promise<void> {
    const existingStore = await tx.store.findUnique({ where: { slug }, select: { id: true } });
    if (existingStore) {
      throw new ApiError(ErrorCodes.SLUG_TAKEN, `A store already uses the address "${slug}".`);
    }

    const existingOwner = await tx.user.findUnique({
      where: { email },
      select: { id: true, memberships: { where: { isOwner: true }, select: { id: true } } },
    });
    if (existingOwner && existingOwner.memberships.length > 0) {
      throw new ApiError(ErrorCodes.EMAIL_TAKEN, 'That person already owns a store.');
    }
  }
}

/**
 * A readable one-time password with enough entropy to survive being emailed.
 *
 * Ambiguous characters are left out so it can be read aloud over the phone,
 * which is how it will actually be delivered. Drawn from crypto randomness,
 * not Math.random.
 */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  let password = '';
  for (const byte of bytes) {
    password += alphabet[byte % alphabet.length];
  }
  // A symbol and a digit, so it satisfies any policy it is later checked against.
  return `${password.slice(0, 8)}-${password.slice(8)}7!`;
}
