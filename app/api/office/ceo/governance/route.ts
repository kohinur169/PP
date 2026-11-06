// path: app/api/office/ceo/governance/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  proposeGovernancePolicy,
  signOffGovernancePolicy,
  getAllowedOperatingCountries,
} from '@/lib/office/ceo-approvals';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';

export const dynamic = 'force-dynamic';

function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance = '/api/office/ceo/governance',
  errorCode = 'GOVERNANCE_ERROR'
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
 * Step 067.3: GET /api/office/ceo/governance
 * Retrieves current allowed operating countries and governance state.
 */
export async function GET(): Promise<Response> {
  const countries = getAllowedOperatingCountries();
  return NextResponse.json({ allowedCountries: countries }, { status: 200 });
}

/**
 * Step 067.3 & Step 067.4: POST /api/office/ceo/governance
 * Proposes or signs off joint governance policies between CEO and Super Admin.
 */
export async function POST(
  request: NextRequest | Request,
  options?: { readonly auditRepo?: AuditLogRepository | undefined }
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return createProblemResponse(400, 'Malformed Request Body', 'Request body must be valid JSON.');
  }

  const actorId =
    request.headers.get('x-staff-id') ||
    request.headers.get('x-user-id') ||
    (typeof body.actorId === 'string' ? body.actorId : '018f6c4c-3500-7fa1-b1e2-200000000001');

  const actorRoleStr =
    request.headers.get('x-staff-role') ||
    request.headers.get('x-user-role') ||
    (typeof body.actorRole === 'string' ? body.actorRole : Role.CEO);

  const actorRole = actorRoleStr as Role;

  const action = typeof body.action === 'string' ? body.action : 'propose';

  try {
    if (action === 'signoff') {
      const proposalId = typeof body.proposalId === 'string' ? body.proposalId : '';
      const proposal = await signOffGovernancePolicy({
        proposalId,
        actorId,
        actorRole,
        auditRepo: options?.auditRepo,
      });

      return NextResponse.json(
        {
          success: true,
          message: 'Joint governance policy signed off with Ed25519 signature.',
          proposal,
        },
        { status: 200 }
      );
    }

    // Default: Propose policy
    const type = (typeof body.type === 'string' ? body.type : 'country_enable_disable') as
      | 'country_enable_disable'
      | 'pricing_structure';
    const title = typeof body.title === 'string' ? body.title : 'Policy Proposal';
    const payload = typeof body.payload === 'object' && body.payload !== null ? (body.payload as Record<string, unknown>) : {};

    const proposal = await proposeGovernancePolicy({
      type,
      title,
      payload,
      actorId,
      actorRole,
      auditRepo: options?.auditRepo,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Policy proposal created. Requires complementary executive sign-off.',
        proposal,
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Governance action failed';
    const status = msg.includes('violation') || msg.includes('Only CEO') ? 403 : 400;
    const title = status === 403 ? 'Forbidden' : 'Bad Request';
    return createProblemResponse(status, title, msg);
  }
}
