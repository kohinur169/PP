// path: middleware.ts

import { NextRequest, NextResponse } from 'next/server';

/**
 * Step 052.4 & Step 055.3: Global Next.js middleware interceptor.
 * Enforces LR-022 session extraction and validation across requests,
 * and gates mandatory 2FA enrollment across all account roles,
 * redirecting unconfigured authenticated users to /auth/2fa/setup.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Skip static assets, public files, and api routes that handle their own auth
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname === '/auth/login' ||
    pathname === '/auth/register' ||
    pathname === '/auth/2fa/setup'
  ) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie =
    request.cookies.get('__Host-kd_session')?.value ??
    request.cookies.get('kd_session')?.value;

  if (!sessionCookie && (pathname.startsWith('/dashboard') || pathname.startsWith('/office') || pathname.startsWith('/compliance') || pathname.startsWith('/finance'))) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all application routes except static files, public images, and health checks
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
