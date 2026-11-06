// path: tests/disputes/deadline-worker.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  runDisputeEvidenceDeadlineWarningsJob,
  seedPaymentDispute,
  getPaymentDispute,
  resetDisputeWarningsStore,
} from '@/lib/disputes/deadline-worker';
import { resetActivityMailerStore } from '@/lib/email/activity-mailer';

describe('Dispute Evidence Deadline Warnings Worker (Step 166)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const disputeId = 'dispute_test_001';

  beforeEach(() => {
    resetDisputeWarningsStore();
    resetActivityMailerStore();
  });

  describe('Progressive Warning Escalation (7d -> 48h -> 12h -> Expired)', () => {
    it('progressively escalates alerts across each deadline threshold and enforces single send per stage', async () => {
      // Deadline: 2026-11-12T12:00:00Z
      const deadlineAt = '2026-11-12T12:00:00Z';

      seedPaymentDispute({
        id: disputeId,
        tenantId,
        companyId,
        paymentId: 'pay_001',
        amount: 250.0,
        currency: 'USD',
        reason: 'fraudulent',
        status: 'needs_response',
        deadlineAt,
        contactEmail: 'disputes@merchant.test',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      });

      // Stage 1: 5 days (120 hours) remaining -> triggers 7-day warning
      const stage1 = await runDisputeEvidenceDeadlineWarningsJob({
        tenantId,
        nowIso: '2026-11-07T12:00:00Z',
      });

      expect(stage1.warnings7dDispatchedCount).toBe(1);
      expect(stage1.warnings48hDispatchedCount).toBe(0);
      expect(stage1.warnings12hDispatchedCount).toBe(0);

      const dStage1 = getPaymentDispute(disputeId);
      expect(dStage1?.warning7dSentAt).toBeDefined();

      // Redundant run at 100 hours remaining -> 7d already sent, 48h not reached yet -> 0 sent
      const stage1Redundant = await runDisputeEvidenceDeadlineWarningsJob({
        tenantId,
        nowIso: '2026-11-08T08:00:00Z',
      });
      expect(stage1Redundant.warnings7dDispatchedCount).toBe(0);

      // Stage 2: 36 hours remaining -> triggers 48-hour warning
      const stage2 = await runDisputeEvidenceDeadlineWarningsJob({
        tenantId,
        nowIso: '2026-11-11T00:00:00Z',
      });

      expect(stage2.warnings48hDispatchedCount).toBe(1);
      expect(stage2.warnings7dDispatchedCount).toBe(0);

      const dStage2 = getPaymentDispute(disputeId);
      expect(dStage2?.warning48hSentAt).toBeDefined();

      // Stage 3: 8 hours remaining -> triggers 12-hour warning
      const stage3 = await runDisputeEvidenceDeadlineWarningsJob({
        tenantId,
        nowIso: '2026-11-12T04:00:00Z',
      });

      expect(stage3.warnings12hDispatchedCount).toBe(1);

      const dStage3 = getPaymentDispute(disputeId);
      expect(dStage3?.warning12hSentAt).toBeDefined();

      // Stage 4: 1 hour past deadline -> transitions status to 'expired'
      const stage4 = await runDisputeEvidenceDeadlineWarningsJob({
        tenantId,
        nowIso: '2026-11-12T13:00:00Z',
      });

      expect(stage4.expiredCount).toBe(1);

      const dStage4 = getPaymentDispute(disputeId);
      expect(dStage4?.status).toBe('expired');
    });

    it('ignores disputes that already submitted evidence or were won', async () => {
      seedPaymentDispute({
        id: 'dispute_submitted_002',
        tenantId,
        companyId,
        paymentId: 'pay_002',
        amount: 500.0,
        currency: 'USD',
        reason: 'product_not_received',
        status: 'evidence_submitted',
        deadlineAt: '2026-11-06T00:00:00Z', // 12h away
        contactEmail: 'disputes@merchant.test',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      });

      const summary = await runDisputeEvidenceDeadlineWarningsJob({
        tenantId,
        nowIso: '2026-11-05T12:00:00Z',
      });

      expect(summary.inspectedDisputesCount).toBe(0);
      expect(summary.warnings12hDispatchedCount).toBe(0);
    });
  });
});
