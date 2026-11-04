// path: app/api/auth/2fa/verify-enrollment/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';
import { UserRepository } from '@/lib/db/users';
import { UserMfaRepository } from '@/lib/db/mfa';
import { AuditLogRepository } from '@/lib/db/audit';
import { verifyEnrollmentCode } from '@/lib/auth/totp';
import { getAndValidateSession } from '@/lib/auth/session';
import type { DeviceCharacteristics } from '@/lib/auth/session-types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export interface VerifyRouteDependencies {
  readonly userRepo?: UserRepository | undefined;
  readonly mfaRepo?: UserMfaRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}

const defaultUserRepo = new UserRepository();
const defaultMfaRepo = new UserMfaRepository();
const defaultAuditRepo = new AuditLogRepository();

const VerifyCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Verification code must be exactly 6 numeric digits'),
});

/**
 * Creates an RFC 7807 standard Problem Details HTTP Response.
 */
function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance: string,
  errorCode = 'AUTHENTICATION_ERROR'
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
 * Extracts client IP address from network headers.
 */
function extractClientIp(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim().length > 0) return cfIp.trim();

  const xff = request.headers.get('x-forwarded-for');
  if (xff && xff.trim().length > 0) {
    const first = xff.split(',')[0];
    if (first && first.trim().length > 0) return first.trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim().length > 0) return realIp.trim();

  return '127.0.0.1';
}

/**
 * Extracts authenticated user ID from session cookie or headers.
 */
function extractUserId(request: Request): string | null {
  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId && headerUserId.trim().length > 0) {
    return headerUserId.trim();
  }

  let token: string | null = null;
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/kd_session=([^;]+)/);
      if (match && match[1]) {
        token = decodeURIComponent(match[1]);
      }
    }
  }

  if (token) {
    const device: DeviceCharacteristics = {
      ip: extractClientIp(request),
      userAgent: request.headers.get('user-agent') || 'Unknown User-Agent',
      acceptLanguage: request.headers.get('accept-language') || 'en-US',
    };

    const sessionResult = getAndValidateSession(token, device);
    if (sessionResult.valid && sessionResult.session) {
      return sessionResult.session.userId;
    }
  }

  return null;
}

/**
 * Step 052.3: Validates user's first 6-digit TOTP code before activating 2FA.
 */
export async function POST(
  request: NextRequest | Request,
  contextOptions?: VerifyRouteDependencies
): Promise<Response> {
  const instancePath = '/api/auth/2fa/verify-enrollment';
  const userRepo = contextOptions?.userRepo ?? defaultUserRepo;
  const mfaRepo = contextOptions?.mfaRepo ?? defaultMfaRepo;
  const auditRepo = contextOptions?.auditRepo ?? defaultAuditRepo;

  const userId = extractUserId(request);
  if (!userId) {
    logger.warn('2FA verification rejected: unauthenticated request');
    return createProblemResponse(
      401,
      'Unauthorized',
      'You must be signed in to verify two-factor authentication.',
      instancePath,
      'UNAUTHORIZED'
    );
  }

  const user = await userRepo.findById(userId);
  if (!user) {
    return createProblemResponse(
      404,
      'User Not Found',
      `Authenticated user with ID "${userId}" was not found.`,
      instancePath,
      'USER_NOT_FOUND'
    );
  }

  // Parse body
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

  // Allow either 'code' or 'token' key in body
  const bodyObj = typeof rawBody === 'object' && rawBody !== null ? (rawBody as Record<string, unknown>) : {};
  const inputCode = bodyObj['code'] ?? bodyObj['token'];

  const parseResult = VerifyCodeSchema.safeParse({ code: inputCode });
  if (!parseResult.success) {
    return createProblemResponse(
      400,
      'Validation Failed',
      'Verification code must be exactly 6 numeric digits.',
      instancePath,
      'VALIDATION_FAILED'
    );
  }

  const { code } = parseResult.data;

  // Validate the code against pending secret
  const verifyResult = await verifyEnrollmentCode(user.id, code, {
    mfaRepo,
    auditRepo,
  });

  if (!verifyResult.valid) {
    logger.warn('2FA enrollment code verification failed', {
      userId: user.id,
      error: verifyResult.error,
    });

    return createProblemResponse(
      400,
      'Invalid Verification Code',
      verifyResult.error ?? 'Invalid or expired 6-digit one-time code.',
      instancePath,
      'INVALID_CODE'
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: 'Two-factor authentication successfully verified and enabled.',
      mfa_enabled: true,
      activated_at: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
