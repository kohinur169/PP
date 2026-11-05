// path: tests/settlement/mass-payout-engine.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMassPayoutBatch,
  approvePayoutBatch,
  rejectPayoutBatch,
  getPayoutBatch,
  getPayoutItems,
  resetMassPayoutStore,
} from '@/lib/settlement/mass-payout-engine';

describe('Mass Payout Batch Creation, Dual-Authorization & Holdback Gates (Step 174)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const creatorUser = '99999999-9999-4999-8999-999999999999';
  const approver1 = '88888888-8888-4888-8888-888888888888';
  const approver2 = '77777777-7777-4777-8777-777777777777';

  beforeEach(() => {
    resetMassPayoutStore();
  });

  describe('Single Approval Workflow (< $50,000)', () => {
    it('creates batch with reserve holdbacks and approves with single signature', async () => {
      const batch = await createMassPayoutBatch({
        tenantId,
        batchReference: 'BATCH-20261105-001',
        creatorUserId: creatorUser,
        candidates: [
          {
            companyId: 'company-1',
            destinationType: 'ach',
            destinationDetails: { routing: '121000358', account: '987654321' },
            grossBalanceUsd: 12000.0,
            disputeReserveHoldbackUsd: 1200.0, // 10% rolling reserve holdback
          },
          {
            companyId: 'company-2',
            destinationType: 'wire',
            destinationDetails: { swift: 'CHASUS33', iban: 'US123456' },
            grossBalanceUsd: 15000.0,
            disputeReserveHoldbackUsd: 1500.0,
          },
        ],
      });

      expect(batch.totalPayoutAmountUsd).toBe(24300.0); // (12000 - 1200) + (15000 - 1500)
      expect(batch.totalHoldbackUsd).toBe(2700.0);
      expect(batch.itemCount).toBe(2);
      expect(batch.requiresDualApproval).toBe(false);
      expect(batch.status).toBe('pending_approval');

      const items = getPayoutItems(batch.id);
      expect(items.length).toBe(2);
      expect(items[0]!.netPayoutUsd).toBe(10800.0);
      expect(items[1]!.netPayoutUsd).toBe(13500.0);

      // Single approval
      const approved = await approvePayoutBatch({
        batchId: batch.id,
        approverUserId: approver1,
      });

      expect(approved.status).toBe('processing');
      expect(approved.firstApprovedBy).toBe(approver1);
      expect(approved.secondApprovedBy).toBeUndefined();
    });
  });

  describe('Dual Authorization Workflow (>= $50,000)', () => {
    it('requires two distinct approvers before transitioning to processing', async () => {
      const batch = await createMassPayoutBatch({
        tenantId,
        batchReference: 'BATCH-LARGE-20261105-002',
        creatorUserId: creatorUser,
        candidates: [
          {
            companyId: 'enterprise-co',
            destinationType: 'wire',
            destinationDetails: { routing: '021000021', account: '1122334455' },
            grossBalanceUsd: 60000.0,
            disputeReserveHoldbackUsd: 5000.0,
          },
        ],
      });

      expect(batch.totalPayoutAmountUsd).toBe(55000.0); // >= $50,000
      expect(batch.requiresDualApproval).toBe(true);

      // 1st approval
      const firstApproval = await approvePayoutBatch({
        batchId: batch.id,
        approverUserId: approver1,
      });

      expect(firstApproval.status).toBe('pending_approval');
      expect(firstApproval.firstApprovedBy).toBe(approver1);
      expect(firstApproval.secondApprovedBy).toBeUndefined();

      // Attempt 2nd approval by same user -> should be rejected
      await expect(
        approvePayoutBatch({
          batchId: batch.id,
          approverUserId: approver1,
        })
      ).rejects.toThrow(/Dual-authorization violation/);

      // 2nd approval by distinct user -> transitions to processing
      const secondApproval = await approvePayoutBatch({
        batchId: batch.id,
        approverUserId: approver2,
      });

      expect(secondApproval.status).toBe('processing');
      expect(secondApproval.firstApprovedBy).toBe(approver1);
      expect(secondApproval.secondApprovedBy).toBe(approver2);
    });
  });

  describe('Batch Rejection', () => {
    it('rejects batch and cascades status to all items', async () => {
      const batch = await createMassPayoutBatch({
        tenantId,
        batchReference: 'BATCH-REJECT-003',
        creatorUserId: creatorUser,
        candidates: [
          {
            companyId: 'company-x',
            destinationType: 'payoneer',
            destinationDetails: { payoneerId: 'PAYO-12345' },
            grossBalanceUsd: 5000.0,
            disputeReserveHoldbackUsd: 500.0,
          },
        ],
      });

      const rejected = await rejectPayoutBatch({
        batchId: batch.id,
        rejecterUserId: approver1,
        reason: 'Suspected fraudulent beneficiary details',
      });

      expect(rejected.status).toBe('rejected');

      const items = getPayoutItems(batch.id);
      expect(items[0]!.status).toBe('rejected');
      expect(items[0]!.errorMessage).toContain('Suspected fraudulent beneficiary');
    });
  });
});
