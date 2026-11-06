// path: tests/settlement/fulfilment-gates.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  runFulfilmentGatedSettlementJob,
  seedSettlementBatch,
  resetSettlementBatchesStore,
} from '@/lib/settlement/fulfilment-gates';
import { resetActivityMailerStore } from '@/lib/email/activity-mailer';

describe('Fulfilment-Gated Settlement Release Worker & Compliance Gates (Step 159)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyA = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    resetSettlementBatchesStore();
    resetActivityMailerStore();
  });

  describe('Mandatory Fulfilment Proof Invariant (Step 159.1)', () => {
    it('strictly blocks release when tracking or fulfilment proof is missing', async () => {
      seedSettlementBatch({
        id: 'batch_no_proof_001',
        tenantId,
        companyId: companyA,
        merchantEmail: 'merchant@store.com',
        batchReference: 'BATCH-2026-001',
        amountUsd: 1200.0,
        reserveAmountUsd: 120.0,
        netPayoutAmountUsd: 1080.0,
        tier: 1,
        status: 'held',
        hasVerifiedDeliveryProof: false, // Missing proof!
        manualReviewStatus: 'not_required',
        reserveHoldDays: 90,
        reserveMaturationDate: '2026-11-01',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      });

      const summary = await runFulfilmentGatedSettlementJob(tenantId, '2026-11-05');
      expect(summary.releasedCount).toBe(0);
      expect(summary.blockedMissingProofCount).toBe(1);
    });
  });

  describe('Post-Delivery Maturation Days Invariant (Step 159.2)', () => {
    it('blocks release if required post-delivery days have not elapsed', async () => {
      // Tier 1 requires 7 days post-delivery. Delivered on 2026-11-02 -> eligible on 2026-11-09.
      seedSettlementBatch({
        id: 'batch_unmatured_days_002',
        tenantId,
        companyId: companyA,
        merchantEmail: 'merchant@store.com',
        batchReference: 'BATCH-2026-002',
        amountUsd: 800.0,
        reserveAmountUsd: 80.0,
        netPayoutAmountUsd: 720.0,
        tier: 1, // Requires 7 days
        status: 'held',
        hasVerifiedDeliveryProof: true,
        deliveryVerifiedAt: '2026-11-02T10:00:00Z',
        manualReviewStatus: 'not_required',
        reserveHoldDays: 90,
        reserveMaturationDate: '2026-11-01',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      });

      // Today is 2026-11-05 (only 3 days elapsed -> blocked)
      const summary1 = await runFulfilmentGatedSettlementJob(tenantId, '2026-11-05');
      expect(summary1.releasedCount).toBe(0);
      expect(summary1.blockedHoldUnmaturedCount).toBe(1);

      // Advance to 2026-11-10 (8 days elapsed -> eligible)
      const summary2 = await runFulfilmentGatedSettlementJob(tenantId, '2026-11-10');
      expect(summary2.releasedCount).toBe(1);
    });
  });

  describe('USD $5,000+ Manual Compliance Review Invariant (Step 159.3)', () => {
    it('never bypasses a pending manual compliance review for transactions >= USD $5,000', async () => {
      seedSettlementBatch({
        id: 'batch_large_tx_003',
        tenantId,
        companyId: companyA,
        merchantEmail: 'merchant@store.com',
        batchReference: 'BATCH-2026-003',
        amountUsd: 8500.0, // >= USD $5,000
        reserveAmountUsd: 425.0,
        netPayoutAmountUsd: 8075.0,
        tier: 2,
        status: 'held',
        hasVerifiedDeliveryProof: true,
        deliveryVerifiedAt: '2026-10-25T10:00:00Z', // Delivered 10+ days ago
        manualReviewStatus: 'pending', // Still pending review!
        reserveHoldDays: 60,
        reserveMaturationDate: '2026-10-20',
        createdAt: '2026-10-20T00:00:00Z',
        updatedAt: '2026-10-20T00:00:00Z',
      });

      // Job must NEVER bypass pending manual review
      const summary1 = await runFulfilmentGatedSettlementJob(tenantId, '2026-11-05');
      expect(summary1.releasedCount).toBe(0);
      expect(summary1.blockedManualReviewCount).toBe(1);

      // Now simulate compliance approval
      seedSettlementBatch({
        id: 'batch_large_tx_003',
        tenantId,
        companyId: companyA,
        merchantEmail: 'merchant@store.com',
        batchReference: 'BATCH-2026-003',
        amountUsd: 8500.0,
        reserveAmountUsd: 425.0,
        netPayoutAmountUsd: 8075.0,
        tier: 2,
        status: 'pending_manual_review',
        hasVerifiedDeliveryProof: true,
        deliveryVerifiedAt: '2026-10-25T10:00:00Z',
        manualReviewStatus: 'approved', // Approved!
        reserveHoldDays: 60,
        reserveMaturationDate: '2026-10-20',
        createdAt: '2026-10-20T00:00:00Z',
        updatedAt: '2026-10-20T00:00:00Z',
      });

      const summary2 = await runFulfilmentGatedSettlementJob(tenantId, '2026-11-05');
      expect(summary2.releasedCount).toBe(1);
    });
  });
});
