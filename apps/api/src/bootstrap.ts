import { Logger, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import helmet from 'helmet';
import { AuthContextService } from './core/auth/auth-context.service.js';
import { AuthGuard } from './core/auth/auth.guard.js';
import { ENV, type Env } from './core/config/env.js';
import { AllExceptionsFilter } from './core/http/all-exceptions.filter.js';

/**
 * Everything that must be true of the application before it serves a request,
 * in one place.
 *
 * It exists because there are now two ways in: `main.ts` runs a long-lived
 * server, and `serverless.ts` runs the same application as a function. If each
 * configured itself, the day someone adds a guard to one and not the other is
 * the day the serverless deployment quietly serves unauthenticated requests.
 * A shared function cannot be half-applied.
 */
export function configureApp(
  app: INestApplication,
  options: { shutdownHooks: boolean } = { shutdownHooks: true },
): Env {
  const env = app.get<Env>(ENV);

  app.setGlobalPrefix('v1');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // The web app calls this API from a different origin. Credentials are
  // enabled because the authenticated surfaces use cookies, and an explicit
  // origin list is required for that to be legal — which is why CORS_ORIGINS
  // is never a wildcard.
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
  //
  // The guard is global, so a route is protected unless it says `@Public()`.
  // Opt-out rather than opt-in: forgetting the decorator then breaks the
  // endpoint loudly instead of publishing it quietly.
  app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(AuthContextService)));
  app.useGlobalFilters(new AllExceptionsFilter());

  // Only for a process we own. In a serverless function the platform owns the
  // lifecycle, and registering signal handlers on every cold start adds
  // listeners to a process that will be frozen rather than shut down.
  if (options.shutdownHooks) app.enableShutdownHooks();

  Logger.log(`Configured for ${env.APP_ENV} (${env.NODE_ENV})`, 'Bootstrap');
  return env;
}
