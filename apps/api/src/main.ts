import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { loadDotenv } from './core/config/load-dotenv.js';

/**
 * The long-lived server. This is how the API runs locally and on any host that
 * gives it a process of its own.
 *
 * The serverless entry point is `serverless.ts`; both configure the
 * application through the same `configureApp`, so neither can drift into
 * serving requests the other would refuse.
 */
async function bootstrap(): Promise<void> {
  // First, because the config provider reads process.env. Placing it here
  // rather than above the imports is deliberate: ES module imports are all
  // evaluated before any statement in this file, so an import-position call
  // would buy nothing and only look like it did.
  loadDotenv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const env = configureApp(app);

  await app.listen(env.PORT);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${env.PORT}/v1  (${env.APP_ENV})`);
}

void bootstrap();
