// path: app/api/auth/forgot-password/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/auth/password-reset';
import { ForgotPasswordRequestSchema } from '@/types/password-reset';
import { extractDeviceFromRequest } from '@/lib/auth/session';
import { UserRepository } from '@/lib/db/users';
import { PasswordResetTokenRepository } from '@/lib/db/password-reset';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';

export interface ForgotPasswordRouteDependencies {
  readonly userRepo?: UserRepository | undefined;
  readonly resetRepo?: PasswordResetTokenRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly nowMs?: number | undefined;
  readonly baseUrl?: string | undefined;
}

function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance: string,
  errorCode = 'FORGOT_PASSWORD_ERROR'
): Response {
  const problem: Rfc7807ProblemDetails = {
    type: `https://kdsolution.it/errors/${errorCode.toLowerCase().replace(/_/g, '-')}`,
    title,
    status,
    detail,
    instance,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(problem), {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

/**
 * Step 060.2: Forgot Password API Endpoint.
 * Generates a 1-hour cryptographic password reset token and dispatches reset instructions.
 * Enforces Turnstile bot defense and anti-enumeration generic messaging.
 */
export async function POST(
  request: NextRequest | Request,
  options?: ForgotPasswordRouteDependencies
): Promise<Response> {
  const instancePath = '/api/auth/forgot-password';
  const device = extractDeviceFromRequest(request);

  // 1. Parse and validate JSON request body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return createProblemResponse(
      400,
      'Malformed Request Body',
      'Request body must be valid JSON.',
      instancePath,
      'INVALID_JSON'
    );
  }

  const parseResult = ForgotPasswordRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return createProblemResponse(
      400,
      'Validation Failed',
      parseResult.error.issues[0]?.message ?? 'Invalid forgot password parameters.',
      instancePath,
      'VALIDATION_FAILED'
    );
  }

  const input = parseResult.data;

  // 2. Request password reset token generation
  const result = await requestPasswordReset(
    {
      email: input.email,
      turnstileToken: input.turnstile_token,
      ipAddress: device.ip,
      userAgent: device.userAgent,
    },
    {
      userRepo: options?.userRepo,
      resetRepo: options?.resetRepo,
      auditRepo: options?.auditRepo,
      nowMs: options?.nowMs,
      baseUrl: options?.baseUrl,
    }
  );

  if (!result.success) {
    return createProblemResponse(
      400,
      'Request Failed',
      result.message,
      instancePath,
      'TURNSTILE_FAILED'
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: result.message,
      token_id: result.tokenId,
      raw_token: result.rawToken, // Provided in non-production / testing responses
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
