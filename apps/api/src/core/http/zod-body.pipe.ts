import { Injectable, type PipeTransform } from '@nestjs/common';
import { ErrorCodes } from '@jh/shared/errors';
import type { ZodType } from 'zod';
import { ApiError } from './api-error.js';

/**
 * Validates a JSON request body against a Zod schema. The parsed value
 * replaces the raw input, so a handler never sees an unvalidated field.
 */
@Injectable()
export class ZodBodyPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;

    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      (details[key] ??= []).push(issue.message);
    }

    throw new ApiError(ErrorCodes.VALIDATION_FAILED, 'Check the details and try again.', details);
  }
}
