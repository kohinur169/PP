// path: tests/compliance/terms.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  recordTermsAcceptance,
  hasAcceptedLatestTerms,
  getUnacceptedPolicies,
  getActivePolicy,
  getAllActivePolicies,
  updatePolicyVersion,
  resetPoliciesForTest,
  hashPolicyContent,
  TermsAcceptanceRepository,
} from '@/lib/compliance/terms';
import { AuditLogRepository } from '@/lib/db/audit';
import { GET as getTermsStatus, POST as postAcceptTerms } from '@/app/api/compliance/terms/route';

describe('Step 076: Legal Terms Acceptance Engine with Version, IP & Timestamp Audit', () => {
  const userId = '018f6c4c-3500-7fa1-b1e2-100000000001';
  const companyId = '018f6c4c-3500-7fa1-b1e2-000000000099';
  const clientIp = '203.0.113.195';
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

  let termsRepo: TermsAcceptanceRepository;
  let auditRepo: AuditLogRepository;
  let loggedAuditEvents: any[];

  beforeEach(() => {
    resetPoliciesForTest();
    termsRepo = new TermsAcceptanceRepository();
    loggedAuditEvents = [];

    auditRepo = {
      createLog: async (input: any) => {
        loggedAuditEvents.push(input);
        return {
          id: `audit_mock_${Date.now()}`,
          ...input,
          created_at: new Date().toISOString(),
        } as any;
      },
    } as unknown as AuditLogRepository;
  });

  describe('Step 076.1 & Step 076.2: Immutable Terms Acceptance Recording', () => {
    it('records legal terms acceptance with exact IP, timestamp, version, and policy SHA-256 hash', async () => {
      const policySlug = 'merchant_agreement';
      const policy = getActivePolicy(policySlug);
      expect(policy).toBeDefined();

      const acceptance = await recordTermsAcceptance(
        userId,
        policySlug,
        clientIp,
        userAgent,
        {
          companyId,
          termsRepo,
          auditRepo,
        }
      );

      // Verify returned database entity fields
      expect(acceptance).toBeDefined();
      expect(acceptance.user_id).toBe(userId);
      expect(acceptance.company_id).toBe(companyId);
      expect(acceptance.policy_slug).toBe(policySlug);
      expect(acceptance.policy_version).toBe(policy!.version);
      expect(acceptance.policy_hash).toBe(policy!.hash);
      expect(acceptance.policy_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(acceptance.ip_address).toBe(clientIp);
      expect(acceptance.user_agent).toBe(userAgent);
      expect(acceptance.accepted_at).toBeDefined();

      // Verify audit trail entry
      expect(loggedAuditEvents).toHaveLength(1);
      const audit = loggedAuditEvents[0];
      expect(audit.action).toBe('LEGAL_TERMS_ACCEPTED');
      expect(audit.actor_id).toBe(userId);
      expect(audit.company_id).toBe(companyId);
      expect(audit.payload.policyHash).toBe(policy!.hash);
    });

    it('rejects recording when mandatory identity, IP, or user agent is missing', async () => {
      await expect(
        recordTermsAcceptance('', 'merchant_agreement', clientIp, userAgent, { termsRepo })
      ).rejects.toThrow(/User ID is required/);

      await expect(
        recordTermsAcceptance(userId, '', clientIp, userAgent, { termsRepo })
      ).rejects.toThrow(/Policy slug is required/);

      await expect(
        recordTermsAcceptance(userId, 'merchant_agreement', '', userAgent, { termsRepo })
      ).rejects.toThrow(/Client IP address is required/);

      await expect(
        recordTermsAcceptance(userId, 'merchant_agreement', clientIp, '', { termsRepo })
      ).rejects.toThrow(/User agent is required/);

      await expect(
        recordTermsAcceptance(userId, 'non_existent_policy', clientIp, userAgent, { termsRepo })
      ).rejects.toThrow(/Unknown legal policy slug/);
    });
  });

  describe('Step 076.2 & Step 076.4: Versioning, Status Verification & Policy Updates', () => {
    it('reports pending terms when user has not yet accepted active mandatory policies', async () => {
      const hasAccepted = await hasAcceptedLatestTerms(userId, 'merchant_agreement', termsRepo);
      expect(hasAccepted).toBe(false);

      const unaccepted = await getUnacceptedPolicies(userId, termsRepo);
      expect(unaccepted.length).toBeGreaterThanOrEqual(4);
      expect(unaccepted.some((p) => p.slug === 'merchant_agreement')).toBe(true);
      expect(unaccepted.some((p) => p.slug === 'privacy_policy')).toBe(true);
    });

    it('requires fresh re-acceptance whenever a policy version is updated', async () => {
      const policySlug = 'merchant_agreement';

      // 1. User accepts version 2.1.0
      await recordTermsAcceptance(userId, policySlug, clientIp, userAgent, {
        companyId,
        termsRepo,
      });

      let isAccepted = await hasAcceptedLatestTerms(userId, policySlug, termsRepo);
      expect(isAccepted).toBe(true);

      // 2. Compliance officer updates policy to version 2.2.0 with modified terms
      const updatedPolicy = updatePolicyVersion(
        policySlug,
        '2.2.0',
        'KD SOLUTION IT MASTER MERCHANT SERVICES AGREEMENT (v2.2.0)\nUpdated reserve withholding criteria and arbitration clauses for 2026.'
      );

      // 3. Status must immediately revert to unaccepted because active version is now 2.2.0
      isAccepted = await hasAcceptedLatestTerms(userId, policySlug, termsRepo);
      expect(isAccepted).toBe(false);

      // Policy must appear in unaccepted list
      const unaccepted = await getUnacceptedPolicies(userId, termsRepo);
      const pendingAgreement = unaccepted.find((p) => p.slug === policySlug);
      expect(pendingAgreement).toBeDefined();
      expect(pendingAgreement?.version).toBe('2.2.0');
      expect(pendingAgreement?.hash).toBe(updatedPolicy.hash);

      // 4. User accepts updated version 2.2.0 -> status becomes accepted again
      await recordTermsAcceptance(userId, policySlug, clientIp, userAgent, {
        companyId,
        termsRepo,
      });

      isAccepted = await hasAcceptedLatestTerms(userId, policySlug, termsRepo);
      expect(isAccepted).toBe(true);
    });

    it('verifies SHA-256 hash changes whenever policy text changes', () => {
      const hash1 = hashPolicyContent('Policy text version 1');
      const hash2 = hashPolicyContent('Policy text version 2');
      const hash1Repeat = hashPolicyContent('  Policy text version 1  ');

      expect(hash1).not.toBe(hash2);
      expect(hash1).toBe(hash1Repeat);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('Step 076.4: HTTP API Route Integration', () => {
    it('returns 401 when x-user-id header is missing on GET /api/compliance/terms', async () => {
      const req = new NextRequest('http://localhost/api/compliance/terms');
      const res = await getTermsStatus(req);
      expect(res.status).toBe(401);
    });

    it('queries unaccepted policies and records acceptance via API routes', async () => {
      // 1. Query unaccepted policies for a fresh user
      const queryReq = new NextRequest('http://localhost/api/compliance/terms', {
        headers: {
          'x-user-id': userId,
          'x-company-id': companyId,
        },
      });

      const queryRes = await getTermsStatus(queryReq);
      expect(queryRes.status).toBe(200);
      const queryData = await queryRes.json();
      expect(queryData.success).toBe(true);
      expect(queryData.hasPendingTerms).toBe(true);
      expect(queryData.unacceptedCount).toBeGreaterThanOrEqual(1);

      // 2. Accept multiple policies via POST
      const acceptReq = new NextRequest('http://localhost/api/compliance/terms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-company-id': companyId,
          'x-real-ip': clientIp,
        },
        body: JSON.stringify({
          policySlugs: ['merchant_agreement', 'privacy_policy', 'acceptable_use', 'e_sign_consent'],
        }),
      });

      const acceptRes = await postAcceptTerms(acceptReq);
      expect(acceptRes.status).toBe(201);
      const acceptData = await acceptRes.json();
      expect(acceptData.success).toBe(true);
      expect(acceptData.acceptedCount).toBe(4);
      expect(acceptData.acceptances[0].ip_address).toBe(clientIp);

      // 3. Query again -> all mandatory policies are accepted
      const checkReq = new NextRequest('http://localhost/api/compliance/terms', {
        headers: {
          'x-user-id': userId,
          'x-company-id': companyId,
        },
      });

      const checkRes = await getTermsStatus(checkReq);
      expect(checkRes.status).toBe(200);
      const checkData = await checkRes.json();
      expect(checkData.hasPendingTerms).toBe(false);
      expect(checkData.unacceptedCount).toBe(0);
    });
  });
});
