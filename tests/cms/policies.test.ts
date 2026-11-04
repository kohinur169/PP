// path: tests/cms/policies.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  PolicyRepository,
  seedPolicyCatalog,
  publishPolicyUpdate,
  checkMerchantPolicyReacceptanceRequired,
  clearPolicyStore,
  computeSimpleDiff,
} from '@/lib/cms/policies';
import { AuditLogRepository } from '@/lib/db/audit';
import {
  GET as getPolicies,
  POST as postPolicyAction,
} from '@/app/api/office/cms/policies/route';

describe('Step 082: CMS Editable Legal Policy Architecture & Versioned Re-Acceptance Engine', () => {
  const superAdminId = '018f6c4c-3500-7fa1-b1e2-000000000001';
  const bloggerStaffId = '018f6c4c-3500-7fa1-b1e2-500000000005';

  let policyRepo: PolicyRepository;
  let auditRepo: AuditLogRepository;
  let loggedAuditEvents: any[];

  beforeEach(async () => {
    clearPolicyStore();
    policyRepo = new PolicyRepository();
    loggedAuditEvents = [];

    auditRepo = {
      createLog: async (input: any) => {
        loggedAuditEvents.push(input);
        return {
          id: `audit_${Date.now()}`,
          ...input,
          created_at: new Date().toISOString(),
        } as any;
      },
    } as unknown as AuditLogRepository;

    await seedPolicyCatalog(policyRepo);
  });

  describe('Step 082.1: Policy Catalog Baseline & Seeding', () => {
    it('seeds baseline legal policies at version 1', async () => {
      const tos = await policyRepo.getActivePolicyBySlug('terms-of-service');
      expect(tos).not.toBeNull();
      expect(tos?.policy_version).toBe(1);
      expect(tos?.category).toBe('legal');
      expect(tos?.is_published).toBe(true);

      const privacy = await policyRepo.getActivePolicyBySlug('privacy-policy');
      expect(privacy?.policy_version).toBe(1);

      const kyc = await policyRepo.getActivePolicyBySlug('kyc-kyb-policy');
      expect(kyc?.policy_version).toBe(1);
      expect(kyc?.category).toBe('compliance');

      const all = await policyRepo.getAllActivePolicies();
      expect(all.length).toBeGreaterThanOrEqual(4);
    });

    it('computes line additions and deletions accurately in diff calculation', () => {
      const oldDoc = 'Line 1\nLine 2\nLine 3';
      const newDoc = 'Line 1\nLine 2 Modified\nLine 3\nLine 4 Added';

      const diff = computeSimpleDiff(oldDoc, newDoc);
      expect(diff.additions).toBe(2);
      expect(diff.deletions).toBe(1);
      expect(diff.diffSummary).toBe('+2 line(s), -1 line(s)');
    });
  });

  describe('Step 082.2 & Step 082.4: Version Increments, Publishing & Audit Trail', () => {
    it('increments policy version from v1 to v2, preserves history, and logs audit diff', async () => {
      const updatedMarkdown = `# KD Solution IT Merchant Services Terms of Service (v2.0)

## 1. Introduction and Scope
Updated scope with cross-border merchant aggregation terms.

## 2. Updated Rolling Reserves
Risk Tier 3 merchants are subject to a 10% 180-day rolling reserve.`;

      const result = await publishPolicyUpdate(
        {
          slug: 'terms-of-service',
          title: 'KD Solution IT Merchant Services Terms of Service',
          contentMd: updatedMarkdown,
          changeSummary: 'Added Risk Tier 3 rolling reserve clauses and cross-border provisions.',
          actorId: superAdminId,
          actorRole: Role.SUPER_ADMIN,
        },
        { repo: policyRepo, auditRepo }
      );

      expect(result.previousVersion).toBe(1);
      expect(result.newVersion).toBe(2);
      expect(result.policy.policy_version).toBe(2);
      expect(result.diff.additions).toBeGreaterThan(0);

      // Verify active version is now v2
      const active = await policyRepo.getActivePolicyBySlug('terms-of-service');
      expect(active?.policy_version).toBe(2);

      // Verify revision history contains both v2 and v1
      const history = await policyRepo.getPolicyVersionHistory('terms-of-service');
      expect(history).toHaveLength(2);
      expect(history[0]?.policy_version).toBe(2);
      expect(history[1]?.policy_version).toBe(1);

      // Step 082.4: Verify audit log entry
      const audit = loggedAuditEvents.find((e) => e.action === 'POLICY_VERSION_PUBLISHED');
      expect(audit).toBeDefined();
      expect(audit.payload.slug).toBe('terms-of-service');
      expect(audit.payload.previousVersion).toBe(1);
      expect(audit.payload.newVersion).toBe(2);
      expect(audit.payload.editorId).toBe(superAdminId);
    });

    it('rejects policy publication attempt by non-Super Admin role', async () => {
      await expect(
        publishPolicyUpdate(
          {
            slug: 'privacy-policy',
            title: 'Privacy Policy',
            contentMd: 'Unauthorized change attempt',
            actorId: bloggerStaffId,
            actorRole: Role.BLOGGER,
          },
          { repo: policyRepo, auditRepo }
        )
      ).rejects.toThrow(/Unauthorized policy edit/);
    });
  });

  describe('Step 082.3: Re-Acceptance Trigger Evaluation for Sub-Merchants', () => {
    it('evaluates whether merchant re-acceptance is required based on accepted version vs active version', async () => {
      // At baseline v1: merchant has accepted v1 -> not required
      const checkV1 = await checkMerchantPolicyReacceptanceRequired(1, 'terms-of-service', policyRepo);
      expect(checkV1.required).toBe(false);
      expect(checkV1.activeVersion).toBe(1);

      // Publish v2
      await publishPolicyUpdate(
        {
          slug: 'terms-of-service',
          title: 'Terms of Service',
          contentMd: '# Terms v2\nUpdated terms content.',
          actorId: superAdminId,
          actorRole: Role.SUPER_ADMIN,
        },
        { repo: policyRepo, auditRepo }
      );

      // Merchant still has accepted version 1 -> Re-acceptance REQUIRED!
      const checkV2Pending = await checkMerchantPolicyReacceptanceRequired(1, 'terms-of-service', policyRepo);
      expect(checkV2Pending.required).toBe(true);
      expect(checkV2Pending.activeVersion).toBe(2);
      expect(checkV2Pending.acceptedVersion).toBe(1);

      // After merchant accepts v2 -> Re-acceptance cleared
      const checkV2Accepted = await checkMerchantPolicyReacceptanceRequired(2, 'terms-of-service', policyRepo);
      expect(checkV2Accepted.required).toBe(false);

      // New merchant with null accepted version -> Re-acceptance REQUIRED
      const checkNull = await checkMerchantPolicyReacceptanceRequired(null, 'terms-of-service', policyRepo);
      expect(checkNull.required).toBe(true);
    });
  });

  describe('HTTP API Route Integration: /api/office/cms/policies', () => {
    it('allows GET requests to list all active policies', async () => {
      const req = new NextRequest('http://localhost/api/office/cms/policies');
      const res = await getPolicies(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.policies.length).toBeGreaterThanOrEqual(4);
    });

    it('allows GET requests with ?slug=terms-of-service to return policy and history', async () => {
      const req = new NextRequest('http://localhost/api/office/cms/policies?slug=terms-of-service');
      const res = await getPolicies(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.activePolicy.slug).toBe('terms-of-service');
      expect(data.history).toBeDefined();
    });

    it('allows Super Admin to publish a new policy revision via POST', async () => {
      const req = new NextRequest('http://localhost/api/office/cms/policies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.SUPER_ADMIN,
          'x-user-id': superAdminId,
        },
        body: JSON.stringify({
          action: 'publish',
          slug: 'privacy-policy',
          title: 'KD Solution IT Privacy Policy',
          contentMd: '# Privacy Policy (v2)\nUpdated GDPR retention rules.',
          changeSummary: 'Updated GDPR data retention and deletion timeframes.',
        }),
      });

      const res = await postPolicyAction(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.newVersion).toBe(2);
      expect(data.diff).toBeDefined();
    });

    it('rejects unauthorized roles attempting to publish via POST with HTTP 403', async () => {
      const req = new NextRequest('http://localhost/api/office/cms/policies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.BLOGGER,
          'x-user-id': bloggerStaffId,
        },
        body: JSON.stringify({
          action: 'publish',
          slug: 'terms-of-service',
          title: 'Hacked Terms',
          contentMd: 'Unauthorized modification',
        }),
      });

      const res = await postPolicyAction(req);
      expect(res.status).toBe(403);
    });
  });
});
