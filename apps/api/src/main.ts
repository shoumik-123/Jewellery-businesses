import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ENV, type Env } from './core/config/env.js';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './core/auth/auth.guard.js';
import { AuthContextService } from './core/auth/auth-context.service.js';
import { AllExceptionsFilter } from './core/http/all-exceptions.filter.js';
import { loadDotenv } from './core/config/load-dotenv.js';

async function bootstrap(): Promise<void> {
  // First, because the config provider reads process.env. Placing it here
  // rather than above the imports is deliberate: ES module imports are all
  // evaluated before any statement in this file, so an import-position call
  // would buy nothing and only look like it did.
  loadDotenv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const env = app.get<Env>(ENV);

  app.setGlobalPrefix('v1');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // The storefront is read by the web app from a different origin in
  // development. Credentials are enabled because the authenticated surfaces in
  // Phase 2 use cookies; an explicit origin list is required for that to be
  // legal, which is why CORS_ORIGINS is never a wildcard.
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Store-Slug', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });

  // No global ValidationPipe: this project validates with Zod (see
  // ZodQueryPipe and @jh/shared/schemas), so class-validator decorators are
  // not part of the stack and a DTO class would be a second, divergent source
  // of truth about what a request may contain.
  // Global, so a route is protected unless it says `@Public()`. Opt-out
  // rather than opt-in: forgetting the decorator then breaks the endpoint
  // loudly instead of publishing it quietly.
  app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(AuthContextService)));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await app.listen(env.PORT);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${env.PORT}/v1  (${env.APP_ENV})`);
}

void bootstrap();
