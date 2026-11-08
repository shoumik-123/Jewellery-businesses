import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCodes } from '@jh/shared/errors';
import { ApiError } from '../http/api-error.js';
import type { AppRequest } from '../http/app-request.js';
import { AuthContextService } from './auth-context.service.js';
import { IS_PUBLIC, PLATFORM_PERMISSION } from './decorators.js';

/**
 * Registered globally, so every route requires a session unless it is marked
 * `@Public()`.
 *
 * The default direction matters more than the mechanism. With opt-in
 * protection, forgetting a decorator silently publishes an endpoint; with
 * opt-out, forgetting one breaks it loudly in development. A missing guard
 * should be a failing test, never a quiet data leak.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authContext: AuthContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [handler, controller]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = readBearer(request.header('authorization'));

    if (!token) {
      throw new ApiError(ErrorCodes.UNAUTHENTICATED, 'Sign in to continue.');
    }

    const principal = await this.authContext.resolve(token);
    if (!principal) {
      // One message for expired, revoked, rotated-away and never-existed.
      // Telling the client which one narrows an attacker's search.
      throw new ApiError(ErrorCodes.UNAUTHENTICATED, 'Your session is no longer valid.');
    }

    request.principal = principal;
    void this.authContext.touch(principal.sessionId);

    const required = this.reflector.getAllAndOverride<string>(PLATFORM_PERMISSION, [
      handler,
      controller,
    ]);
    if (required !== undefined && !principal.platformPermissions.has(required)) {
      throw new ApiError(ErrorCodes.PERMISSION_DENIED);
    }

    return true;
  }
}

/**
 * Parses `Authorization: Bearer <token>`.
 *
 * The browser never sends this header: the web app keeps the session in an
 * httpOnly cookie it owns and attaches the token server-side. The header form
 * is what lets a future mobile client, or a server-to-server integration, use
 * the same API without a cookie jar.
 */
function readBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
