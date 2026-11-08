import { Controller, Get, Header } from '@nestjs/common';
import { StoreStatus } from '@jh/db';
import { DatabaseService } from '../../core/database/database.service.js';

export interface StoreDirectoryEntry {
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  city: string | null;
  currencySymbol: string;
}

/**
 * The published-store directory behind the platform landing page.
 *
 * It reads through `withIdentity`, not `withPlatform`: listing stores is
 * exactly what the identity role is for, and that role cannot read a product,
 * an order or a customer even if this handler asked it to. Only ACTIVE stores
 * appear, so a draft or suspended store is not disclosed.
 */
@Controller('stores')
export class DirectoryController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  async list(): Promise<{ items: StoreDirectoryEntry[] }> {
    const items = await this.db.withIdentity(async (tx) =>
      tx.store.findMany({
        where: { status: StoreStatus.ACTIVE, deletedAt: null },
        orderBy: { name: 'asc' },
        take: 50,
        select: {
          slug: true,
          name: true,
          tagline: true,
          logoUrl: true,
          city: true,
          currencySymbol: true,
        },
      }),
    );

    return { items };
  }
}
