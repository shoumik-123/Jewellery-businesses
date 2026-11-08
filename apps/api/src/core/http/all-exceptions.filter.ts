import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AppRequest } from './app-request.js';
import { ErrorCodes, isApiErrorBody, messageForCode, type ApiErrorBody } from '@jh/shared/errors';

/**
 * One response shape for every failure.
 *
 * Unexpected errors are logged in full and reported as a bare INTERNAL: an
 * exception message can carry a connection string, a SQL fragment or a row of
 * someone else's data, and none of that belongs in an HTTP response.
 */
// Widened to number: these are compared against a plain numeric status, and a
// mixed enum/number comparison is a lint error for good reason elsewhere.
const STATUS_INTERNAL: number = HttpStatus.INTERNAL_SERVER_ERROR;
const STATUS_NOT_FOUND: number = HttpStatus.NOT_FOUND;

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<AppRequest>();
    const requestId = typeof request.id === 'string' ? request.id : undefined;

    const { status, body } = this.describe(exception);
    if (requestId) body.error.requestId = requestId;

    if (status >= STATUS_INTERNAL) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} [${requestId ?? 'no-request-id'}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private describe(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      // Thrown by ApiError: already in the contract shape.
      if (isApiErrorBody(payload)) {
        return { status: exception.getStatus(), body: payload };
      }

      // Thrown by Nest itself (404 for an unmatched route, and so on).
      const status = exception.getStatus();
      const code = status === STATUS_NOT_FOUND ? ErrorCodes.NOT_FOUND : ErrorCodes.BAD_REQUEST;
      return {
        status,
        body: { error: { code, message: exception.message || messageForCode(code) } },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: ErrorCodes.INTERNAL,
          message: messageForCode(ErrorCodes.INTERNAL),
        },
      },
    };
  }
}
