import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuthCoreModule } from './core/auth/auth-core.module.js';
import { ConfigModule } from './core/config/config.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { TenancyModule } from './core/tenancy/tenancy.module.js';
import { RequestIdMiddleware } from './core/http/request-id.middleware.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogueModule } from './modules/catalogue/catalogue.module.js';
import { DirectoryModule } from './modules/directory/directory.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { StorefrontModule } from './modules/storefront/storefront.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthCoreModule,
    TenancyModule,
    AuthModule,
    AdminModule,
    CatalogueModule,
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
