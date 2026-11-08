/**
 * One error vocabulary for the whole platform.
 *
 * The API returns `{ error: { code, message, details?, requestId } }` and the
 * UI maps the code to a message and an action. Codes are stable contract;
 * messages are allowed to change.
 */

export const ErrorCodes = {
  // 400
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  COUPON_INVALID: 'COUPON_INVALID',
  CART_PRICE_CHANGED: 'CART_PRICE_CHANGED',
  CART_EMPTY: 'CART_EMPTY',
  BAD_REQUEST: 'BAD_REQUEST',

  // 401
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  REFRESH_REUSED: 'REFRESH_REUSED',
  CREDENTIALS_INVALID: 'CREDENTIALS_INVALID',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',

  // 403
  FORBIDDEN: 'FORBIDDEN',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  STORE_MISMATCH: 'STORE_MISMATCH',
  STORE_SUSPENDED: 'STORE_SUSPENDED',
  STORE_NOT_PUBLISHED: 'STORE_NOT_PUBLISHED',
  CUSTOMER_BLOCKED: 'CUSTOMER_BLOCKED',

  // 404 — also returned for another tenant's resource, so existence does not leak
  NOT_FOUND: 'NOT_FOUND',

  // 409
  CONFLICT: 'CONFLICT',
  SLUG_TAKEN: 'SLUG_TAKEN',
  SKU_TAKEN: 'SKU_TAKEN',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  IDEMPOTENT_REPLAY_MISMATCH: 'IDEMPOTENT_REPLAY_MISMATCH',
  CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',

  // 402
  PLAN_LIMIT_EXCEEDED: 'PLAN_LIMIT_EXCEEDED',
  FEATURE_NOT_IN_PLAN: 'FEATURE_NOT_IN_PLAN',
  SUBSCRIPTION_PAST_DUE: 'SUBSCRIPTION_PAST_DUE',
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
  DOWNGRADE_BLOCKED: 'DOWNGRADE_BLOCKED',

  // 422
  UNPROCESSABLE: 'UNPROCESSABLE',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_NOT_VERIFIED: 'PAYMENT_NOT_VERIFIED',
  REFUND_EXCEEDS_PAID: 'REFUND_EXCEEDS_PAID',

  // 429
  RATE_LIMITED: 'RATE_LIMITED',

  // 5xx
  INTERNAL: 'INTERNAL',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  INVALID_STATE_TRANSITION: 400,
  COUPON_INVALID: 400,
  CART_PRICE_CHANGED: 400,
  CART_EMPTY: 400,
  BAD_REQUEST: 400,

  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 401,
  REFRESH_REUSED: 401,
  CREDENTIALS_INVALID: 401,
  ACCOUNT_LOCKED: 401,
  EMAIL_NOT_VERIFIED: 401,

  FORBIDDEN: 403,
  PERMISSION_DENIED: 403,
  STORE_MISMATCH: 403,
  STORE_SUSPENDED: 403,
  STORE_NOT_PUBLISHED: 403,
  CUSTOMER_BLOCKED: 403,

  NOT_FOUND: 404,

  CONFLICT: 409,
  SLUG_TAKEN: 409,
  SKU_TAKEN: 409,
  EMAIL_TAKEN: 409,
  INSUFFICIENT_STOCK: 409,
  IDEMPOTENT_REPLAY_MISMATCH: 409,
  CONCURRENT_MODIFICATION: 409,

  PLAN_LIMIT_EXCEEDED: 402,
  FEATURE_NOT_IN_PLAN: 402,
  SUBSCRIPTION_PAST_DUE: 402,
  SUBSCRIPTION_REQUIRED: 402,
  DOWNGRADE_BLOCKED: 402,

  UNPROCESSABLE: 422,
  PAYMENT_FAILED: 422,
  PAYMENT_NOT_VERIFIED: 422,
  REFUND_EXCEEDS_PAID: 422,

  RATE_LIMITED: 429,

  INTERNAL: 500,
  PROVIDER_UNAVAILABLE: 502,
  NOT_IMPLEMENTED: 501,
};

/** Default user-facing copy. Deliberately free of internal detail. */
export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: 'Please check the highlighted fields and try again.',
  INVALID_STATE_TRANSITION: 'That change is not allowed from the current status.',
  COUPON_INVALID: 'This coupon cannot be applied to your order.',
  CART_PRICE_CHANGED: 'Some items in your cart have changed. Please review and confirm.',
  CART_EMPTY: 'Your cart is empty.',
  BAD_REQUEST: 'The request could not be processed.',

  UNAUTHENTICATED: 'Please sign in to continue.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  TOKEN_INVALID: 'Your session is no longer valid. Please sign in again.',
  REFRESH_REUSED: 'For your security we signed you out of all devices. Please sign in again.',
  CREDENTIALS_INVALID: 'Incorrect email or password.',
  ACCOUNT_LOCKED: 'Too many attempts. Please try again later.',
  EMAIL_NOT_VERIFIED: 'Please verify your email address first.',

  FORBIDDEN: 'You do not have access to this.',
  PERMISSION_DENIED: 'You do not have permission to do this.',
  STORE_MISMATCH: 'This request does not belong to the selected store.',
  STORE_SUSPENDED: 'This store is currently unavailable.',
  STORE_NOT_PUBLISHED: 'This store has not opened yet.',
  CUSTOMER_BLOCKED: 'This account cannot place orders.',

  NOT_FOUND: 'We could not find what you were looking for.',

  CONFLICT: 'That conflicts with something that already exists.',
  SLUG_TAKEN: 'That address is already taken. Please choose another.',
  SKU_TAKEN: 'That SKU is already used by another product in this store.',
  EMAIL_TAKEN: 'An account with this email already exists.',
  INSUFFICIENT_STOCK: 'Not enough stock is available for one or more items.',
  IDEMPOTENT_REPLAY_MISMATCH: 'This request was already submitted with different details.',
  CONCURRENT_MODIFICATION: 'Someone else changed this while you were editing. Please reload.',

  PLAN_LIMIT_EXCEEDED: 'You have reached a limit on your current plan.',
  FEATURE_NOT_IN_PLAN: 'This feature is not included in your current plan.',
  SUBSCRIPTION_PAST_DUE: 'Your subscription payment is overdue.',
  SUBSCRIPTION_REQUIRED: 'An active subscription is required.',
  DOWNGRADE_BLOCKED: 'Your current usage exceeds the limits of the selected plan.',

  UNPROCESSABLE: 'We could not complete that action.',
  PAYMENT_FAILED: 'The payment did not complete.',
  PAYMENT_NOT_VERIFIED: 'We could not verify this payment with the provider.',
  REFUND_EXCEEDS_PAID: 'A refund cannot exceed the amount paid.',

  RATE_LIMITED: 'Too many requests. Please slow down and try again.',

  INTERNAL: 'Something went wrong on our side. Please try again.',
  PROVIDER_UNAVAILABLE: 'A third-party service is unavailable. Please try again shortly.',
  NOT_IMPLEMENTED: 'This is not available yet.',
};

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const err = (value as { error?: unknown }).error;
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && code in ERROR_STATUS;
}

export function statusForCode(code: ErrorCode): number {
  return ERROR_STATUS[code] ?? 500;
}

export function messageForCode(code: ErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.INTERNAL;
}
