// path: middleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { handle2faMiddleware } from '@/lib/auth/middleware';

/**
 * Step 052.4 & Step 055.3: Global Next.js middleware interceptor.
 * Enforces LR-022 session extraction and validation across requests,
 * and gates mandatory 2FA enrollment across all account roles,
 * redirecting unconfigured authenticated users to /auth/2fa/setup.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  return await handle2faMiddleware(request);
}

export const config = {
  matcher: [
    /*
     * Match all application routes except static files, public images, and health checks
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
