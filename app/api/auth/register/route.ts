// path: app/api/auth/register/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { RegisterRequestSchema } from '@/lib/validation/auth';
import type { Rfc7807ProblemDetails, InvalidParam } from '@/lib/validation/types';
import { verifyTurnstileToken } from '@/lib/security/turnstile';
import {
  checkRateLimit,
  getRateLimitHeaders,
} from '@/lib/security/rate-limit';
import { hashPassword } from '@/lib/auth/password';
import { UserRepository } from '@/lib/db/users';
import { CompanyRepository } from '@/lib/db/companies';
import { CompanyMemberRepository } from '@/lib/db/memberships';
import { AuditLogRepository } from '@/lib/db/audit';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Injectable dependency options for testing and modular execution.
 */
export interface RegisterRouteDependencies {
  readonly userRepo?: UserRepository | undefined;
  readonly companyRepo?: CompanyRepository | undefined;
  readonly memberRepo?: CompanyMemberRepository | undefined;
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
  errorCode = 'REGISTRATION_ERROR',
  invalidParams?: InvalidParam[],
  extraHeaders?: Record<string, string>
): Response {
  const problem: Rfc7807ProblemDetails = {
    type: `https://kdsolution.it/errors/${errorCode.toLowerCase().replace(/_/g, '-')}`,
    title,
    status,
    detail,
    instance,
    invalidParams,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(problem), {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
      'X-Content-Type-Options': 'nosniff',
      ...(extraHeaders ?? {}),
    },
  });
}

/**
 * Step 046: Merchant & Staff Registration Endpoint with Turnstile Guard
 * POST /api/auth/register
 *
 * Validates incoming signup data, enforces Cloudflare Turnstile bot verification,
 * checks IP rate limiting (max 5 attempts/hour), normalizes email, hashes password,
 * creates user record with status 'pending_verification', and logs audit entry.
 */
export async function POST(
  req: NextRequest | Request,
  contextOptions?: RegisterRouteDependencies
): Promise<Response> {
  const url = new URL(req.url);
  const instancePath = url.pathname;

  // 1. Extract client IP address
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  // 2. Step 046.3: Enforce strict IP rate limiting (max 5 attempts per hour per IP)
  let rateLimitHeaders: Record<string, string> = {};
  if (!contextOptions?.bypassRateLimit) {
    const rateLimitKey = `reg:ip:${clientIp}`;
    const rateLimit = checkRateLimit(rateLimitKey, {
      limit: 5,
      windowSeconds: 3600,
    });
    rateLimitHeaders = getRateLimitHeaders(rateLimit);

    if (!rateLimit.allowed) {
      logger.warn('Registration rate limit exceeded for IP', {
        clientIp,
        retryAfter: rateLimit.retryAfterSeconds,
      });

      return createProblemResponse(
        429,
        'Too Many Requests',
        'Registration attempt limit exceeded. Maximum 5 attempts per hour per IP address.',
        instancePath,
        'RATE_LIMIT_EXCEEDED',
        undefined,
        rateLimitHeaders
      );
    }
  }

  // 3. Parse JSON request body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return createProblemResponse(
      400,
      'Bad Request',
      'Malformed JSON payload in request body.',
      instancePath,
      'MALFORMED_JSON',
      undefined,
      rateLimitHeaders
    );
  }

  // 4. Step 046.1: Validate with RegisterRequestSchema
  const parseResult = RegisterRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const invalidParams: InvalidParam[] = parseResult.error.issues.map((issue) => ({
      name: issue.path.join('.') || 'body',
      reason: issue.message,
      code: issue.code,
    }));

    return createProblemResponse(
      400,
      'Validation Failed',
      'The registration request payload contains invalid or missing attributes.',
      instancePath,
      'VALIDATION_FAILED',
      invalidParams,
      rateLimitHeaders
    );
  }

  const input = parseResult.data;

  // 5. Step 046.2: Enforce Cloudflare Turnstile bot verification
  const turnstileResult = await verifyTurnstileToken(input.turnstile_token, {
    remoteIp: clientIp,
    customValidator: contextOptions?.turnstileValidator,
  });

  if (!turnstileResult.success) {
    logger.warn('Bot verification failed for registration attempt', {
      email: input.email,
      clientIp,
      errorCodes: turnstileResult.errorCodes,
    });

    return createProblemResponse(
      403,
      'Bot Verification Failed',
      turnstileResult.message || 'Cloudflare Turnstile bot verification failed.',
      instancePath,
      'TURNSTILE_VERIFICATION_FAILED',
      undefined,
      rateLimitHeaders
    );
  }

  // 6. Check unique email conflict
  const userRepo = contextOptions?.userRepo ?? new UserRepository();
  const existingUser = await userRepo.findByEmail(input.email);

  if (existingUser) {
    logger.warn('Registration rejected: duplicate email address', {
      email: input.email,
    });

    return createProblemResponse(
      409,
      'Email Conflict',
      'An account with this email address already exists.',
      instancePath,
      'EMAIL_ALREADY_EXISTS',
      undefined,
      rateLimitHeaders
    );
  }

  try {
    // 7. Hash password securely
    const passwordHash = hashPassword(input.password);

    // 8. Provision company if company_name was supplied
    let companyId: string | null = null;
    const companyRepo = contextOptions?.companyRepo ?? new CompanyRepository();
    const memberRepo = contextOptions?.memberRepo ?? new CompanyMemberRepository();

    if (input.company_name) {
      const generatedCompanyId = generateUuidV7();
      const company = await companyRepo.createCompany({
        id: generatedCompanyId,
        company_id: generatedCompanyId,
        legal_name: input.company_name,
        dba_name: input.company_name,
        business_type: 'llc',
        registration_number: `REG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        country: 'US',
        operating_address: {
          street1: '100 Enterprise Way',
          city: 'Wilmington',
          postalCode: '19801',
          country: 'US',
        },
        mcc: '5999',
        status: 'draft',
        risk_tier: 2,
        custom_fee_percent: '0.0000',
        custom_hold_days: 7,
        reserve_percent: '10.0000',
        reserve_hold_days: 180,
        default_currency: 'USD',
      });
      companyId = company.id;
    }

    // 9. Create user record with status 'pending_verification'
    const newUser = await userRepo.createUser({
      email: input.email,
      full_legal_name: input.full_legal_name,
      password_hash: passwordHash,
      phone: input.phone ?? null,
      company_id: companyId ?? '00000000-0000-7000-8000-000000000000',
      failed_attempts: 0,
      locked_until: null,
      status: 'pending_verification',
      is_staff: false,
    });

    // 10. Link owner membership if company was created
    if (companyId) {
      await memberRepo.createMember({
        company_id: companyId,
        user_id: newUser.id,
        role: 'owner',
        status: 'active',
        permissions: [],
      });
    }

    // 11. Append audit log entry
    const auditRepo = contextOptions?.auditRepo ?? new AuditLogRepository();
    await auditRepo.append({
      action: 'USER_REGISTERED',
      entity_type: 'user',
      entity_id: newUser.id,
      actor_id: newUser.id,
      company_id: companyId ?? newUser.company_id,
      ip_address: clientIp,
      payload: {
        userId: newUser.id,
        email: newUser.email,
        fullLegalName: newUser.full_legal_name,
        companyId,
        status: 'pending_verification',
      },
    });

    logger.info('Merchant user registered successfully', {
      userId: newUser.id,
      email: newUser.email,
      companyId,
      status: 'pending_verification',
    });

    return NextResponse.json(
      {
        status: 'pending_verification',
        user_id: newUser.id,
        email: newUser.email,
        full_legal_name: newUser.full_legal_name,
        company_id: companyId,
        message:
          'Registration successful. Please verify your email address to activate your account.',
        created_at: newUser.created_at,
      },
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
          ...rateLimitHeaders,
        },
      }
    );
  } catch (err: unknown) {
    logger.error('Unexpected error during merchant registration', {
      error: err instanceof Error ? err.message : String(err),
    });

    return createProblemResponse(
      500,
      'Internal Server Error',
      'An unexpected error occurred during account registration.',
      instancePath,
      'INTERNAL_REGISTRATION_ERROR',
      undefined,
      rateLimitHeaders
    );
  }
}
