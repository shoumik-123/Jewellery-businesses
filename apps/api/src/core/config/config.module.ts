import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv, type Env } from './env.js';

/**
 * Global so that no module has to re-import it, and so there is exactly one
 * parsed copy of the configuration in the process.
 */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
