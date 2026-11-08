import { HttpException } from '@nestjs/common';
import {
  ErrorCodes,
  messageForCode,
  statusForCode,
  type ApiErrorBody,
  type ErrorCode,
} from '@jh/shared/errors';

/**
 * Every deliberate failure in the API is one of these, so the HTTP status and
 * the machine-readable code can never drift apart: both are derived from the
 * single code table in @jh/shared/errors.
 */
export class ApiError extends HttpException {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    const body: ApiErrorBody = {
      error: {
        code,
        message: message ?? messageForCode(code),
        ...(details ? { details } : {}),
      },
    };
    super(body, statusForCode(code));
    this.code = code;
  }

  /**
   * Used wherever a resource is absent *or* belongs to another tenant. The two
   * must be indistinguishable, otherwise a 403 confirms that someone else's
   * record exists — the enumeration leak described in docs/03-multi-tenancy.md.
   */
  static notFound(message?: string): ApiError {
    return new ApiError(ErrorCodes.NOT_FOUND, message);
  }
}
