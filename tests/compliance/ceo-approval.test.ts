// path: tests/compliance/ceo-approval.test.ts

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  executeCeoFinalKycApproval,
  enqueueSubMerchantProvisioningJob,
} from '@/lib/compliance/ceo-approval';
import { KycReviewCase } from '@/lib/compliance/review';
import { POST as approveRouteHandler } from '@/app/api/office/ceo/kyc-approvals/[id]/approve/route';

describe('Step 107: CEO Final KYC Approval & Super Admin Provisioning Authorization Gate', () => {
  const mockClearedReviewCase: KycReviewCase = {
    id: 'kyc_rev_cleared_01',
    tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
    companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
    riskLevel: 'standard',
    requiresFourEyes: false,
    firstReviewerId: 'officer_elena_01',
    firstReviewerDecision: 'approved',
    firstReviewerNotes: 'Clean e-commerce packet.',
    overallStatus: 'ready_for_ceo_approval',
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('Step 107.1: restricts approval authority strictly to CEO or Super Admin roles', () => {
    expect(() =>
      executeCeoFinalKycApproval({
        tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
        companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
        ceoUserId: 'user_support_01',
        actorRole: Role.SUPPORT, // UNAUTHORIZED ROLE
        totpCode: '123456',
        complianceReviewCase: mockClearedReviewCase,
        upstreamProcessorKybStatus: 'verified',
      })
    ).toThrow(/Unauthorized.*requires CEO or Super Admin role/);
  });

  it('Step 107.2: enforces mandatory 6-digit TOTP step-up reauthentication', () => {
    expect(() =>
      executeCeoFinalKycApproval({
        tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
        companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
        ceoUserId: 'ceo_alex_01',
        actorRole: Role.CEO,
        totpCode: 'invalid', // INVALID TOTP
        complianceReviewCase: mockClearedReviewCase,
        upstreamProcessorKybStatus: 'verified',
      })
    ).toThrow('Security Exception: A valid 6-digit TOTP authenticator code is mandatory');
  });

  it('Step 107.3: enforces processor-side authoritative KYB status must be verified before approval', () => {
    expect(() =>
      executeCeoFinalKycApproval({
        tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
        companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
        ceoUserId: 'ceo_alex_01',
        actorRole: Role.CEO,
        totpCode: '123456',
        complianceReviewCase: mockClearedReviewCase,
        upstreamProcessorKybStatus: 'rejected', // PROCESSOR REJECTED
      })
    ).toThrow(/Processor Precedence Rejection.*payment processor KYB status is 'rejected'/);

    expect(() =>
      executeCeoFinalKycApproval({
        tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
        companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
        ceoUserId: 'ceo_alex_01',
        actorRole: Role.CEO,
        totpCode: '123456',
        complianceReviewCase: mockClearedReviewCase,
        upstreamProcessorKybStatus: 'pending', // PROCESSOR STILL PENDING
      })
    ).toThrow(/Processor Precedence Rejection.*payment processor KYB status is 'pending'/);
  });

  it('Step 107.4: blocks approval if compliance review signatures are not fully completed', () => {
    const pendingComplianceCase: KycReviewCase = {
      ...mockClearedReviewCase,
      overallStatus: 'pending_second_review',
    };

    expect(() =>
      executeCeoFinalKycApproval({
        tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
        companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
        ceoUserId: 'ceo_alex_01',
        actorRole: Role.CEO,
        totpCode: '123456',
        complianceReviewCase: pendingComplianceCase,
        upstreamProcessorKybStatus: 'verified',
      })
    ).toThrow(/Compliance Gate Breach.*pending_second_review/);
  });

  it('Step 107.5: executes final CEO approval, enqueues gateway provisioning job, and creates audit log payload', () => {
    const result = executeCeoFinalKycApproval({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      ceoUserId: 'ceo_alex_01',
      actorRole: Role.CEO,
      totpCode: '123456',
      complianceReviewCase: mockClearedReviewCase,
      upstreamProcessorKybStatus: 'verified',
      policyVersion: '2026.11-v2',
    });

    expect(result.companyStatus).toBe('approved');
    expect(result.approvalId).toBeDefined();
    expect(result.provisioningJob.status).toBe('queued');
    expect(result.provisioningJob.jobId).toMatch(/^job_prov_/);
    expect(result.provisioningJob.targetGateways).toEqual([
      'nmi',
      'rainforest',
      'payoneer',
      'stripe_connect',
      'airwallex',
    ]);

    expect(result.auditLogInput.entity_type).toBe('company_kyc_approval');
    expect(result.auditLogInput.action).toBe('KYC_VERIFICATION_DECISION');
    expect(result.auditLogInput.payload?.['action']).toBe('CEO_FINAL_KYC_APPROVAL');
    expect(result.auditLogInput.payload?.['policyVersion']).toBe('2026.11-v2');
    expect(result.auditLogInput.payload?.['ceoUserId']).toBe('ceo_alex_01');
  });

  it('Step 107.6: verifies API route POST /api/office/ceo/kyc-approvals/[id]/approve endpoint', async () => {
    const validReq = new NextRequest(
      'http://localhost:3000/api/office/ceo/kyc-approvals/comp_999/approve',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          totpCode: '654321',
          upstreamProcessorKybStatus: 'verified',
          complianceReviewCase: mockClearedReviewCase,
        }),
      }
    );

    const res = await approveRouteHandler(validReq, { params: { id: 'comp_999' } });
    expect(res.status).toBe(200);

    const json = (await res.json()) as { success: boolean; companyStatus: string; provisioningJobId: string };
    expect(json.success).toBe(true);
    expect(json.companyStatus).toBe('approved');
    expect(json.provisioningJobId).toMatch(/^job_prov_/);
  });
});
