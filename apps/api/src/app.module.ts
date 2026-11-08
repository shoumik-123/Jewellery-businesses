import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from './core/config/config.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { TenancyModule } from './core/tenancy/tenancy.module.js';
import { RequestIdMiddleware } from './core/http/request-id.middleware.js';
import { DirectoryModule } from './modules/directory/directory.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { StorefrontModule } from './modules/storefront/storefront.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    TenancyModule,
    HealthModule,
    DirectoryModule,
    StorefrontModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*splat');
  }
}
