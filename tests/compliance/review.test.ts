// path: tests/compliance/review.test.ts

import { describe, it, expect } from 'vitest';
import {
  createKycReviewCase,
  submitFirstReviewerDecision,
  submitSecondReviewerDecision,
  canAdvanceToCeoApproval,
} from '@/lib/compliance/review';

describe('Step 106: Four-Eye Compliance Review Queue for Merchant Applications', () => {
  it('Step 106.1: initializes standard merchant with single compliance review and advances directly to CEO queue', () => {
    const initialCase = createKycReviewCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      riskLevel: 'standard',
    });

    expect(initialCase.requiresFourEyes).toBe(false);
    expect(initialCase.overallStatus).toBe('pending_first_review');
    expect(canAdvanceToCeoApproval(initialCase)).toBe(false);

    const approvedCase = submitFirstReviewerDecision({
      reviewCase: initialCase,
      reviewerId: 'officer_elena_01',
      decision: 'approved',
      notes: 'Standard e-commerce merchant with clean KYB packet and active website.',
    });

    expect(approvedCase.overallStatus).toBe('ready_for_ceo_approval');
    expect(approvedCase.firstReviewerId).toBe('officer_elena_01');
    expect(canAdvanceToCeoApproval(approvedCase)).toBe(true);
  });

  it('Step 106.2: flags high-risk MCC and elevated volume applications for mandatory Four-Eye dual review', () => {
    const highRiskCase = createKycReviewCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      riskLevel: 'high_risk',
    });

    expect(highRiskCase.requiresFourEyes).toBe(true);
    expect(highRiskCase.overallStatus).toBe('pending_first_review');

    const elevatedVolumeCase = createKycReviewCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      riskLevel: 'elevated_volume',
    });

    expect(elevatedVolumeCase.requiresFourEyes).toBe(true);
  });

  it('Step 106.3: first reviewer approval leaves four-eye case held in queue awaiting second reviewer sign-off', () => {
    const highRiskCase = createKycReviewCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      riskLevel: 'high_risk',
    });

    const firstApproved = submitFirstReviewerDecision({
      reviewCase: highRiskCase,
      reviewerId: 'officer_elena_01',
      decision: 'approved',
      notes: 'Telemedicine pharmacy license verified with state board of pharmacy.',
    });

    expect(firstApproved.overallStatus).toBe('pending_second_review');
    expect(firstApproved.firstReviewerId).toBe('officer_elena_01');
    // Cannot advance to CEO approval yet
    expect(canAdvanceToCeoApproval(firstApproved)).toBe(false);
  });

  it('Step 106.4: enforces business logic rule: first_reviewer_id !== second_reviewer_id (same officer cannot dual sign-off)', () => {
    const highRiskCase = createKycReviewCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      riskLevel: 'high_risk',
    });

    const firstApproved = submitFirstReviewerDecision({
      reviewCase: highRiskCase,
      reviewerId: 'officer_elena_01',
      decision: 'approved',
      notes: 'Telemedicine pharmacy license verified with state board of pharmacy.',
    });

    // Attempting to submit second review with the same reviewer ID
    expect(() =>
      submitSecondReviewerDecision({
        reviewCase: firstApproved,
        reviewerId: 'officer_elena_01', // VIOLATION
        decision: 'approved',
        notes: 'Attempting self-sign-off for second review.',
      })
    ).toThrow('Four-Eye Compliance Rule Violation: The second reviewer must be a distinct compliance officer');
  });

  it('Step 106.5: advances application to CEO queue only after distinct second reviewer approves', () => {
    const highRiskCase = createKycReviewCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      riskLevel: 'high_risk',
    });

    const firstApproved = submitFirstReviewerDecision({
      reviewCase: highRiskCase,
      reviewerId: 'officer_elena_01',
      decision: 'approved',
      notes: 'Telemedicine pharmacy license verified with state board of pharmacy.',
    });

    const secondApproved = submitSecondReviewerDecision({
      reviewCase: firstApproved,
      reviewerId: 'officer_marcus_02', // DISTINCT REVIEWER
      decision: 'approved',
      notes: 'Secondary audit confirmed cGMP certification and prescription drug verification gateway.',
    });

    expect(secondApproved.overallStatus).toBe('ready_for_ceo_approval');
    expect(secondApproved.secondReviewerId).toBe('officer_marcus_02');
    expect(canAdvanceToCeoApproval(secondApproved)).toBe(true);
  });

  it('Step 106.6: rejection by first or second reviewer marks application as rejected immediately', () => {
    const highRiskCase = createKycReviewCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      riskLevel: 'high_risk',
    });

    const rejected = submitFirstReviewerDecision({
      reviewCase: highRiskCase,
      reviewerId: 'officer_elena_01',
      decision: 'rejected',
      notes: 'Counterfeit business license detected upon verification with Secretary of State.',
    });

    expect(rejected.overallStatus).toBe('rejected');
    expect(canAdvanceToCeoApproval(rejected)).toBe(false);
  });
});
