// path: tests/auth/middleware.test.ts

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import {
  ROUTE_RULES,
  findMatchingRouteRule,
  isProtectedRoute,
  extractRoleFromRequest,
  evaluateRouteAccess,
  assertRouteAccess,
  createRbacResponse,
  RequirePermission,
  RequireAllPermissions,
  RequireAnyPermission,
} from '@/lib/auth/guard';
import { Role, Permission } from '@/lib/auth/roles';

describe('Step 062: RBAC Route Guards & Next.js Edge Middleware', () => {
  const BASE_URL = 'http://localhost:3000';

  describe('Step 062.1: Route Matching Rules & Pattern Matching', () => {
    it('defines route rules covering all 7 protected dashboard sections', () => {
      const prefixes = ROUTE_RULES.map((r) => r.prefix);
      expect(prefixes).toContain('/super-admin');
      expect(prefixes).toContain('/ceo');
      expect(prefixes).toContain('/compliance');
      expect(prefixes).toContain('/finance');
      expect(prefixes).toContain('/support');
      expect(prefixes).toContain('/blogger');
      expect(prefixes).toContain('/dashboard');
    });

    it('matches exact prefixes and subpaths correctly', () => {
      expect(findMatchingRouteRule('/super-admin')?.prefix).toBe('/super-admin');
      expect(findMatchingRouteRule('/super-admin/gateways')?.prefix).toBe('/super-admin');
      expect(findMatchingRouteRule('/ceo/pricing')?.prefix).toBe('/ceo');
      expect(findMatchingRouteRule('/compliance/kyc')?.prefix).toBe('/compliance');
      expect(findMatchingRouteRule('/finance/reconciliation')?.prefix).toBe('/finance');
      expect(findMatchingRouteRule('/support/tickets')?.prefix).toBe('/support');
      expect(findMatchingRouteRule('/blogger/posts')?.prefix).toBe('/blogger');
      expect(findMatchingRouteRule('/dashboard/charges')?.prefix).toBe('/dashboard');
    });

    it('identifies protected vs public routes', () => {
      expect(isProtectedRoute('/super-admin/gateways')).toBe(true);
      expect(isProtectedRoute('/compliance/kyc')).toBe(true);
      expect(isProtectedRoute('/dashboard/payouts')).toBe(true);
      expect(isProtectedRoute('/support')).toBe(true);

      // Public / non-protected routes
      expect(isProtectedRoute('/')).toBe(false);
      expect(isProtectedRoute('/auth/login')).toBe(false);
      expect(isProtectedRoute('/auth/register')).toBe(false);
      expect(isProtectedRoute('/api/health')).toBe(false);
    });

    it('extracts role from various headers and cookies', () => {
      const reqWithUserRole = new Request(`${BASE_URL}/test`, {
        headers: { 'x-user-role': 'support' },
      });
      expect(extractRoleFromRequest(reqWithUserRole)).toBe(Role.SUPPORT);

      const reqWithStaffRole = new Request(`${BASE_URL}/test`, {
        headers: { 'x-staff-role': 'compliance_kyc' },
      });
      expect(extractRoleFromRequest(reqWithStaffRole)).toBe(Role.COMPLIANCE_KYC);

      const reqWithGenericRole = new Request(`${BASE_URL}/test`, {
        headers: { 'x-role': 'super_admin' },
      });
      expect(extractRoleFromRequest(reqWithGenericRole)).toBe(Role.SUPER_ADMIN);

      const nextReqWithCookie = new NextRequest(`${BASE_URL}/test`, {
        headers: { cookie: 'kd_role=blogger' },
      });
      expect(extractRoleFromRequest(nextReqWithCookie)).toBe(Role.BLOGGER);
    });
  });

  describe('Step 062.2: Redirection and HTTP 403 Forbidden Handling', () => {
    it('redirects unauthenticated requests on protected routes to /auth/login with returnTo', async () => {
      const req = new NextRequest(`${BASE_URL}/super-admin/gateways`);
      const response = await middleware(req);

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toBe(`${BASE_URL}/auth/login?returnTo=%2Fsuper-admin%2Fgateways`);
    });

    it('redirects unauthenticated requests on /dashboard to /auth/login', async () => {
      const req = new NextRequest(`${BASE_URL}/dashboard/settings`);
      const response = await middleware(req);

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toBe(`${BASE_URL}/auth/login?returnTo=%2Fdashboard%2Fsettings`);
    });

    it('bypasses public assets, auth pages, and api routes', async () => {
      const loginReq = new NextRequest(`${BASE_URL}/auth/login`);
      expect((await middleware(loginReq)).status).toBe(200);

      const registerReq = new NextRequest(`${BASE_URL}/auth/register`);
      expect((await middleware(registerReq)).status).toBe(200);

      const apiReq = new NextRequest(`${BASE_URL}/api/compliance/audit/export`);
      expect((await middleware(apiReq)).status).toBe(200);

      const faviconReq = new NextRequest(`${BASE_URL}/favicon.ico`);
      expect((await middleware(faviconReq)).status).toBe(200);
    });

    it('supports redirect_dashboard mode in createRbacResponse', () => {
      const decision = evaluateRouteAccess('/super-admin/gateways', Role.SUPPORT);
      const req = new NextRequest(`${BASE_URL}/super-admin/gateways`);
      const response = createRbacResponse(decision, req, { redirectMode: 'redirect_dashboard' });

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(`${BASE_URL}/support?error=forbidden`);
    });

    it('assertRouteAccess throws Error when unauthorized', () => {
      expect(() => {
        assertRouteAccess('/super-admin/gateways', Role.SUPPORT);
      }).toThrowError(/Access Denied/);

      expect(() => {
        assertRouteAccess('/super-admin/gateways', Role.SUPER_ADMIN);
      }).not.toThrow();
    });
  });

  describe('Step 062.3: React Server Component Guard <RequirePermission>', () => {
    it('renders children when role holds permission', () => {
      const result = RequirePermission({
        permission: Permission.RESOLVE_TICKETS,
        role: Role.SUPPORT,
        fallback: 'FALLBACK_DENIED',
        children: 'CHILD_PERMITTED',
      });
      expect(result).toBe('CHILD_PERMITTED');
    });

    it('renders fallback when role lacks permission', () => {
      const result = RequirePermission({
        permission: Permission.MANAGE_GATEWAYS,
        role: Role.SUPPORT,
        fallback: 'FALLBACK_DENIED',
        children: 'CHILD_PERMITTED',
      });
      expect(result).toBe('FALLBACK_DENIED');
    });

    it('renders null when role lacks permission and no fallback provided', () => {
      const result = RequirePermission({
        permission: Permission.APPROVE_KYC,
        role: Role.SUPPORT,
        children: 'CHILD_PERMITTED',
      });
      expect(result).toBeNull();
    });

    it('renders fallback when role is null or undefined', () => {
      const result = RequirePermission({
        permission: Permission.VIEW_CHARGES,
        role: undefined,
        fallback: 'NO_ROLE',
        children: 'CHILD_PERMITTED',
      });
      expect(result).toBe('NO_ROLE');
    });

    it('evaluates RequireAllPermissions correctly', () => {
      const allowed = RequireAllPermissions({
        permissions: [Permission.VIEW_TICKETS, Permission.RESOLVE_TICKETS],
        role: Role.SUPPORT,
        fallback: 'DENIED',
        children: 'ALLOWED',
      });
      expect(allowed).toBe('ALLOWED');

      const denied = RequireAllPermissions({
        permissions: [Permission.VIEW_TICKETS, Permission.MANAGE_GATEWAYS],
        role: Role.SUPPORT,
        fallback: 'DENIED',
        children: 'ALLOWED',
      });
      expect(denied).toBe('DENIED');
    });

    it('evaluates RequireAnyPermission correctly', () => {
      const allowed = RequireAnyPermission({
        permissions: [Permission.MANAGE_GATEWAYS, Permission.RESOLVE_TICKETS],
        role: Role.SUPPORT,
        fallback: 'DENIED',
        children: 'ALLOWED',
      });
      expect(allowed).toBe('ALLOWED');

      const denied = RequireAnyPermission({
        permissions: [Permission.MANAGE_GATEWAYS, Permission.APPROVE_KYC],
        role: Role.SUPPORT,
        fallback: 'DENIED',
        children: 'ALLOWED',
      });
      expect(denied).toBe('DENIED');
    });
  });

  describe('Step 062.4 & Verification Gate: Support User Route Access', () => {
    it('Verification & Quality Gate: Authenticate as support user and request /super-admin/gateways -> immediate 403 Forbidden redirect', async () => {
      const req = new NextRequest(`${BASE_URL}/super-admin/gateways`, {
        headers: {
          'x-user-role': 'support',
        },
      });

      const response = await middleware(req);

      // Verify status is 403 Forbidden
      expect(response.status).toBe(403);

      // Verify immediate redirect Location points to support's designated home dashboard (/support)
      expect(response.headers.get('location')).toBe('/support');
      expect(response.headers.get('x-redirect-to')).toBe('/support');

      // Verify structured JSON body explains rejection and redirect target
      const body = await response.json();
      expect(body.error).toBe('Forbidden');
      expect(body.code).toBe('FORBIDDEN_ROLE');
      expect(body.designatedHomeRoute).toBe('/support');
      expect(body.message).toContain('support');
      expect(body.message).toContain('/super-admin/gateways');
    });

    it('verifies that support cannot load /compliance/kyc and receives 403 redirect to /support', async () => {
      const req = new NextRequest(`${BASE_URL}/compliance/kyc`, {
        headers: {
          'x-staff-role': 'support',
        },
      });

      const response = await middleware(req);

      expect(response.status).toBe(403);
      expect(response.headers.get('location')).toBe('/support');

      const body = await response.json();
      expect(body.error).toBe('Forbidden');
      expect(body.designatedHomeRoute).toBe('/support');
      expect(body.message).toContain('/compliance/kyc');
    });

    it('allows support user to access /support/tickets and /support dashboard', async () => {
      const req = new NextRequest(`${BASE_URL}/support/tickets`, {
        headers: {
          'x-user-role': 'support',
        },
      });

      const response = await middleware(req);
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('Multi-Role Isolation across Dashboards', () => {
    it('allows owner to access /dashboard but blocks /super-admin with 403 redirect to /dashboard', async () => {
      const authorizedReq = new NextRequest(`${BASE_URL}/dashboard/charges`, {
        headers: { 'x-user-role': 'owner' },
      });
      const authRes = await middleware(authorizedReq);
      expect(authRes.status).toBe(200);

      const forbiddenReq = new NextRequest(`${BASE_URL}/super-admin/gateways`, {
        headers: { 'x-user-role': 'owner' },
      });
      const forbRes = await middleware(forbiddenReq);
      expect(forbRes.status).toBe(403);
      expect(forbRes.headers.get('location')).toBe('/dashboard');
    });

    it('allows blogger to access /blogger but blocks /dashboard and /super-admin with 403 redirect to /blogger', async () => {
      const authorizedReq = new NextRequest(`${BASE_URL}/blogger/posts`, {
        headers: { 'x-user-role': 'blogger' },
      });
      const authRes = await middleware(authorizedReq);
      expect(authRes.status).toBe(200);

      const merchantAttemptReq = new NextRequest(`${BASE_URL}/dashboard/settings`, {
        headers: { 'x-user-role': 'blogger' },
      });
      const merchantRes = await middleware(merchantAttemptReq);
      expect(merchantRes.status).toBe(403);
      expect(merchantRes.headers.get('location')).toBe('/blogger');
    });

    it('allows super_admin access to all dashboard sections', async () => {
      const routes = [
        '/super-admin/gateways',
        '/ceo/approvals',
        '/compliance/kyc',
        '/finance/reconciliation',
        '/support/tickets',
        '/blogger/posts',
        '/dashboard/charges',
      ];

      for (const path of routes) {
        const req = new NextRequest(`${BASE_URL}${path}`, {
          headers: { 'x-user-role': 'super_admin' },
        });
        const res = await middleware(req);
        expect(res.status).toBe(200);
      }
    });

    it('allows ceo access to /ceo, finance_ops to /finance, compliance_kyc to /compliance', async () => {
      const ceoReq = new NextRequest(`${BASE_URL}/ceo/approvals`, {
        headers: { 'x-user-role': 'ceo' },
      });
      expect((await middleware(ceoReq)).status).toBe(200);

      const finReq = new NextRequest(`${BASE_URL}/finance/reconciliation`, {
        headers: { 'x-user-role': 'finance_ops' },
      });
      expect((await middleware(finReq)).status).toBe(200);

      const compReq = new NextRequest(`${BASE_URL}/compliance/kyc`, {
        headers: { 'x-user-role': 'compliance_kyc' },
      });
      expect((await middleware(compReq)).status).toBe(200);
    });
  });
});
