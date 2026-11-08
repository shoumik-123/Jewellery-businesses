import { Global, Module } from '@nestjs/common';
import { StoreResolverService } from './store-resolver.service.js';

@Global()
@Module({
  providers: [StoreResolverService],
  exports: [StoreResolverService],
})
export class TenancyModule {}
