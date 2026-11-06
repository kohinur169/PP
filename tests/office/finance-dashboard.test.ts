// path: tests/office/finance-dashboard.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  resetFinanceDataForTest,
  seedReconciliationMismatchForTest,
  seedFailedPayoutForTest,
  seedProcessorBillForTest,
  calculateRemainingSla,
  listReconciliationMismatches,
  resolveReconciliationMismatch,
  listFailedPayouts,
  resolveFailedPayout,
  listProcessorBills,
  verifyProcessorBill,
  RECONCILIATION_SLA_MS,
  ReconciliationMismatch,
  FailedPayoutItem,
  ProcessorBillItem,
} from '@/lib/office/finance-engine';
import { AuditLogRepository } from '@/lib/db/audit';
import { GET as getReconciliation, POST as postReconciliation } from '@/app/api/office/finance/reconciliation/route';
import { GET as getFailedPayouts, POST as postFailedPayouts } from '@/app/api/office/finance/payouts/failed/route';
import { GET as getProcessorBills, POST as postProcessorBills } from '@/app/api/office/finance/processor-bills/route';

describe('Step 069: Finance Operations Dedicated Dashboard', () => {
  const financeOfficerId = '018f6c4c-3500-7fa1-b1e2-300000000003';
  let mockAuditRepo: AuditLogRepository;
  let auditLogsRecorded: any[];

  beforeEach(() => {
    resetFinanceDataForTest();
    auditLogsRecorded = [];

    mockAuditRepo = {
      createLog: async (input: any) => {
        auditLogsRecorded.push(input);
        return {} as any;
      },
    } as unknown as AuditLogRepository;
  });

  describe('Step 069.1: Role Permissions & Access Control', () => {
    it('allows FINANCE_OPS to access all finance tools but rejects unauthorized roles', async () => {
      const mismatch: ReconciliationMismatch = {
        id: 'recon_01',
        batchId: 'BATCH_20261102_NMI_01',
        processor: 'nmi',
        detectedAt: new Date().toISOString(),
        slaDeadline: new Date(Date.now() + RECONCILIATION_SLA_MS).toISOString(),
        expectedLedgerAmountUsd: 10000,
        actualProcessorAmountUsd: 9800,
        discrepancyUsd: 200,
        status: 'pending_resolution',
      };
      seedReconciliationMismatchForTest(mismatch);

      // FINANCE_OPS succeeds
      const list = await listReconciliationMismatches(Role.FINANCE_OPS);
      expect(list).toHaveLength(1);

      // SUPPORT fails
      await expect(listReconciliationMismatches(Role.SUPPORT)).rejects.toThrow(/Access Denied/i);

      // BLOGGER fails
      await expect(listReconciliationMismatches(Role.BLOGGER)).rejects.toThrow(/Access Denied/i);

      // CLIENT fails
      await expect(listReconciliationMismatches(Role.CLIENT)).rejects.toThrow(/Access Denied/i);
    });
  });

  describe('Step 069.2: Reconciliation Mismatch Queue & 72-Hour SLA Countdown', () => {
    it('computes remaining SLA hours and detects breach accurately', () => {
      const nowMs = 1793700000000;
      // Detected 24 hours ago
      const detected24hAgo = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
      const sla24 = calculateRemainingSla(detected24hAgo, nowMs);
      expect(sla24.isBreached).toBe(false);
      expect(sla24.remainingHours).toBe(48);

      // Detected 73 hours ago (breached)
      const detected73hAgo = new Date(nowMs - 73 * 60 * 60 * 1000).toISOString();
      const slaBreached = calculateRemainingSla(detected73hAgo, nowMs);
      expect(slaBreached.isBreached).toBe(true);
      expect(slaBreached.remainingHours).toBe(0);
      expect(slaBreached.remainingMinutes).toBe(0);
    });

    it('resolves a reconciliation mismatch and writes to audit log', async () => {
      const mismatch: ReconciliationMismatch = {
        id: 'recon_02',
        batchId: 'BATCH_20261103_STRIPE_01',
        processor: 'stripe_connect',
        detectedAt: new Date().toISOString(),
        slaDeadline: new Date(Date.now() + RECONCILIATION_SLA_MS).toISOString(),
        expectedLedgerAmountUsd: 50000,
        actualProcessorAmountUsd: 49500,
        discrepancyUsd: 500,
        status: 'pending_resolution',
      };
      seedReconciliationMismatchForTest(mismatch);

      const resolved = await resolveReconciliationMismatch({
        mismatchId: 'recon_02',
        resolutionType: 'ADJUSTMENT_POSTED',
        resolutionNotes: 'Interchange fee surcharge adjusted via journal entry J-2026-99',
        actorId: financeOfficerId,
        actorRole: Role.FINANCE_OPS,
        auditRepo: mockAuditRepo,
      });

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolutionType).toBe('ADJUSTMENT_POSTED');
      expect(resolved.resolvedBy).toBe(financeOfficerId);
      expect(auditLogsRecorded).toHaveLength(1);
      expect(auditLogsRecorded[0].action).toBe('LEDGER_TRANSACTION_RECORDED');
      expect(auditLogsRecorded[0].payload.discrepancyUsd).toBe(500);

      // Attempting to resolve again throws error
      await expect(
        resolveReconciliationMismatch({
          mismatchId: 'recon_02',
          resolutionType: 'TIMING_DIFFERENCE',
          resolutionNotes: 'duplicate attempt',
          actorId: financeOfficerId,
          actorRole: Role.FINANCE_OPS,
        })
      ).rejects.toThrow(/already been resolved/);
    });
  });

  describe('Step 069.3: Failed Payout Investigation & Resolution', () => {
    it('processes failed payout hold, retry, and return to merchant ledger actions', async () => {
      const failedPayout: FailedPayoutItem = {
        id: 'fp_01',
        payoutId: 'PO_ACH_1001',
        companyId: '018f6c4c-3500-7fa1-b1e2-000000000001',
        merchantName: 'Acme Digital',
        amountUsd: 12500,
        bankAccountMasked: '****4412',
        bankRouting: '021000021',
        failureCode: 'R04_INVALID_ACCOUNT_NUMBER',
        failureReason: 'Account structure invalid',
        attemptedAt: new Date().toISOString(),
        status: 'pending_investigation',
      };
      seedFailedPayoutForTest(failedPayout);

      const payouts = await listFailedPayouts(Role.FINANCE_OPS);
      expect(payouts).toHaveLength(1);

      // Resolve with HOLD_FOR_MERCHANT_BANK_UPDATE
      const resolved = await resolveFailedPayout({
        failedPayoutId: 'fp_01',
        action: 'HOLD_FOR_MERCHANT_BANK_UPDATE',
        notes: 'Contacted merchant CFO; awaiting updated direct deposit form.',
        actorId: financeOfficerId,
        actorRole: Role.FINANCE_OPS,
        auditRepo: mockAuditRepo,
      });

      expect(resolved.status).toBe('held_for_update');
      expect(resolved.resolutionAction).toBe('HOLD_FOR_MERCHANT_BANK_UPDATE');
      expect(auditLogsRecorded).toHaveLength(1);
      expect(auditLogsRecorded[0].action).toBe('PAYOUT_REQUESTED');
    });
  });

  describe('Step 069.4: Processor Monthly Bill Verification Across 5 Gateways', () => {
    it('matches processor invoice fees and handles variance disputes', async () => {
      const bill: ProcessorBillItem = {
        id: 'pb_01',
        invoiceNumber: 'INV-202610-RAINFOREST-01',
        processor: 'rainforest',
        billingMonth: '2026-10',
        billedAmountUsd: 18200.5,
        calculatedFeeUsd: 18000.0,
        varianceUsd: 200.5,
        status: 'under_review',
      };
      seedProcessorBillForTest(bill);

      const bills = await listProcessorBills(Role.FINANCE_OPS);
      expect(bills).toHaveLength(1);

      // Dispute variance
      const reviewed = await verifyProcessorBill({
        billId: 'pb_01',
        decision: 'variance_disputed',
        notes: 'Disputing $200.50 unexpected chargeback handling fee.',
        actorId: financeOfficerId,
        actorRole: Role.FINANCE_OPS,
        auditRepo: mockAuditRepo,
      });

      expect(reviewed.status).toBe('variance_disputed');
      expect(auditLogsRecorded).toHaveLength(1);
      expect(auditLogsRecorded[0].action).toBe('SETTLEMENT_BATCH_GENERATED');
    });
  });

  describe('HTTP API Endpoints Integration', () => {
    it('handles GET and POST for /api/office/finance/reconciliation', async () => {
      const mismatch: ReconciliationMismatch = {
        id: 'recon_http_01',
        batchId: 'BATCH_HTTP_01',
        processor: 'airwallex',
        detectedAt: new Date().toISOString(),
        slaDeadline: new Date(Date.now() + RECONCILIATION_SLA_MS).toISOString(),
        expectedLedgerAmountUsd: 20000,
        actualProcessorAmountUsd: 19500,
        discrepancyUsd: 500,
        status: 'pending_resolution',
      };
      seedReconciliationMismatchForTest(mismatch);

      // GET
      const getReq = new NextRequest('http://localhost/api/office/finance/reconciliation', {
        headers: { 'x-user-role': Role.FINANCE_OPS },
      });
      const getRes = await getReconciliation(getReq);
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.totalCount).toBe(1);
      expect(getData.mismatches[0].slaRemainingHours).toBeGreaterThan(0);

      // POST resolution
      const postReq = new NextRequest('http://localhost/api/office/finance/reconciliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.FINANCE_OPS,
          'x-user-id': financeOfficerId,
        },
        body: JSON.stringify({
          mismatchId: 'recon_http_01',
          resolutionType: 'TIMING_DIFFERENCE',
          resolutionNotes: 'Rolled over to next trading day due to midnight UTC cut-off.',
        }),
      });
      const postRes = await postReconciliation(postReq);
      expect(postRes.status).toBe(200);
      const postData = await postRes.json();
      expect(postData.success).toBe(true);
      expect(postData.resolved.status).toBe('resolved');
    });

    it('rejects unauthorized roles with HTTP 403 on all finance endpoints', async () => {
      const req = new NextRequest('http://localhost/api/office/finance/reconciliation', {
        headers: { 'x-user-role': Role.SUPPORT },
      });
      const res = await getReconciliation(req);
      expect(res.status).toBe(403);

      const payoutReq = new NextRequest('http://localhost/api/office/finance/payouts/failed', {
        headers: { 'x-user-role': Role.CLIENT },
      });
      const payoutRes = await getFailedPayouts(payoutReq);
      expect(payoutRes.status).toBe(403);

      const billsReq = new NextRequest('http://localhost/api/office/finance/processor-bills', {
        headers: { 'x-user-role': Role.BLOGGER },
      });
      const billsRes = await getProcessorBills(billsReq);
      expect(billsRes.status).toBe(403);
    });

    it('handles POST for failed payouts and processor bills', async () => {
      // Seed failed payout
      seedFailedPayoutForTest({
        id: 'fp_http_01',
        payoutId: 'PO_HTTP_101',
        companyId: '018f6c4c-3500-7fa1-b1e2-000000000001',
        merchantName: 'Acme LLC',
        amountUsd: 5000,
        bankAccountMasked: '****1234',
        bankRouting: '021000021',
        failureCode: 'R01_INSUFFICIENT_FUNDS',
        failureReason: 'NSF',
        attemptedAt: new Date().toISOString(),
        status: 'pending_investigation',
      });

      const pReq = new NextRequest('http://localhost/api/office/finance/payouts/failed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.FINANCE_OPS,
          'x-user-id': financeOfficerId,
        },
        body: JSON.stringify({
          failedPayoutId: 'fp_http_01',
          action: 'RETURN_TO_MERCHANT_BALANCE',
          notes: 'Returned to merchant operating balance upon request.',
        }),
      });
      const pRes = await postFailedPayouts(pReq);
      expect(pRes.status).toBe(200);
      const pData = await pRes.json();
      expect(pData.resolved.status).toBe('returned_to_ledger');

      // Seed bill
      seedProcessorBillForTest({
        id: 'pb_http_01',
        invoiceNumber: 'INV-PAYONEER-01',
        processor: 'payoneer',
        billingMonth: '2026-10',
        billedAmountUsd: 5400,
        calculatedFeeUsd: 5400,
        varianceUsd: 0,
        status: 'under_review',
      });

      const bReq = new NextRequest('http://localhost/api/office/finance/processor-bills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.FINANCE_OPS,
          'x-user-id': financeOfficerId,
        },
        body: JSON.stringify({
          billId: 'pb_http_01',
          decision: 'matched',
          notes: 'Zero variance verified against ledger entries.',
        }),
      });
      const bRes = await postProcessorBills(bReq);
      expect(bRes.status).toBe(200);
      const bData = await bRes.json();
      expect(bData.reviewed.status).toBe('matched');
    });
  });
});
