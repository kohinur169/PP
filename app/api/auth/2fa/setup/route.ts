// path: app/api/auth/2fa/setup/route.ts

import { NextRequest, NextResponse } from 'next/server';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';
import { UserRepository } from '@/lib/db/users';
import { UserMfaRepository } from '@/lib/db/mfa';
import {
  startUserTotpEnrollment,
  isUser2faEnrolled,
} from '@/lib/auth/totp';
import { getAndValidateSession } from '@/lib/auth/session';
import type { DeviceCharacteristics } from '@/lib/auth/session-types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export interface SetupRouteDependencies {
  readonly userRepo?: UserRepository | undefined;
  readonly mfaRepo?: UserMfaRepository | undefined;
}

const defaultUserRepo = new UserRepository();
const defaultMfaRepo = new UserMfaRepository();

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
  // 1. Direct header for testing / proxy
  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId && headerUserId.trim().length > 0) {
    return headerUserId.trim();
  }

  // 2. Cookie or Authorization Bearer token
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
 * Step 052.2: Generates RFC 6238 Base32 TOTP secret, authenticator QR code,
 * and encrypted storage envelope for the authenticated user.
 */
export async function POST(
  request: NextRequest | Request,
  contextOptions?: SetupRouteDependencies
): Promise<Response> {
  const instancePath = '/api/auth/2fa/setup';
  const userRepo = contextOptions?.userRepo ?? defaultUserRepo;
  const mfaRepo = contextOptions?.mfaRepo ?? defaultMfaRepo;

  const userId = extractUserId(request);
  if (!userId) {
    logger.warn('2FA setup rejected: unauthenticated request');
    return createProblemResponse(
      401,
      'Unauthorized',
      'You must be signed in to configure two-factor authentication.',
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

  // Check if 2FA is already enabled
  const alreadyEnrolled = await isUser2faEnrolled(user.id, { mfaRepo });
  if (alreadyEnrolled) {
    return createProblemResponse(
      409,
      '2FA Already Active',
      'Two-factor authentication is already active on your account. To reconfigure, contact support or generate fresh backup codes.',
      instancePath,
      'ALREADY_ENROLLED'
    );
  }

  try {
    const setupData = await startUserTotpEnrollment(user.id, user.email, {
      mfaRepo,
    });

    return NextResponse.json(
      {
        success: true,
        secret: setupData.secret,
        otpauth_uri: setupData.otpauthUri,
        qr_code_data_url: setupData.qrCodeDataUrl,
        message:
          'Two-factor authentication setup initialized. Scan the QR code and verify a 6-digit code to complete activation.',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    logger.error('Failed to initialize 2FA enrollment', { userId, error: err });
    return createProblemResponse(
      500,
      'Internal Server Error',
      'Failed to generate authenticator configuration. Please retry.',
      instancePath,
      'INTERNAL_ERROR'
    );
  }
}

/**
 * GET alias for reading setup details.
 */
export async function GET(
  request: NextRequest | Request,
  contextOptions?: SetupRouteDependencies
): Promise<Response> {
  return POST(request, contextOptions);
}
