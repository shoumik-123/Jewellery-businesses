import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ErrorCodes } from '@jh/shared/errors';
import { Public, CurrentPrincipal } from '../../core/auth/decorators.js';
import { toPrincipalView, type Principal, type PrincipalView } from '../../core/auth/principal.js';
import { ApiError } from '../../core/http/api-error.js';
import type { AppRequest } from '../../core/http/app-request.js';
import { ZodBodyPipe } from '../../core/http/zod-body.pipe.js';
import { refreshSchema, signInSchema, type RefreshInput, type SignInInput } from './auth.dto.js';
import { AuthService } from './auth.service.js';

/**
 * Session endpoints.
 *
 * The token is returned in the response body rather than set as a cookie
 * here. The browser never calls this API directly - the Next.js app does,
 * server-side, and owns the httpOnly cookie. That keeps session transport in
 * one place and leaves this API usable by a future mobile client, which has
 * no cookie jar.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodBodyPipe(signInSchema)) body: SignInInput,
    @Req() request: AppRequest,
  ): Promise<{ token: string; expiresAt: string; user: PrincipalView }> {
    const result = await this.auth.signIn(body.email, body.password, clientInfo(request));
    return { token: result.token, expiresAt: result.expiresAt.toISOString(), user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodBodyPipe(refreshSchema)) body: RefreshInput,
    @Req() request: AppRequest,
  ): Promise<{ token: string; expiresAt: string; user: PrincipalView }> {
    const result = await this.auth.rotate(body.token, clientInfo(request));
    return { token: result.token, expiresAt: result.expiresAt.toISOString(), user: result.user };
  }

  /**
   * Public because signing out must work even with a token the guard would
   * reject. Being unable to end a session you suspect is compromised is a
   * worse outcome than accepting an already-dead token here.
   */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodBodyPipe(refreshSchema)) body: RefreshInput): Promise<void> {
    await this.auth.signOut(body.token);
  }

  @Get('me')
  me(@CurrentPrincipal() principal: Principal): PrincipalView {
    return toPrincipalView(principal);
  }

  /** Proves the guard rejects anonymous callers. Used by the smoke test. */
  @Get('whoami')
  whoami(@CurrentPrincipal() principal: Principal): { email: string } {
    if (!principal.email) throw new ApiError(ErrorCodes.INTERNAL);
    return { email: principal.email };
  }
}

function clientInfo(request: AppRequest): { userAgent?: string; ipAddress?: string } {
  const userAgent = request.header('user-agent');
  const ip = request.ip;
  return {
    ...(userAgent !== undefined ? { userAgent } : {}),
    ...(ip !== undefined ? { ipAddress: ip } : {}),
  };
}
