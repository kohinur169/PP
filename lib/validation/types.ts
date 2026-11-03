// path: lib/validation/types.ts

export interface InvalidParam {
  name: string;
  reason: string;
  code?: string | undefined;
}

/**
 * Standard RFC 7807 Problem Details JSON format for HTTP API error responses.
 */
export interface Rfc7807ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string | undefined;
  invalidParams?: InvalidParam[] | undefined;
  correlationId?: string | undefined;
  timestamp: string;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; problem: Rfc7807ProblemDetails };
