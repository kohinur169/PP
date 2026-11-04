// path: lib/auth/middleware.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAndValidateSession } from './session';
import { isUser2faEnrolled, evaluate2faRedirect } from './totp';
import { UserMfaRepository } from '../db/mfa';
import type { DeviceCharacteristics } from './session-types';

const defaultMfaRepo = new UserMfaRepository();

export interface MiddlewareAuthResult {
  readonly shouldRedirect: boolean;
  readonly destination?: string | undefined;
  readonly userId?: string | undefined;
  readonly mfaEnabled?: boolean | undefined;
}

/**
 * Extracts client device characteristics from NextRequest headers.
 */
export function extractDeviceFromRequest(request: NextRequest | Request): DeviceCharacteristics {
  let ip = '127.0.0.1';
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) ip = cfIp;
  else {
    const xff = request.headers.get('x-forwarded-for');
    if (xff) ip = xff.split(',')[0]?.trim() || ip;
  }

  const userAgent = request.headers.get('user-agent') || 'Unknown User-Agent';
  const acceptLanguage = request.headers.get('accept-language') || 'en-US';

  return { ip, userAgent, acceptLanguage };
}

/**
 * Evaluates whether an incoming request requires redirection to mandatory 2FA enrollment.
 * Step 052.4: Intercepts authenticated requests and forces setup if 2FA is not yet active.
 */
export async function evaluateRequest2faRequirement(
  request: NextRequest | Request,
  options?: { readonly mfaRepo?: UserMfaRepository | undefined }
): Promise<MiddlewareAuthResult> {
  const mfaRepo = options?.mfaRepo ?? defaultMfaRepo;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Extract session token from cookie or authorization header
  let token: string | null = null;
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/kd_session=([^;]+)/);
    if (match && match[1]) {
      token = decodeURIComponent(match[1]);
    }
  }

  if (!token) {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  // Also check x-user-id for test environments
  const directUserId = request.headers.get('x-user-id');
  if (!token && directUserId) {
    const mfaRecord = await mfaRepo.findByUserId(directUserId);
    const mfaEnabled = mfaRecord?.mfa_enabled === true;
    const redirectDecision = evaluate2faRedirect(
      { id: directUserId, mfa_enabled: mfaEnabled },
      pathname
    );

    return {
      shouldRedirect: redirectDecision.shouldRedirect,
      destination: redirectDecision.destination,
      userId: directUserId,
      mfaEnabled,
    };
  }

  if (!token) {
    return { shouldRedirect: false };
  }

  const device = extractDeviceFromRequest(request);
  const sessionResult = getAndValidateSession(token, device);

  if (!sessionResult.valid || !sessionResult.session) {
    return { shouldRedirect: false };
  }

  const userId = sessionResult.session.userId;
  const mfaEnabled = await isUser2faEnrolled(userId, { mfaRepo });

  const redirectDecision = evaluate2faRedirect(
    { id: userId, mfa_enabled: mfaEnabled },
    pathname
  );

  return {
    shouldRedirect: redirectDecision.shouldRedirect,
    destination: redirectDecision.destination,
    userId,
    mfaEnabled,
  };
}

/**
 * Next.js Edge / Node Middleware handler for 2FA enrollment gating.
 */
export async function handle2faMiddleware(
  request: NextRequest,
  options?: { readonly mfaRepo?: UserMfaRepository | undefined }
): Promise<NextResponse> {
  const result = await evaluateRequest2faRequirement(request, options);

  if (result.shouldRedirect && result.destination) {
    const redirectUrl = new URL(result.destination, request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}
