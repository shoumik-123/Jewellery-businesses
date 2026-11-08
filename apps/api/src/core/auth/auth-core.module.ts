import { Global, Module } from '@nestjs/common';
import { AuthContextService } from './auth-context.service.js';

/**
 * Global so the guard registered in main.ts can inject the resolver without
 * every feature module re-importing it.
 */
@Global()
@Module({
  providers: [AuthContextService],
  exports: [AuthContextService],
})
export class AuthCoreModule {}
