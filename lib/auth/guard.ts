// path: lib/auth/guard.ts

import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import {
  Role,
  PlatformRole,
  Permission,
  SystemPermission,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getDashboardRouteForRole,
  isValidRole,
} from '@/lib/auth/roles';


/**
 * Route access rule specifying allowed roles for URL prefixes.
 */
export interface RouteRule {
  readonly prefix: string;
  readonly allowedRoles: readonly Role[];
  readonly description: string;
}

/**
 * Canonical route RBAC mapping for KD SOLUTION IT PayFac.
 * Enforces role isolation across all platform and merchant dashboard sections.
 */
export const ROUTE_RULES: readonly RouteRule[] = [
  {
    prefix: '/super-admin',
    allowedRoles: [Role.SUPER_ADMIN],
    description: 'Platform Super Admin full authority and settings',
  },
  {
    prefix: '/ceo',
    allowedRoles: [Role.CEO, Role.SUPER_ADMIN],
    description: 'CEO executive dashboard, approvals, and decisions',
  },
  {
    prefix: '/compliance',
    allowedRoles: [Role.COMPLIANCE_KYC, Role.SUPER_ADMIN],
    description: 'Compliance, underwriting, SAR cases, and KYC reviews',
  },
  {
    prefix: '/finance',
    allowedRoles: [Role.FINANCE_OPS, Role.SUPER_ADMIN],
    description: 'Finance reconciliation, failed payouts, and processor matching',
  },
  {
    prefix: '/support',
    allowedRoles: [Role.SUPPORT, Role.SUPER_ADMIN],
    description: 'Customer helpdesk and merchant support tickets',
  },
  {
    prefix: '/blogger',
    allowedRoles: [Role.BLOGGER, Role.SUPER_ADMIN],
    description: 'Public blog and CMS content management',
  },
  {
    prefix: '/dashboard',
    allowedRoles: [Role.OWNER, Role.SUPER_ADMIN],
    description: 'Sub-merchant owner dashboard and financial operations',
  },
] as const;

/**
 * Result of evaluating route RBAC authorization.
 */
export interface RouteAccessDecision {
  readonly isProtected: boolean;
  readonly allowed: boolean;
  readonly matchedRule?: RouteRule | undefined;
  readonly userRole?: Role | undefined;
  readonly statusCode: 200 | 401 | 403;
  readonly designatedHomeRoute: string;
  readonly reason?: string | undefined;
}

/**
 * Finds matching route rule for a given URL pathname.
 */
export function findMatchingRouteRule(pathname: string): RouteRule | null {
  for (const rule of ROUTE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule;
    }
  }
  return null;
}

/**
 * Checks whether a given pathname is protected by RBAC route rules.
 */
export function isProtectedRoute(pathname: string): boolean {
  return findMatchingRouteRule(pathname) !== null;
}

/**
 * Extracts and validates the actor's platform role from incoming HTTP headers or cookies.
 */
export function extractRoleFromRequest(
  request: NextRequest | Request
): Role | null {
  // 1. Direct standard role headers
  const headerRole =
    request.headers.get('x-user-role') ??
    request.headers.get('x-staff-role') ??
    request.headers.get('x-role');

  if (headerRole && isValidRole(headerRole)) {
    return headerRole as Role;
  }

  // 2. Cookie role inspection if NextRequest or headers with cookie
  if ('cookies' in request && request.cookies) {
    const cookieRole =
      request.cookies.get('kd_role')?.value ??
      request.cookies.get('x-user-role')?.value;

    if (cookieRole && isValidRole(cookieRole)) {
      return cookieRole as Role;
    }
  }

  return null;
}

/**
 * Evaluates access for a specific URL pathname against an optional user role.
 * Returns a complete decision structure with status code and designated redirect.
 */
export function evaluateRouteAccess(
  pathname: string,
  userRole?: Role | PlatformRole | string | null
): RouteAccessDecision {
  const matchedRule = findMatchingRouteRule(pathname);

  // Unprotected public route
  if (!matchedRule) {
    return {
      isProtected: false,
      allowed: true,
      statusCode: 200,
      designatedHomeRoute: userRole && isValidRole(userRole)
        ? getDashboardRouteForRole(userRole as Role)
        : '/dashboard',
    };
  }

  // Protected route, but user has no authenticated role
  if (!userRole || !isValidRole(userRole)) {
    return {
      isProtected: true,
      allowed: false,
      matchedRule,
      statusCode: 401,
      designatedHomeRoute: '/auth/login',
      reason: 'Authentication required to access protected dashboard route',
    };
  }

  const role = userRole as Role;
  const isAllowed = matchedRule.allowedRoles.includes(role);
  const designatedHomeRoute = getDashboardRouteForRole(role);

  if (!isAllowed) {
    return {
      isProtected: true,
      allowed: false,
      matchedRule,
      userRole: role,
      statusCode: 403,
      designatedHomeRoute,
      reason: `Access Denied: Role "${role}" is not authorized for route "${pathname}". Allowed roles: ${matchedRule.allowedRoles.join(', ')}.`,
    };
  }

  return {
    isProtected: true,
    allowed: true,
    matchedRule,
    userRole: role,
    statusCode: 200,
    designatedHomeRoute,
  };
}

/**
 * Asserts route access, throwing an Error if denied.
 */
export function assertRouteAccess(
  pathname: string,
  role?: Role | PlatformRole | string | null
): void {
  const decision = evaluateRouteAccess(pathname, role);
  if (!decision.allowed) {
    const errorMsg = decision.reason ?? `Access Denied for route "${pathname}".`;
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: 'Route RBAC check failed',
        meta: { pathname, role, statusCode: decision.statusCode },
      })
    );
    throw new Error(errorMsg);
  }
}


/**
 * Generates the appropriate Next.js HTTP response based on an RBAC route access decision.
 * For unauthorized roles (403), returns an immediate 403 Forbidden response with Location
 * header pointing to the user's designated home dashboard.
 */
export function createRbacResponse(
  decision: RouteAccessDecision,
  request: NextRequest,
  options?: {
    redirectMode?: 'forbidden_with_location' | 'redirect_dashboard' | 'json_only';
  }
): NextResponse {
  if (decision.allowed) {
    return NextResponse.next();
  }

  const mode = options?.redirectMode ?? 'forbidden_with_location';

  // 401: Unauthenticated -> redirect to /auth/login with returnTo
  if (decision.statusCode === 401) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('returnTo', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 403: Forbidden unauthorized role
  const homeRoute = decision.designatedHomeRoute;

  if (mode === 'redirect_dashboard') {
    const redirectUrl = new URL(homeRoute, request.url);
    redirectUrl.searchParams.set('error', 'forbidden');
    return NextResponse.redirect(redirectUrl);
  }

  // Default: 403 Forbidden with Location header to designated dashboard
  return new NextResponse(
    JSON.stringify({
      error: 'Forbidden',
      code: 'FORBIDDEN_ROLE',
      message: decision.reason,
      redirectUrl: homeRoute,
      designatedHomeRoute: homeRoute,
    }),
    {
      status: 403,
      statusText: 'Forbidden',
      headers: {
        'content-type': 'application/problem+json',
        location: homeRoute,
        'x-redirect-to': homeRoute,
      },
    }
  );
}

/**
 * React Server Component Guard: <RequirePermission>
 * Conditionally renders children if the provided role holds the specified permission.
 * Otherwise, renders an optional fallback or null.
 */
export interface RequirePermissionProps {
  readonly permission: Permission | SystemPermission | string;
  readonly role?: Role | PlatformRole | string | undefined;
  readonly fallback?: React.ReactNode | undefined;
  readonly children: React.ReactNode;
}

export function RequirePermission({
  permission,
  role,
  fallback = null,
  children,
}: RequirePermissionProps): React.ReactNode {
  if (!role) {
    return fallback;
  }

  const allowed = hasPermission(role, permission);
  return allowed ? children : fallback;
}

/**
 * React Server Component Guard: <RequireAllPermissions>
 * Renders children only when all listed permissions are held by the role.
 */
export interface RequireAllPermissionsProps {
  readonly permissions: readonly (Permission | SystemPermission | string)[];
  readonly role?: Role | PlatformRole | string | undefined;
  readonly fallback?: React.ReactNode | undefined;
  readonly children: React.ReactNode;
}

export function RequireAllPermissions({
  permissions,
  role,
  fallback = null,
  children,
}: RequireAllPermissionsProps): React.ReactNode {
  if (!role) {
    return fallback;
  }

  const allowed = hasAllPermissions(role, permissions as (Permission | string)[]);
  return allowed ? children : fallback;
}

/**
 * React Server Component Guard: <RequireAnyPermission>
 * Renders children if at least one of the listed permissions is held.
 */
export interface RequireAnyPermissionProps {
  readonly permissions: readonly (Permission | SystemPermission | string)[];
  readonly role?: Role | PlatformRole | string | undefined;
  readonly fallback?: React.ReactNode | undefined;
  readonly children: React.ReactNode;
}

export function RequireAnyPermission({
  permissions,
  role,
  fallback = null,
  children,
}: RequireAnyPermissionProps): React.ReactNode {
  if (!role) {
    return fallback;
  }

  const allowed = hasAnyPermission(role, permissions as (Permission | string)[]);
  return allowed ? children : fallback;
}
