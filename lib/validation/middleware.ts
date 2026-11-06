// path: lib/validation/middleware.ts
import { z } from 'zod';
import type { Rfc7807ProblemDetails, InvalidParam, ValidationResult } from './types';

/**
 * Transforms a ZodError into an RFC 7807 Problem Details object.
 */
export function formatZodErrorToRfc7807(
  error: z.ZodError,
  instancePath?: string,
  correlationId?: string
): Rfc7807ProblemDetails {
  const invalidParams: InvalidParam[] = error.issues.map((issue) => {
    const fieldPath = issue.path.join('.') || 'root';
    return {
      name: fieldPath,
      reason: issue.message,
      code: issue.code,
    };
  });

  return {
    type: 'https://kdsolution.it/errors/validation-error',
    title: 'Unprocessable Entity - Validation Failed',
    status: 422,
    detail: 'One or more submitted fields failed validation checks. Please review invalidParams for details.',
    instance: instancePath,
    invalidParams,
    correlationId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validates arbitrary data against a Zod schema, returning typed data or RFC 7807 problem details.
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  options?: { instance?: string | undefined; correlationId?: string | undefined }
): ValidationResult<T> {
  const parseResult = schema.safeParse(data);

  if (parseResult.success) {
    return {
      success: true,
      data: parseResult.data,
    };
  }

  const problem = formatZodErrorToRfc7807(
    parseResult.error,
    options?.instance,
    options?.correlationId
  );

  return {
    success: false,
    problem,
  };
}

/**
 * Server route helper for Next.js App Router API route handlers.
 * Extracts and validates JSON body, returning 422 Response immediately if validation fails.
 */
export async function validateJsonBody<T>(
  req: Request,
  schema: z.ZodSchema<T>,
  correlationId?: string
): Promise<{ success: true; data: T } | { success: false; response: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const parseProblem: Rfc7807ProblemDetails = {
      type: 'https://kdsolution.it/errors/invalid-json',
      title: 'Bad Request - Malformed JSON',
      status: 400,
      detail: 'The request body could not be parsed as valid JSON.',
      correlationId,
      timestamp: new Date().toISOString(),
    };
    return {
      success: false,
      response: Response.json(parseProblem, {
        status: 400,
        headers: { 'Content-Type': 'application/problem+json' },
      }),
    };
  }

  const result = validateData(schema, body, {
    instance: new URL(req.url).pathname,
    correlationId,
  });

  if (!result.success) {
    return {
      success: false,
      response: Response.json(result.problem, {
        status: 422,
        headers: { 'Content-Type': 'application/problem+json' },
      }),
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
