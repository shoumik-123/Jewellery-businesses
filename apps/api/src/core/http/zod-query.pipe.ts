import { Injectable, type PipeTransform } from '@nestjs/common';
import { ErrorCodes } from '@jh/shared/errors';
import type { ZodType } from 'zod';
import { ApiError } from './api-error.js';

/**
 * Validates and coerces a query string against a Zod schema, turning a failure
 * into the platform's VALIDATION_FAILED body rather than a stack trace. The
 * parsed result replaces the raw input, so a handler never sees a string where
 * it expects a number.
 */
@Injectable()
export class ZodQueryPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;

    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      (details[key] ??= []).push(issue.message);
    }

    throw new ApiError(ErrorCodes.VALIDATION_FAILED, 'Invalid query parameters.', details);
  }
}
