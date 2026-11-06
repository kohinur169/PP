// path: app/api/office/cms/policies/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  PolicyRepository,
  seedPolicyCatalog,
  publishPolicyUpdate,
} from '@/lib/cms/policies';

export const dynamic = 'force-dynamic';

const policyRepo = new PolicyRepository();

/**
 * Step 082.2: GET /api/office/cms/policies
 * Returns active policy documents and version history.
 */
export async function GET(req: NextRequest | Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');

  await seedPolicyCatalog(policyRepo);

  if (slug) {
    const active = await policyRepo.getActivePolicyBySlug(slug);
    if (!active) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/not-found',
          title: 'Policy Not Found',
          status: 404,
          detail: `Policy with slug "${slug}" does not exist.`,
        },
        { status: 404 }
      );
    }

    const history = await policyRepo.getPolicyVersionHistory(slug);
    return NextResponse.json({
      success: true,
      activePolicy: active,
      history,
    });
  }

  const all = await policyRepo.getAllActivePolicies();
  return NextResponse.json({
    success: true,
    policies: all,
  });
}

/**
 * Step 082.2 & Step 082.4: POST /api/office/cms/policies
 * Publishes a new policy version with markdown content and audit diff tracking.
 */
export async function POST(req: NextRequest | Request) {
  const roleHeader =
    req.headers.get('x-user-role') ||
    req.headers.get('x-staff-role') ||
    '';

  const actorRole = roleHeader as Role;
  const actorId = req.headers.get('x-user-id') || '00000000-0000-0000-0000-000000000000';

  if (actorRole !== Role.SUPER_ADMIN) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/forbidden',
        title: 'Access Denied',
        status: 403,
        detail: 'Only Super Admin can publish and edit legal policy documents.',
      },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/bad-request',
        title: 'Invalid Request Body',
        status: 400,
        detail: 'JSON body required.',
      },
      { status: 400 }
    );
  }

  const { slug, title, contentMd, category, changeSummary } = body;

  if (!slug || !title || !contentMd) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/bad-request',
        title: 'Missing Required Fields',
        status: 400,
        detail: '"slug", "title", and "contentMd" are required.',
      },
      { status: 400 }
    );
  }

  try {
    const result = await publishPolicyUpdate({
      slug,
      title,
      contentMd,
      category,
      changeSummary,
      actorId,
      actorRole,
    });

    return NextResponse.json({
      success: true,
      message: `Policy "${title}" version ${result.newVersion} published successfully. Re-acceptance triggers active.`,
      policy: result.policy,
      previousVersion: result.previousVersion,
      newVersion: result.newVersion,
      diff: result.diff,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/publish-failed',
        title: 'Publish Failed',
        status: 400,
        detail: err.message || 'Failed to publish legal policy update.',
      },
      { status: 400 }
    );
  }
}
