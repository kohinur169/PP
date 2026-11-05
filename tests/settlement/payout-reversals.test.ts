// path: tests/settlement/payout-reversals.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMassPayoutBatch,
  approvePayoutBatch,
  getPayoutBatch,
  getPayoutItems,
  resetMassPayoutStore,
} from '@/lib/settlement/mass-payout-engine';
import {
  processPayoutReturn,
  retryFailedPayoutItem,
  markPayoutItemCompleted,
  resetPayoutReturnsStore,
} from '@/lib/settlement/payout-reversals';

describe('Payout Reversal, Retry Engine & Batch Settlement Reconciliation (Step 177)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const creatorUser = '99999999-9999-4999-8999-999999999999';
  const approverUser = '88888888-8888-4888-8888-888888888888';

  beforeEach(() => {
    resetMassPayoutStore();
    resetPayoutReturnsStore();
  });

  describe('Clearing Network Return & Balance Reversal', () => {
    it('processes ACH R03 return, records reversal event, and reconciles batch status', async () => {
      const batch = await createMassPayoutBatch({
        tenantId,
        batchReference: 'BATCH-RET-001',
        creatorUserId: creatorUser,
        candidates: [
          {
            companyId: 'company-a',
            destinationType: 'ach',
            destinationDetails: { routing: '121000358', account: '111222333' },
            grossBalanceUsd: 5000.0,
            disputeReserveHoldbackUsd: 500.0,
          },
          {
            companyId: 'company-b',
            destinationType: 'ach',
            destinationDetails: { routing: '021000021', account: '444555666' },
            grossBalanceUsd: 7000.0,
            disputeReserveHoldbackUsd: 700.0,
          },
        ],
      });

      await approvePayoutBatch({ batchId: batch.id, approverUserId: approverUser });

      const items = getPayoutItems(batch.id);
      const itemA = items[0]!;
      const itemB = items[1]!;

      // Mark Item A as completed
      markPayoutItemCompleted(batch.id, itemA.id);

      // Ingest ACH R03 return for Item B
      const returnEvent = await processPayoutReturn({
        tenantId,
        batchId: batch.id,
        payoutItemId: itemB.id,
        companyId: itemB.companyId,
        returnCode: 'R03',
        returnReason: 'No Account / Unable to Locate Account',
      });

      expect(returnEvent.returnCode).toBe('R03');
      expect(returnEvent.reversalAmountUsd).toBe(6300.0); // 7000 - 700
      expect(returnEvent.reversalLedgerJournalId).toBeDefined();

      // Check item B state
      const updatedItems = getPayoutItems(batch.id);
      const updatedItemB = updatedItems.find((it) => it.id === itemB.id)!;
      expect(updatedItemB.status).toBe('failed');
      expect(updatedItemB.errorMessage).toContain('R03');

      // Check reconciled batch status: 1 completed, 1 failed -> 'partial'
      const updatedBatch = getPayoutBatch(batch.id)!;
      expect(updatedBatch.status).toBe('partial');
    });
  });

  describe('Retry Engine & Maximum Cap', () => {
    it('retries failed payout item with updated destination and enforces max 3 retries', async () => {
      const batch = await createMassPayoutBatch({
        tenantId,
        batchReference: 'BATCH-RETRY-002',
        creatorUserId: creatorUser,
        candidates: [
          {
            companyId: 'company-retry',
            destinationType: 'ach',
            destinationDetails: { routing: '121000358', account: 'invalid-acct' },
            grossBalanceUsd: 2000.0,
            disputeReserveHoldbackUsd: 0.0,
          },
        ],
      });

      await approvePayoutBatch({ batchId: batch.id, approverUserId: approverUser });
      const items = getPayoutItems(batch.id);
      const item = items[0]!;

      // Return 1
      const returnEvent = await processPayoutReturn({
        tenantId,
        batchId: batch.id,
        payoutItemId: item.id,
        companyId: item.companyId,
        returnCode: 'R04',
        returnReason: 'Invalid Account Number Structure',
      });

      // Retry 1
      await retryFailedPayoutItem({
        returnEventId: returnEvent.id,
        updatedDestinationDetails: { routing: '121000358', account: 'fixed-account-1' },
        operatorUserId: approverUser,
      });

      expect(returnEvent.retryCount).toBe(1);
      expect(getPayoutItems(batch.id)[0]!.status).toBe('processing');

      // Return 2 & Retry 2
      await processPayoutReturn({
        tenantId,
        batchId: batch.id,
        payoutItemId: item.id,
        companyId: item.companyId,
        returnCode: 'R02',
        returnReason: 'Account Closed',
      });

      await retryFailedPayoutItem({
        returnEventId: returnEvent.id,
        updatedDestinationDetails: { routing: '021000021', account: 'fixed-account-2' },
        operatorUserId: approverUser,
      });

      expect(returnEvent.retryCount).toBe(2);

      // Return 3 & Retry 3
      await processPayoutReturn({
        tenantId,
        batchId: batch.id,
        payoutItemId: item.id,
        companyId: item.companyId,
        returnCode: 'R01',
        returnReason: 'Insufficient Funds',
      });

      await retryFailedPayoutItem({
        returnEventId: returnEvent.id,
        updatedDestinationDetails: { routing: '021000021', account: 'fixed-account-3' },
        operatorUserId: approverUser,
      });

      expect(returnEvent.retryCount).toBe(3);

      // 4th retry should throw max limit exceeded error
      await processPayoutReturn({
        tenantId,
        batchId: batch.id,
        payoutItemId: item.id,
        companyId: item.companyId,
        returnCode: 'R01',
        returnReason: 'Insufficient Funds',
      });

      await expect(
        retryFailedPayoutItem({
          returnEventId: returnEvent.id,
          updatedDestinationDetails: { routing: '021000021', account: 'fixed-account-4' },
          operatorUserId: approverUser,
        })
      ).rejects.toThrow(/Maximum payout retry limit \(3\) reached/);

      expect(returnEvent.status).toBe('abandoned');
    });
  });

  describe('Full Batch Completion Reconciliation', () => {
    it('transitions batch to completed when all items succeed', async () => {
      const batch = await createMassPayoutBatch({
        tenantId,
        batchReference: 'BATCH-COMPLETED-003',
        creatorUserId: creatorUser,
        candidates: [
          {
            companyId: 'company-x',
            destinationType: 'ach',
            destinationDetails: { routing: '121000358', account: '123456' },
            grossBalanceUsd: 1000.0,
            disputeReserveHoldbackUsd: 0.0,
          },
        ],
      });

      await approvePayoutBatch({ batchId: batch.id, approverUserId: approverUser });
      const items = getPayoutItems(batch.id);

      markPayoutItemCompleted(batch.id, items[0]!.id);

      const finalBatch = getPayoutBatch(batch.id)!;
      expect(finalBatch.status).toBe('completed');
    });
  });
});
