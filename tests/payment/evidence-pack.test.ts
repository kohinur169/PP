// path: tests/payment/evidence-pack.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/lib/money/money';
import {
  authorize,
  capture,
  resetAuthorizationStore,
  type AuthorizePaymentRequest,
} from '@/lib/payment/auth-capture';
import {
  createDispute,
  getDispute,
  resetDisputeStore,
} from '@/lib/payment/dispute';
import {
  assembleAndSubmitEvidencePack,
  reviewAndDispatchEvidencePack,
  getEvidencePack,
  getEvidencePackForDispute,
  resetEvidencePackStore,
  type SubmitEvidencePackInput,
} from '@/lib/payment/evidence-pack';

describe('Structured Chargeback Evidence Pack Assembly & Compliance Review Engine (Step 144)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const merchantStaffId = '12345678-1234-4234-8234-123456789012';
  const complianceOfficerId = '33333333-3333-4333-8333-333333333333';

  const baseAuthRequest: AuthorizePaymentRequest = {
    tenantId,
    companyId,
    amount: Money.from('320.0000'),
    currency: 'USD',
    provider: 'stripe_connect',
    cardToken: 'tok_visa_dispute_pack_9999',
    cardBrand: 'visa',
    description: 'Designer sunglasses and accessories order',
  };

  const sampleEvidenceInput: Omit<SubmitEvidencePackInput, 'disputeId'> = {
    tenantId,
    companyId,
    submittedBy: merchantStaffId,
    rebuttalSummary: 'Customer claims non-receipt, but carrier tracking shows signed delivery to billing address.',
    invoiceData: {
      invoiceId: 'inv_1001',
      invoiceNumber: 'INV-2026-0081',
      lineItems: [{ description: 'Designer Sunglasses', quantity: 1, amount: '320.00' }],
      totalAmount: '320.00',
      billedCustomerName: 'Jane Doe',
      billedCustomerEmail: 'jane.doe@example.com',
      billedAt: '2026-10-15T14:20:00Z',
    },
    deliveryProof: {
      deliveryType: 'physical_shipping',
      carrier: 'FedEx Express',
      trackingNumber: '782910394821',
      deliveredAt: '2026-10-18T10:15:00Z',
      recipientSignatureOrConfirmation: 'J. DOE (Front Door)',
      deliveryAddressOrIp: '123 Main St, Austin, TX 78701',
    },
    communicationRecord: {
      communicationChannel: 'email',
      summary: 'Merchant responded within 2 hours providing FedEx tracking link and delivery photo.',
      messages: [
        { sender: 'customer', timestamp: '2026-10-19T09:00:00Z', content: 'Where is my order?' },
        { sender: 'merchant', timestamp: '2026-10-19T10:45:00Z', content: 'Delivered via FedEx on Oct 18 with signature J. DOE.' },
      ],
    },
    termsAcceptance: {
      policyVersion: 'v2.1',
      acceptedAt: '2026-10-15T14:18:32Z',
      customerIp: '198.51.100.45',
      termsUrl: 'https://merchant.example.com/terms-and-cancellation',
      cancellationPolicySummary: 'Final sale after carrier delivery confirmation unless returned within 14 days.',
    },
  };

  beforeEach(() => {
    resetAuthorizationStore();
    resetDisputeStore();
    resetEvidencePackStore();
  });

  describe('Evidence Pack Validation & Assembly (Step 144.1)', () => {
    it('assembles complete evidence pack and transitions dispute to status "under_review"', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const dispute = await createDispute({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('320.0000'),
        reason: 'product_not_received',
      });

      const pack = await assembleAndSubmitEvidencePack({
        ...sampleEvidenceInput,
        disputeId: dispute.id,
      });

      expect(pack.id).toBeDefined();
      expect(pack.status).toBe('under_review');
      expect(pack.invoiceData.invoiceNumber).toBe('INV-2026-0081');
      expect(pack.deliveryProof.carrier).toBe('FedEx Express');
      expect(pack.termsAcceptance.policyVersion).toBe('v2.1');

      // Check dispute status transitioned to under_review
      const updatedDispute = await getDispute(dispute.id);
      expect(updatedDispute?.status).toBe('under_review');
    });

    it('rejects evidence submission with incomplete evidence artifacts', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const dispute = await createDispute({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('320.0000'),
        reason: 'product_not_received',
      });

      // Missing rebuttal summary
      await expect(
        assembleAndSubmitEvidencePack({
          ...sampleEvidenceInput,
          disputeId: dispute.id,
          rebuttalSummary: 'Too short',
        })
      ).rejects.toThrow(/rebuttal summary is required/);
    });
  });

  describe('Compliance Review RBAC & Dispatch (Step 144.2)', () => {
    it('forbids unauthorized roles from approving or dispatching dispute evidence packs', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const dispute = await createDispute({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('320.0000'),
        reason: 'product_not_received',
      });

      const pack = await assembleAndSubmitEvidencePack({
        ...sampleEvidenceInput,
        disputeId: dispute.id,
      });

      await expect(
        reviewAndDispatchEvidencePack({
          evidencePackId: pack.id,
          reviewerId: merchantStaffId,
          reviewerRole: 'merchant_admin',
          action: 'approve_and_dispatch',
        })
      ).rejects.toThrow(/cannot review dispute evidence packs/);

      await expect(
        reviewAndDispatchEvidencePack({
          evidencePackId: pack.id,
          reviewerId: merchantStaffId,
          reviewerRole: 'support',
          action: 'approve_and_dispatch',
        })
      ).rejects.toThrow(/cannot review dispute evidence packs/);
    });

    it('compliance_kyc approves evidence pack and dispatches it to processor', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const dispute = await createDispute({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('320.0000'),
        reason: 'product_not_received',
      });

      const pack = await assembleAndSubmitEvidencePack({
        ...sampleEvidenceInput,
        disputeId: dispute.id,
      });

      const approved = await reviewAndDispatchEvidencePack({
        evidencePackId: pack.id,
        reviewerId: complianceOfficerId,
        reviewerRole: 'compliance_kyc',
        action: 'approve_and_dispatch',
        complianceNotes: 'Confirmed signed FedEx POD matching buyer billing address; valid rebuttal.',
      });

      expect(approved.status).toBe('approved_and_dispatched');
      expect(approved.reviewedBy).toBe(complianceOfficerId);

      // Dispute status must transition to 'evidence_submitted'
      const updatedDispute = await getDispute(dispute.id);
      expect(updatedDispute?.status).toBe('evidence_submitted');
      expect(updatedDispute?.evidenceSubmittedAt).toBeDefined();

      const fetchedPack = await getEvidencePackForDispute(dispute.id);
      expect(fetchedPack?.id).toBe(pack.id);
    });

    it('compliance_kyc can reject evidence pack back to merchant for remediation', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const dispute = await createDispute({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('320.0000'),
        reason: 'product_not_received',
      });

      const pack = await assembleAndSubmitEvidencePack({
        ...sampleEvidenceInput,
        disputeId: dispute.id,
      });

      const rejected = await reviewAndDispatchEvidencePack({
        evidencePackId: pack.id,
        reviewerId: complianceOfficerId,
        reviewerRole: 'compliance_kyc',
        action: 'reject_back_to_merchant',
        complianceNotes: 'Please attach official signature image from FedEx portal, not just text summary.',
      });

      expect(rejected.status).toBe('rejected_by_compliance');

      // Dispute status reverts to 'needs_response' so merchant can remediate
      const updatedDispute = await getDispute(dispute.id);
      expect(updatedDispute?.status).toBe('needs_response');
    });
  });
});
