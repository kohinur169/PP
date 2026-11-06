// path: tests/disputes/disputes-lifecycle.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setCompanyFeeRefundPolicy,
  getCompanyFeeRefundPolicy,
  postRefundLedgerReversal,
  resetCompanyFeePolicyStore,
} from '@/lib/payment/fee-refund-policy';
import {
  ingestGatewayDisputeWebhook,
  normalizeSchemeReasonCode,
  resetIngestedDisputesStore,
} from '@/lib/disputes/ingest';
import {
  calculateMerchantDisputeSla,
  dispatchDisputeSlaAlert,
  getDisputeDispatchLogs,
  resetDisputeDispatchLogs,
} from '@/lib/disputes/sla';
import {
  processEvidenceDocument,
  submitDisputeResponse,
  assembleEvidencePack,
  resetEvidencePackStore,
} from '@/lib/disputes/evidence-pack';

describe('Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine (Steps 201-206)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const companyId = '22222222-3333-4444-8555-666666666666';
  const paymentId = 'pay_018f6c4c_test_001';
  const actorId = 'usr_018f6c4c_superadmin';

  beforeEach(() => {
    resetCompanyFeePolicyStore();
    resetIngestedDisputesStore();
    resetDisputeDispatchLogs();
    resetEvidencePackStore();
  });

  describe('Step 201 & Step 202: Platform Fee Refund Policy Switch & Reversible Ledger Poster', () => {
    it('executes refund reversal with RETURN policy: reverses platform fee back to merchant', async () => {
      await setCompanyFeeRefundPolicy({
        companyId,
        policy: 'return',
        actorId,
      });

      expect(getCompanyFeeRefundPolicy(companyId)).toBe('return');

      // Refund $100.00 with $3.00 platform fee
      const result = await postRefundLedgerReversal({
        tenantId,
        companyId,
        paymentId,
        refundId: 'ref_001',
        refundAmountUsd: '100.0000',
        platformFeeUsd: '3.0000',
      });

      expect(result.policyApplied).toBe('return');
      expect(result.totalDebitedFromMerchant).toBe('97.0000'); // Merchant only debited net principal
      expect(result.platformFeeReversed).toBe('3.0000');      // Platform fee revenue debited (returned)
    });

    it('executes refund reversal with RETAIN policy: platform retains fee, full amount debited from merchant', async () => {
      await setCompanyFeeRefundPolicy({
        companyId,
        policy: 'retain',
        actorId,
      });

      expect(getCompanyFeeRefundPolicy(companyId)).toBe('retain');

      const result = await postRefundLedgerReversal({
        tenantId,
        companyId,
        paymentId,
        refundId: 'ref_002',
        refundAmountUsd: '100.0000',
        platformFeeUsd: '3.0000',
      });

      expect(result.policyApplied).toBe('retain');
      expect(result.totalDebitedFromMerchant).toBe('100.0000'); // Merchant debited full refund
      expect(result.platformFeeReversed).toBe('0.0000');       // Platform fee revenue left untouched
    });
  });

  describe('Step 203: Multi-Gateway Dispute Webhook Ingestion & Reason Normalization', () => {
    it('normalizes card scheme reason codes (Visa, Mastercard, Amex)', () => {
      const visaFraud = normalizeSchemeReasonCode({ cardScheme: 'visa', rawCode: '10.4' });
      expect(visaFraud.category).toBe('fraud');
      expect(visaFraud.description).toContain('Other Fraud');

      const mcNotReceived = normalizeSchemeReasonCode({ cardScheme: 'mastercard', rawCode: '4853' });
      expect(mcNotReceived.category).toBe('product_not_received');

      const amexFraud = normalizeSchemeReasonCode({ cardScheme: 'amex', rawCode: 'F29' });
      expect(amexFraud.category).toBe('fraud');
    });

    it('ingests chargeback webhook, creates dispute record and freezes funds', async () => {
      const dispute = await ingestGatewayDisputeWebhook({
        tenantId,
        companyId,
        paymentId,
        gateway: 'stripe',
        gatewayDisputeId: 'dp_1Q1234567890',
        amountUsd: '150.0000',
        cardScheme: 'visa',
        rawReasonCode: '10.4',
        merchantTimezone: 'Asia/Tokyo',
      });

      expect(dispute.status).toBe('needs_response');
      expect(dispute.isAmountFrozen).toBe(true);
      expect(dispute.standardCategory).toBe('fraud');
      expect(dispute.merchantTimezone).toBe('Asia/Tokyo');
      expect(dispute.deadlineHours).toBe(24);
    });
  });

  describe('Step 204: 24/48-Hour Merchant Timezone Dispute SLA & Alert Engine', () => {
    it('evaluates SLA timeline in merchant timezone and triggers alerts', async () => {
      const dispute = await ingestGatewayDisputeWebhook({
        tenantId,
        companyId,
        paymentId,
        gateway: 'nmi',
        gatewayDisputeId: 'nmi_disp_999',
        amountUsd: '200.0000',
        rawReasonCode: 'FRAUD',
        merchantTimezone: 'Asia/Tokyo',
      });

      const initialEval = calculateMerchantDisputeSla(dispute, new Date(dispute.createdAt));
      expect(initialEval.remainingHours).toBe(24);
      expect(initialEval.isPastDeadline).toBe(false);
      expect(initialEval.shouldDispatchHour0Alert).toBe(true);
      expect(initialEval.merchantLocalDeadlineStr).toBeDefined();

      // Dispatch urgent Hour 0 alert
      await dispatchDisputeSlaAlert({ disputeId: dispute.id, alertType: 'hour_0_urgent' });
      const logs = getDisputeDispatchLogs(dispute.id);
      expect(logs).toHaveLength(1);
      expect(logs[0].alertType).toBe('hour_0_urgent');
      expect(logs[0].recipientTimezone).toBe('Asia/Tokyo');

      // Midpoint check (+12 hours)
      const midTime = new Date(new Date(dispute.createdAt).getTime() + 12.5 * 60 * 60 * 1000);
      const midEval = calculateMerchantDisputeSla(dispute, midTime);
      expect(midEval.shouldDispatchMidpointAlert).toBe(true);
      expect(midEval.remainingHours).toBeCloseTo(11.5, 0);
    });
  });

  describe('Step 205 & Step 206: Dispute Response Portal & Evidence Pack Auto-Assembler', () => {
    it('processes AES-256 encrypted evidence files, accepts rebuttal narrative, and compiles evidence pack PDF', async () => {
      const dispute = await ingestGatewayDisputeWebhook({
        tenantId,
        companyId,
        paymentId,
        gateway: 'rainforest',
        gatewayDisputeId: 'rf_dp_444',
        amountUsd: '500.0000',
        rawReasonCode: '13.1',
      });

      // 1. Process evidence documents
      const file1 = processEvidenceDocument({
        category: 'proof_of_delivery',
        fileName: 'tracking_delivery_receipt.pdf',
        fileBuffer: Buffer.from('Carrier Tracking Delivery Signed by Customer', 'utf-8'),
      });
      expect(file1.encryptedEnvelope).toBeDefined();
      expect(file1.sha256Hash).toHaveLength(64);

      const file2 = processEvidenceDocument({
        category: 'terms_acceptance',
        fileName: 'tos_audit_trail.pdf',
        fileBuffer: Buffer.from('User accepted terms on 2026-11-01 from IP 203.0.113.1', 'utf-8'),
      });

      // 2. Submit rebuttal narrative
      const rebuttal = await submitDisputeResponse({
        disputeId: dispute.id,
        rebuttalNarrative: 'The customer confirmed receipt via email and signed for delivery on Nov 2nd.',
        evidenceFiles: [file1, file2],
        actorId,
      });

      expect(rebuttal.evidenceFiles).toHaveLength(2);
      expect(dispute.status).toBe('under_review');

      // 3. Assemble complete standardized evidence pack
      const pack = await assembleEvidencePack(dispute.id);
      expect(pack.disputeId).toBe(dispute.id);
      expect(pack.evidenceFilesCount).toBe(2);
      expect(pack.pdfSha256Hash).toHaveLength(64);
      expect(pack.encryptedPdfEnvelope).toBeDefined();
      expect(dispute.status).toBe('evidence_submitted');
    });
  });
});
