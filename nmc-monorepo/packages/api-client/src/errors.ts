/**
 * Normalised API error. Always throws `ApiError` so callers can rely on
 * `{status, code, message, details}` regardless of network/parse failures.
 */

export interface ApiErrorPayload {
  status: number;
  code?: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error implements ApiErrorPayload {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = payload.status;
    this.code = payload.code;
    this.details = payload.details;
  }

  /** Convenience: a network/parse error (status 0). */
  static network(message: string, details?: unknown): ApiError {
    return new ApiError({ status: 0, code: 'NETWORK', message, details });
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
