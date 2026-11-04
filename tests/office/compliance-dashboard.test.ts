// path: tests/office/compliance-dashboard.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Role, Permission, hasPermission } from '@/lib/auth/roles';
import {
  listUnderwritingReviews,
  escalateUnderwritingToCeo,
  listFlaggedPayments,
  decidePaymentReview,
  listSarCases,
  createSarCase,
  updateSarFilingStatus,
  seedUnderwritingItemForTest,
  seedFlaggedPaymentForTest,
  seedSarCaseForTest,
  resetComplianceDataForTest,
  UnderwritingReviewItem,
  ManualPaymentReviewItem,
  SarCase,
} from '@/lib/office/compliance-engine';
import { AuditLogRepository } from '@/lib/db/audit';
import { GET as underwritingGetHandler, POST as underwritingPostHandler } from '@/app/api/office/compliance/underwriting/route';
import { GET as paymentsGetHandler, POST as paymentsPostHandler } from '@/app/api/office/compliance/payments/review/route';
import { GET as sarGetHandler, POST as sarPostHandler } from '@/app/api/office/compliance/sar/route';

describe('Step 068: Compliance & KYC Officer Dedicated Dashboard', () => {
  let auditRepo: AuditLogRepository;

  const COMPLIANCE_OFFICER_ID = '018f6c4c-3500-7fa1-b1e2-200000000002';
  const SUPPORT_OFFICER_ID = '018f6c4c-3500-7fa1-b1e2-300000000003';
  const FINANCE_OFFICER_ID = '018f6c4c-3500-7fa1-b1e2-400000000004';
  const BLOGGER_ID = '018f6c4c-3500-7fa1-b1e2-500000000005';

  const SAMPLE_COMPANY_ID = '018f6c4c-3500-7fa1-b1e2-123456789abc';

  beforeEach(() => {
    auditRepo = new AuditLogRepository();
    resetComplianceDataForTest();

    // Seed underwriting review item
    const underwritingItem: UnderwritingReviewItem = {
      id: 'und_01',
      companyId: SAMPLE_COMPANY_ID,
      legalName: 'Acme Digital Goods LLC',
      dbaName: 'Acme Software',
      businessType: 'llc',
      registrationNumber: 'US-REG-101',
      country: 'US',
      mcc: '5734',
      submittedDocuments: ['Certificate_of_Formation.pdf', 'Passport.pdf'],
      sanctionsScreeningResult: 'CLEARED',
      uboVerified: false,
      recommendedRiskTier: 2,
      status: 'pending_review',
    };
    seedUnderwritingItemForTest(underwritingItem);

    // Seed flagged payment
    const paymentItem: ManualPaymentReviewItem = {
      id: 'rev_01',
      chargeId: 'ch_018f6c4c-3500-7fa1-b1e2-000000000101',
      companyId: SAMPLE_COMPANY_ID,
      merchantName: 'Acme Digital Goods LLC',
      amountUsd: 8500.0,
      flagReason: 'AMOUNT_EXCEEDS_5K',
      customerEmail: 'buyer@enterprise.com',
      processor: 'stripe_connect',
      status: 'pending_review',
    };
    seedFlaggedPaymentForTest(paymentItem);

    // Seed confidential SAR case
    const sarItem: SarCase = {
      id: 'sar_01',
      caseNumber: 'SAR-2026-0001',
      companyId: SAMPLE_COMPANY_ID,
      subjectName: 'Anonymous Off-Shore Wholesale Buyer',
      suspectedActivity: 'STRUCTURING',
      narrative: 'Rapid consecutive $9,500 payments below $10k CTR threshold.',
      totalSuspiciousAmountUsd: 28500.0,
      fincenFilingStatus: 'draft',
      preparedBy: COMPLIANCE_OFFICER_ID,
      preparedAt: '2026-11-04T12:00:00.000Z',
      isConfidential: true,
    };
    seedSarCaseForTest(sarItem);
  });

  describe('Step 068.1: Compliance Role Scoping & Isolation Matrix', () => {
    it('verifies compliance_kyc possesses dedicated review permissions', () => {
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.REVIEW_KYC)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.MANUAL_PAYMENT_REVIEW)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.PREPARE_SAR)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.VIEW_SAR)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.SANCTIONS_PEP_SCREEN)).toBe(true);
    });

    it('strictly denies Support, Blogger, and Finance from viewing or preparing confidential SARs', () => {
      expect(hasPermission(Role.SUPPORT, Permission.VIEW_SAR)).toBe(false);
      expect(hasPermission(Role.SUPPORT, Permission.PREPARE_SAR)).toBe(false);
      expect(hasPermission(Role.BLOGGER, Permission.VIEW_SAR)).toBe(false);
      expect(hasPermission(Role.BLOGGER, Permission.PREPARE_SAR)).toBe(false);
      expect(hasPermission(Role.FINANCE_OPS, Permission.VIEW_SAR)).toBe(false);
      expect(hasPermission(Role.FINANCE_OPS, Permission.PREPARE_SAR)).toBe(false);
    });
  });

  describe('Step 068.2: Merchant Underwriting Review Queue & Escalation to CEO', () => {
    it('lists pending merchant underwriting review applications', async () => {
      const items = await listUnderwritingReviews(Role.COMPLIANCE_KYC);
      expect(items.length).toBeGreaterThanOrEqual(1);
      const found = items.find((i) => i.id === 'und_01');
      expect(found).toBeDefined();
      expect(found?.legalName).toBe('Acme Digital Goods LLC');
      expect(found?.sanctionsScreeningResult).toBe('CLEARED');
    });

    it('denies unauthorized roles from listing underwriting applications', async () => {
      await expect(listUnderwritingReviews(Role.SUPPORT)).rejects.toThrow(/Access Denied/);
      await expect(listUnderwritingReviews(Role.BLOGGER)).rejects.toThrow(/Access Denied/);
    });

    it('escalates underwriting packet to CEO with compliance officer recommendations and audit trail', async () => {
      const escalated = await escalateUnderwritingToCeo({
        reviewId: 'und_01',
        officerId: COMPLIANCE_OFFICER_ID,
        officerRole: Role.COMPLIANCE_KYC,
        recommendedRiskTier: 1,
        officerNotes: 'Beneficial ownership verified. Zero adverse media. Low risk profile.',
        auditRepo,
      });

      expect(escalated.status).toBe('escalated_to_ceo');
      expect(escalated.recommendedRiskTier).toBe(1);
      expect(escalated.uboVerified).toBe(true);
      expect(escalated.officerNotes).toContain('Beneficial ownership verified');

      // Verify audit log
      const logs = await auditRepo.findMany();
      const underLog = logs.find((l) => l.action === 'KYC_STATUS_UPDATED');
      expect(underLog).toBeDefined();
      expect(underLog?.actor_id).toBe(COMPLIANCE_OFFICER_ID);
      expect(underLog?.payload.status).toBe('escalated_to_ceo');
      expect(underLog?.payload.recommendedRiskTier).toBe(1);
    });
  });

  describe('Step 068.3: Manual Payment Review Interface (> $5k & AVS Mismatches)', () => {
    it('lists high-value or mismatched transactions flagged for manual review', async () => {
      const flagged = await listFlaggedPayments(Role.COMPLIANCE_KYC);
      expect(flagged.length).toBeGreaterThanOrEqual(1);
      const item = flagged.find((f) => f.id === 'rev_01');
      expect(item).toBeDefined();
      expect(item?.amountUsd).toBe(8500.0);
      expect(item?.flagReason).toBe('AMOUNT_EXCEEDS_5K');
    });

    it('resolves payment review by releasing funds to settlement', async () => {
      const decided = await decidePaymentReview({
        paymentReviewId: 'rev_01',
        officerId: COMPLIANCE_OFFICER_ID,
        officerRole: Role.COMPLIANCE_KYC,
        decision: 'release',
        notes: 'Invoiced B2B purchase verified by customer contact.',
        auditRepo,
      });

      expect(decided.status).toBe('released');
      expect(decided.decisionBy).toBe(COMPLIANCE_OFFICER_ID);
      expect(decided.decisionNotes).toContain('Invoiced B2B purchase');

      // Verify audit log
      const logs = await auditRepo.findMany();
      const decLog = logs.find((l) => l.action === 'TRANSACTION_REVIEW_DECIDED');
      expect(decLog).toBeDefined();
      expect(decLog?.payload.decision).toBe('release');
      expect(decLog?.payload.amountUsd).toBe(8500.0);
    });

    it('resolves payment review by cancelling transaction as fraudulent', async () => {
      // Seed an AVS mismatch item
      seedFlaggedPaymentForTest({
        id: 'rev_fraud_02',
        chargeId: 'ch_018f6c4c-3500-7fa1-b1e2-000000000102',
        companyId: SAMPLE_COMPANY_ID,
        merchantName: 'Acme Digital Goods LLC',
        amountUsd: 3200.0,
        flagReason: 'AVS_MISMATCH',
        customerEmail: 'stolen_card@fake.net',
        processor: 'nmi',
        status: 'pending_review',
      });

      const cancelled = await decidePaymentReview({
        paymentReviewId: 'rev_fraud_02',
        officerId: COMPLIANCE_OFFICER_ID,
        officerRole: Role.COMPLIANCE_KYC,
        decision: 'cancel_fraud',
        notes: 'AVS billing zip does not match issuing bank record. Blacklisted card.',
        auditRepo,
      });

      expect(cancelled.status).toBe('cancelled_fraud');

      const logs = await auditRepo.findMany();
      const fraudLog = logs.find((l) => l.payload.paymentReviewId === 'rev_fraud_02');
      expect(fraudLog).toBeDefined();
      expect(fraudLog?.payload.decision).toBe('cancel_fraud');
    });
  });

  describe('Step 068.4: Confidential SAR Case Workspace & Strict Isolation', () => {
    it('allows compliance officer to list confidential SAR cases', async () => {
      const cases = await listSarCases(Role.COMPLIANCE_KYC);
      expect(cases.length).toBeGreaterThanOrEqual(1);
      const found = cases.find((c) => c.id === 'sar_01');
      expect(found).toBeDefined();
      expect(found?.isConfidential).toBe(true);
      expect(found?.suspectedActivity).toBe('STRUCTURING');
    });

    it('strictly denies Support and Blogger roles from accessing confidential SAR cases', async () => {
      await expect(listSarCases(Role.SUPPORT)).rejects.toThrow(/Access Denied/);
      await expect(listSarCases(Role.BLOGGER)).rejects.toThrow(/Access Denied/);
      await expect(listSarCases(Role.FINANCE_OPS)).rejects.toThrow(/Access Denied/);
    });

    it('drafts a new confidential SAR case with BSA/AML narrative', async () => {
      const newSar = await createSarCase({
        companyId: SAMPLE_COMPANY_ID,
        subjectName: 'Transcontinental Trading Group',
        suspectedActivity: 'MONEY_LAUNDERING',
        narrative: 'Layering pattern identified: funds deposited via prepaid cards and rapidly dispersed.',
        totalSuspiciousAmountUsd: 45000.0,
        officerId: COMPLIANCE_OFFICER_ID,
        officerRole: Role.COMPLIANCE_KYC,
        auditRepo,
      });

      expect(newSar.id).toBeDefined();
      expect(newSar.caseNumber).toMatch(/^SAR-2026-\d{4}$/);
      expect(newSar.isConfidential).toBe(true);
      expect(newSar.fincenFilingStatus).toBe('draft');

      // Update filing status to ready_for_filing
      const updatedSar = await updateSarFilingStatus({
        sarId: newSar.id,
        status: 'ready_for_filing',
        officerId: COMPLIANCE_OFFICER_ID,
        officerRole: Role.COMPLIANCE_KYC,
        auditRepo,
      });

      expect(updatedSar.fincenFilingStatus).toBe('ready_for_filing');
    });
  });

  describe('HTTP API Endpoints Integration Verification Gate', () => {
    it('GET /api/office/compliance/underwriting returns 200 for compliance and 403 for support', async () => {
      const reqSupport = new Request('http://localhost:3000/api/office/compliance/underwriting', {
        headers: { 'x-staff-role': 'support' },
      });
      const resSupport = await underwritingGetHandler(reqSupport);
      expect(resSupport.status).toBe(403);

      const reqCompliance = new Request('http://localhost:3000/api/office/compliance/underwriting', {
        headers: { 'x-staff-role': 'compliance_kyc' },
      });
      const resCompliance = await underwritingGetHandler(reqCompliance);
      expect(resCompliance.status).toBe(200);
      const json = await resCompliance.json();
      expect(Array.isArray(json.items)).toBe(true);
    });

    it('POST /api/office/compliance/underwriting escalates review to CEO', async () => {
      const request = new Request('http://localhost:3000/api/office/compliance/underwriting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': COMPLIANCE_OFFICER_ID,
          'x-staff-role': 'compliance_kyc',
        },
        body: JSON.stringify({
          reviewId: 'und_01',
          recommendedRiskTier: 1,
          officerNotes: 'Escalation verified via HTTP API route.',
        }),
      });

      const response = await underwritingPostHandler(request, { auditRepo });
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.item.status).toBe('escalated_to_ceo');
    });

    it('GET /api/office/compliance/payments/review returns flagged payment reviews', async () => {
      const request = new Request('http://localhost:3000/api/office/compliance/payments/review', {
        headers: { 'x-staff-role': 'compliance_kyc' },
      });

      const response = await paymentsGetHandler(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.items.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/office/compliance/payments/review records decision', async () => {
      const request = new Request('http://localhost:3000/api/office/compliance/payments/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': COMPLIANCE_OFFICER_ID,
          'x-staff-role': 'compliance_kyc',
        },
        body: JSON.stringify({
          paymentReviewId: 'rev_01',
          decision: 'release',
          notes: 'Customer confirmed transaction via two-factor challenge.',
        }),
      });

      const response = await paymentsPostHandler(request, { auditRepo });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.item.status).toBe('released');
    });

    it('GET /api/office/compliance/sar strictly returns 403 Forbidden for non-compliance staff', async () => {
      const reqSupport = new Request('http://localhost:3000/api/office/compliance/sar', {
        headers: { 'x-staff-role': 'support' },
      });
      const resSupport = await sarGetHandler(reqSupport);
      expect(resSupport.status).toBe(403);

      const reqFinance = new Request('http://localhost:3000/api/office/compliance/sar', {
        headers: { 'x-staff-role': 'finance_ops' },
      });
      const resFinance = await sarGetHandler(reqFinance);
      expect(resFinance.status).toBe(403);

      const reqCompliance = new Request('http://localhost:3000/api/office/compliance/sar', {
        headers: { 'x-staff-role': 'compliance_kyc' },
      });
      const resCompliance = await sarGetHandler(reqCompliance);
      expect(resCompliance.status).toBe(200);
    });

    it('POST /api/office/compliance/sar creates new SAR case', async () => {
      const request = new Request('http://localhost:3000/api/office/compliance/sar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': COMPLIANCE_OFFICER_ID,
          'x-staff-role': 'compliance_kyc',
        },
        body: JSON.stringify({
          companyId: SAMPLE_COMPANY_ID,
          subjectName: 'Sanction Evasion Test Actor',
          suspectedActivity: 'SANCTIONS_EVASION',
          narrative: 'IP geofencing alert triggered routing through high-risk embargoed proxy.',
          totalSuspiciousAmountUsd: 12500,
        }),
      });

      const response = await sarPostHandler(request, { auditRepo });
      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.sarCase.isConfidential).toBe(true);
    });
  });
});
