import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  /** Liveness: the process is up. Deliberately touches nothing. */
  @Get()
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  /**
   * Readiness: the process can actually serve. It proves the pool works and
   * that `SET LOCAL ROLE app_identity` is grantable, which is the first thing
   * to break when the database roles have not been provisioned.
   */
  @Get('ready')
  async ready(): Promise<{ status: 'ready'; database: 'up' }> {
    await this.db.withIdentity(async (tx) => tx.$queryRaw`SELECT 1`);
    return { status: 'ready', database: 'up' };
  }
}
