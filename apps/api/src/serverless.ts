import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';

/**
 * The same API, as a serverless function.
 *
 * Three things make this different from `main.ts`, and each one is a bug if
 * it is missed:
 *
 *  1. `app.init()`, never `app.listen()`. The platform owns the socket; a
 *     function that binds a port is a function that times out on every call.
 *
 *  2. The application is built once per container and reused. Building Nest
 *     per request would also build a new database pool per request, and a few
 *     hundred requests would exhaust the connection limit of any managed
 *     Postgres. The promise — not the resolved app — is what gets cached, so
 *     concurrent cold invocations wait on one build instead of racing to make
 *     several.
 *
 *  3. A failed build is not cached. Keeping a rejected promise would turn one
 *     bad cold start (a database asleep, a secret not yet propagated) into a
 *     container that answers 500 for its entire lifetime.
 *
 * Environment variables come from the platform, so there is no dotenv call
 * here; `loadDotenv` is for a developer's machine.
 *
 * On tenancy: every statement still runs through `withTenant`, which issues
 * `SET LOCAL ROLE` and sets the store context inside a transaction. `SET
 * LOCAL` is transaction-scoped, so this is safe behind a transaction-mode
 * connection pooler (Neon's pooled endpoint, PgBouncer) — a connection handed
 * back to the pooler cannot carry one shop's context into another shop's
 * query. Point DATABASE_URL at the pooled endpoint and DIRECT_DATABASE_URL at
 * the direct one, which migrations need.
 */

let building: Promise<Express> | null = null;

async function build(): Promise<Express> {
  const instance = express();

  const app = await NestFactory.create(AppModule, new ExpressAdapter(instance), {
    bufferLogs: true,
  });

  configureApp(app, { shutdownHooks: false });
  await app.init();

  return instance;
}

function server(): Promise<Express> {
  building ??= build().catch((error: unknown) => {
    // Let the next invocation try again rather than inheriting this failure.
    building = null;
    throw error;
  });
  return building;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  (await server())(request, response);
}
