// path: middleware.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  extractRoleFromRequest,
  evaluateRouteAccess,
  createRbacResponse,
  isProtectedRoute,
} from '@/lib/auth/guard';
import { Role } from '@/lib/auth/roles';

/**
 * Step 062: RBAC Route Guards & Next.js Edge Middleware.
 * Enforces strict role separation across all platform and merchant dashboard routes:
 *   /super-admin/* -> super_admin
 *   /ceo/*         -> ceo
 *   /compliance/*  -> compliance_kyc
 *   /finance/*     -> finance_ops
 *   /support/*     -> support
 *   /blogger/*     -> blogger
 *   /dashboard/*   -> owner
 * Gates unauthorized roles immediately with HTTP 403 Forbidden redirect to their designated home dashboard.
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

  // Check if route requires RBAC protection
  const isProtected = isProtectedRoute(pathname);

  // Check for session cookie
  const sessionCookie =
    request.cookies.get('__Host-kd_session')?.value ??
    request.cookies.get('kd_session')?.value;

  // Extract platform role from request headers or cookies
  let role = extractRoleFromRequest(request);

  // If a valid session cookie exists without an explicit role header, default merchant sessions to owner
  if (!role && sessionCookie) {
    role = Role.OWNER;
  }

  // Unauthenticated access to protected routes: redirect to login
  if (isProtected && !sessionCookie && !role) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Evaluate RBAC for protected routes
  if (isProtected) {
    const decision = evaluateRouteAccess(pathname, role);

    if (!decision.allowed) {
      return createRbacResponse(decision, request);
    }
  }

  const response = NextResponse.next();
  return applySecurityHeaders(response);
}

/**
 * Step 131.2: Applies strict Content Security Policy (CSP) and transport security headers.
 * Restricts iframe embedding strictly to authorized payment gateways (NMI Collect.js, Stripe Elements, Rainforest, Airwallex).
 */
function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://secure.nmi.com https://js.stripe.com",
      "frame-src 'self' https://secure.nmi.com https://js.stripe.com https://hooks.stripe.com https://sandbox.rainforestpay.com https://api.rainforestpay.com https://demo.airwallex.com https://api.airwallex.com",
      "connect-src 'self' https://secure.nmi.com https://api.stripe.com https://sandbox.rainforestpay.com https://api.rainforestpay.com https://api-demo.airwallex.com https://api.airwallex.com https://api.sandbox.payoneer.com https://api.payoneer.com",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
    ].join('; ')
  );
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
}

export const config = {
  matcher: [
    /*
     * Match all application routes except static files, public images, and health checks
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
