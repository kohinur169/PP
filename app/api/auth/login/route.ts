// path: app/api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { LoginRequestSchema } from '@/lib/validation/auth';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';
import { verifyTurnstileToken } from '@/lib/security/turnstile';
import {
  checkRateLimit,
  getRateLimitHeaders,
} from '@/lib/security/rate-limit';
import {
  authenticateUser,
  GENERIC_AUTH_ERROR_MESSAGE,
} from '@/lib/auth/login';
import type { DeviceCharacteristics } from '@/lib/auth/session-types';
import { UserRepository } from '@/lib/db/users';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Injectable dependency options for testing and modular execution.
 */
export interface LoginRouteDependencies {
  readonly userRepo?: UserRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly turnstileValidator?: ((token: string) => Promise<boolean> | boolean) | undefined;
  readonly bypassRateLimit?: boolean | undefined;
}

/**
 * Creates an RFC 7807 standard Problem Details HTTP Response.
 */
function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance: string,
  errorCode = 'AUTHENTICATION_ERROR',
  extraHeaders?: Record<string, string>
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
      ...(extraHeaders ?? {}),
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
 * Step 049: Anti-Enumeration Login API Endpoint.
 * Enforces IP rate limiting (10 attempts / min), Turnstile bot validation,
 * constant-time dummy password hashing, and LR-022 session generation.
 */
export async function POST(
  request: NextRequest | Request,
  contextOptions?: LoginRouteDependencies
): Promise<Response> {
  const instancePath = '/api/auth/login';
  const clientIp = extractClientIp(request);
  const userAgent = request.headers.get('user-agent') || 'Unknown User-Agent';
  const acceptLanguage = request.headers.get('accept-language') || 'en-US';

  // 1. Step 049.3: Enforce strict IP rate limiting (10 attempts / 60 seconds)
  const rateLimit = checkRateLimit(`login:${clientIp}`, {
    limit: 10,
    windowSeconds: 60,
  });

  const rateLimitHeaders = getRateLimitHeaders(rateLimit);

  if (!rateLimit.allowed && !contextOptions?.bypassRateLimit) {
    logger.warn('Login rate limit exceeded for IP', {
      clientIp,
      retryAfter: rateLimit.retryAfterSeconds,
    });

    return createProblemResponse(
      429,
      'Too Many Authentication Attempts',
      `Login rate limit exceeded. Please wait ${rateLimit.retryAfterSeconds} seconds before retrying.`,
      instancePath,
      'RATE_LIMIT_EXCEEDED',
      rateLimitHeaders
    );
  }

  // 2. Parse and validate JSON request body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return createProblemResponse(
      400,
      'Malformed Request Body',
      'Request body must be valid JSON.',
      instancePath,
      'INVALID_JSON',
      rateLimitHeaders
    );
  }

  const parseResult = LoginRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return createProblemResponse(
      400,
      'Validation Failed',
      'Please check your email and password format.',
      instancePath,
      'VALIDATION_FAILED',
      rateLimitHeaders
    );
  }

  const input = parseResult.data;

  // 3. Optional / Configured Cloudflare Turnstile bot verification
  if (input.turnstile_token) {
    const isHuman = contextOptions?.turnstileValidator
      ? await contextOptions.turnstileValidator(input.turnstile_token)
      : (
          await verifyTurnstileToken(input.turnstile_token, {
            remoteIp: clientIp,
          })
        ).success;

    if (!isHuman) {
      logger.warn('Bot verification failed for login attempt', {
        email: input.email,
        clientIp,
      });

      return createProblemResponse(
        400,
        'Bot Verification Failed',
        'Cloudflare Turnstile bot challenge validation failed.',
        instancePath,
        'TURNSTILE_FAILED',
        rateLimitHeaders
      );
    }
  }

  // 4. Formulate device characteristics for LR-022 binding
  const device: DeviceCharacteristics = {
    ip: clientIp,
    userAgent,
    acceptLanguage,
  };

  // 5. Execute constant-time anti-enumeration authentication flow
  const authResult = await authenticateUser(
    {
      email: input.email,
      password: input.password,
      device,
    },
    {
      userRepo: contextOptions?.userRepo,
      auditRepo: contextOptions?.auditRepo,
    }
  );

  // 6. Handle authentication failures
  if (!authResult.success) {
    if (authResult.error === 'ACCOUNT_LOCKED') {
      return createProblemResponse(
        423,
        'Account Locked',
        authResult.message,
        instancePath,
        'ACCOUNT_LOCKED',
        rateLimitHeaders
      );
    }

    if (authResult.error === 'EMAIL_NOT_VERIFIED') {
      return createProblemResponse(
        403,
        'Email Not Verified',
        authResult.message,
        instancePath,
        'EMAIL_NOT_VERIFIED',
        rateLimitHeaders
      );
    }

    if (authResult.error === 'ACCOUNT_SUSPENDED') {
      return createProblemResponse(
        403,
        'Account Suspended',
        authResult.message,
        instancePath,
        'ACCOUNT_SUSPENDED',
        rateLimitHeaders
      );
    }

    // Default to constant-time generic 401 error
    return createProblemResponse(
      401,
      'Invalid Credentials',
      GENERIC_AUTH_ERROR_MESSAGE,
      instancePath,
      'INVALID_CREDENTIALS',
      rateLimitHeaders
    );
  }

  // 7. Successful login: Return 200 OK with session and cookie header
  const user = authResult.user!;
  const session = authResult.session!;
  const sessionToken = authResult.sessionToken!;

  const responseHeaders = new Headers(rateLimitHeaders);
  responseHeaders.set('Content-Type', 'application/json');
  responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');

  // Secure HttpOnly session cookie
  const cookieValue = `kd_session=${encodeURIComponent(
    sessionToken
  )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`;
  responseHeaders.set('Set-Cookie', cookieValue);

  return new NextResponse(
    JSON.stringify({
      success: true,
      session_token: sessionToken,
      session_id: session.id,
      user: {
        id: user.id,
        email: user.email,
        full_legal_name: user.full_legal_name,
        company_id: user.company_id,
        is_staff: user.is_staff,
        status: user.status,
      },
      expires_at: session.expiresAt,
    }),
    {
      status: 200,
      headers: responseHeaders,
    }
  );
}
