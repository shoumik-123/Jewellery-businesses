import { Inject, Injectable } from '@nestjs/common';
import { StoreStatus } from '@jh/db';
import { ENV, type Env } from '../config/env.js';
import { DatabaseService } from '../database/database.service.js';
import { ApiError } from '../http/api-error.js';

export interface ResolvedStore {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  status: StoreStatus;
}

interface CacheEntry {
  value: ResolvedStore | null;
  expiresAt: number;
}

/**
 * Turns an incoming hostname into a store.
 *
 * This runs through `withIdentity`, not `withPlatform`: resolution happens
 * before any tenant context exists, but the identity role is granted only the
 * routing and identity tables, so a bug here cannot read a product, an order
 * or a customer. See docs/03-multi-tenancy.md section 4.
 *
 * The cache is in-process and short-lived. Redis replaces it in Phase 6 — the
 * interface does not change, and CACHE_TTL_STORE_HOST already exists in the
 * environment reference for that reason. An in-process cache is correct but
 * not shared, so each API instance pays its own first lookup.
 */
@Injectable()
export class StoreResolverService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 60_000;
  private readonly rootDomain: string;

  constructor(
    @Inject(ENV) env: Env,
    private readonly db: DatabaseService,
  ) {
    this.rootDomain = env.ROOT_DOMAIN.toLowerCase();
  }

  /**
   * Extract the store slug from a Host header, if the host is a subdomain of
   * ROOT_DOMAIN. Returns null for the root domain itself and for any host that
   * does not sit under it — a custom domain, which is looked up in the
   * database instead.
   */
  slugFromHost(host: string | undefined): string | null {
    if (!host) return null;

    const normalised = host.trim().toLowerCase();
    if (normalised === this.rootDomain) return null;

    const suffix = `.${this.rootDomain}`;
    if (!normalised.endsWith(suffix)) return null;

    const label = normalised.slice(0, -suffix.length);
    // Only a single label is a store subdomain; `a.b.root` is not.
    if (label.length === 0 || label.includes('.')) return null;
    return label;
  }

  /** Resolve by slug, returning null when there is no published store. */
  async findBySlug(slug: string): Promise<ResolvedStore | null> {
    const key = `slug:${slug.toLowerCase()}`;
    const cached = this.read(key);
    if (cached !== undefined) return cached;

    const store = await this.db.withIdentity(async (tx) => {
      return tx.store.findFirst({
        where: { slug: slug.toLowerCase(), deletedAt: null },
        select: { id: true, tenantId: true, slug: true, name: true, status: true },
      });
    });

    return this.write(key, store);
  }

  /** Resolve by hostname: a verified custom domain, or a platform subdomain. */
  async findByHost(host: string | undefined): Promise<ResolvedStore | null> {
    if (!host) return null;

    const hostname = host.trim().toLowerCase().split(':')[0] ?? '';
    const key = `host:${hostname}`;
    const cached = this.read(key);
    if (cached !== undefined) return cached;

    const store = await this.db.withIdentity(async (tx) => {
      const domain = await tx.storeDomain.findFirst({
        // A domain only routes once it is verified; an unverified record is a
        // claim, not a fact.
        where: { hostname, verifiedAt: { not: null } },
        select: {
          store: {
            select: { id: true, tenantId: true, slug: true, name: true, status: true },
          },
        },
      });
      return domain?.store ?? null;
    });

    if (store) return this.write(key, store);

    const slug = this.slugFromHost(host);
    return slug ? this.findBySlug(slug) : this.write(key, null);
  }

  /**
   * Resolve a storefront request, or fail. A store that exists but is not
   * ACTIVE is reported as not found: whether a draft or suspended store exists
   * is not something the public internet is entitled to learn.
   */
  async requirePublishedStore(options: {
    host?: string | undefined;
    slug?: string | undefined;
  }): Promise<ResolvedStore> {
    const store = options.slug
      ? await this.findBySlug(options.slug)
      : await this.findByHost(options.host);

    if (!store || store.status !== StoreStatus.ACTIVE) {
      throw ApiError.notFound('No published store was found for this address.');
    }

    return store;
  }

  private read(key: string): ResolvedStore | null | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private write(key: string, value: ResolvedStore | null): ResolvedStore | null {
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }
}
