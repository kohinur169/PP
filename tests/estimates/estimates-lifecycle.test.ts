// path: tests/estimates/estimates-lifecycle.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEstimate,
  evaluateEstimateExpiration,
  declineEstimate,
  resetEstimatesStore,
} from '@/lib/estimates/index';
import {
  signAndAcceptEstimate,
  computeEstimateDocumentHash,
  MissingSignatureConsentError,
  InvalidDocumentHashError,
} from '@/lib/estimates/signature';
import {
  convertEstimateToInvoice,
  UnacceptedEstimateConversionError,
} from '@/lib/estimates/convert';
import { resetInvoiceNumberingStore } from '@/lib/invoices/numbering';

describe('Estimates, Digital Signatures & Estimate-to-Invoice Conversion (Phase 13 - Steps 191-193)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const companyId = '22222222-3333-4444-8555-666666666666';

  beforeEach(() => {
    resetEstimatesStore();
    resetInvoiceNumberingStore();
  });

  describe('Step 191: Estimates Architecture & Automated Expiration Rules', () => {
    it('creates estimate with sequential numbering and line items', () => {
      const estimate = createEstimate({
        tenantId,
        companyId,
        clientName: 'Apex Enterprise',
        clientEmail: 'billing@apex.test',
        items: [
          { description: 'Security Architecture Audit', quantity: 1, unitPrice: '2500.0000', discount: '200.0000' },
          { description: 'Cloud Infrastructure Hardening', quantity: 1, unitPrice: '1500.0000' },
        ],
        expiresInDays: 14,
      });

      expect(estimate.id).toBeDefined();
      expect(estimate.estimateNumber).toBe('EST-0001');
      expect(estimate.status).toBe('draft');
      expect(estimate.subtotal).toBe('4000.0000');
      expect(estimate.discountTotal).toBe('200.0000');
      expect(estimate.total).toBe('3800.0000');
      expect(estimate.items).toHaveLength(2);
    });

    it('transitions estimate to void when expiration date has elapsed', async () => {
      const estimate = createEstimate({
        tenantId,
        companyId,
        clientName: 'Apex Enterprise',
        clientEmail: 'billing@apex.test',
        items: [{ description: 'Test', quantity: 1, unitPrice: '100.0000' }],
      });

      // Simulate past expiration
      estimate.expiresAt = new Date(Date.now() - 3600000).toISOString();

      const { isExpired, estimate: updated } = await evaluateEstimateExpiration(estimate);
      expect(isExpired).toBe(true);
      expect(updated.status).toBe('void');
      expect(updated.notes).toContain('[EXPIRED:');
    });

    it('client decline immediately transitions estimate to void state', async () => {
      const estimate = createEstimate({
        tenantId,
        companyId,
        clientName: 'Apex Enterprise',
        clientEmail: 'billing@apex.test',
        items: [{ description: 'Test', quantity: 1, unitPrice: '100.0000' }],
      });

      const declined = await declineEstimate(estimate, 'Scope of work too large for Q4 budget');
      expect(declined.status).toBe('void');
      expect(declined.notes).toContain('[DECLINED BY CLIENT: Scope of work too large for Q4 budget]');
    });
  });

  describe('Step 192: Digital Signature & Legal E-Sign Audit Evidence Capture', () => {
    it('rejects digital signature if mandatory legal consent checkbox is unchecked', async () => {
      const estimate = createEstimate({
        tenantId,
        companyId,
        clientName: 'Apex Enterprise',
        clientEmail: 'billing@apex.test',
        items: [{ description: 'Test', quantity: 1, unitPrice: '500.0000' }],
      });

      const hash = computeEstimateDocumentHash(estimate);

      await expect(
        signAndAcceptEstimate({
          estimate,
          signerName: 'Jane Doe',
          signerEmail: 'jane@apex.test',
          consentCheckbox: false, // Unchecked!
          ipAddress: '198.51.100.12',
          userAgent: 'Mozilla/5.0 Chrome/120.0',
          signatureData: 'data:image/png;base64,mockSig',
          documentHash: hash,
        })
      ).rejects.toThrow(MissingSignatureConsentError);
    });

    it('rejects digital signature if document hash is mismatched or tampered', async () => {
      const estimate = createEstimate({
        tenantId,
        companyId,
        clientName: 'Apex Enterprise',
        clientEmail: 'billing@apex.test',
        items: [{ description: 'Test', quantity: 1, unitPrice: '500.0000' }],
      });

      await expect(
        signAndAcceptEstimate({
          estimate,
          signerName: 'Jane Doe',
          signerEmail: 'jane@apex.test',
          consentCheckbox: true,
          ipAddress: '198.51.100.12',
          userAgent: 'Mozilla/5.0 Chrome/120.0',
          signatureData: 'data:image/png;base64,mockSig',
          documentHash: 'tampered_or_invalid_hash_value',
        })
      ).rejects.toThrow(InvalidDocumentHashError);
    });

    it('captures full 8-field forensic evidence and transitions estimate to accepted', async () => {
      const estimate = createEstimate({
        tenantId,
        companyId,
        clientName: 'Apex Enterprise',
        clientEmail: 'billing@apex.test',
        items: [{ description: 'Test', quantity: 1, unitPrice: '500.0000' }],
      });

      const hash = computeEstimateDocumentHash(estimate);
      const signature = await signAndAcceptEstimate({
        estimate,
        signerName: 'Jane Doe',
        signerEmail: 'jane@apex.test',
        consentCheckbox: true,
        ipAddress: '198.51.100.12',
        userAgent: 'Mozilla/5.0 Chrome/120.0',
        signatureData: 'data:image/png;base64,mockSig',
        documentHash: hash,
      });

      expect(signature.id).toBeDefined();
      expect(signature.signerName).toBe('Jane Doe');
      expect(signature.consentCheckbox).toBe(true);
      expect(signature.documentHash).toBe(hash);
      expect(estimate.status).toBe('accepted');
      expect(estimate.signature).toBeDefined();
    });
  });

  describe('Step 193: Estimate-to-Invoice Conversion & Payment Link Auto-Generation', () => {
    it('blocks conversion if estimate is not in accepted status', async () => {
      const draftEstimate = createEstimate({
        tenantId,
        companyId,
        clientName: 'Apex Enterprise',
        clientEmail: 'billing@apex.test',
        items: [{ description: 'Test', quantity: 1, unitPrice: '500.0000' }],
      });

      await expect(convertEstimateToInvoice(draftEstimate)).rejects.toThrow(
        UnacceptedEstimateConversionError
      );
    });

    it('converts accepted estimate to invoice with auto-generated payment link', async () => {
      const estimate = createEstimate({
        tenantId,
        companyId,
        clientName: 'Apex Enterprise',
        clientEmail: 'billing@apex.test',
        items: [
          { description: 'Custom Portal Integration', quantity: 1, unitPrice: '3500.0000', discount: '500.0000' },
        ],
      });

      const hash = computeEstimateDocumentHash(estimate);
      await signAndAcceptEstimate({
        estimate,
        signerName: 'Jane Doe',
        signerEmail: 'jane@apex.test',
        consentCheckbox: true,
        ipAddress: '198.51.100.12',
        userAgent: 'Mozilla/5.0 Chrome/120.0',
        signatureData: 'data:image/png;base64,mockSig',
        documentHash: hash,
      });

      const { invoice, paymentLinkUrl, token } = await convertEstimateToInvoice(estimate);

      expect(invoice.id).toBeDefined();
      expect(invoice.invoiceNumber).toBe('INV-0001');
      expect(invoice.status).toBe('sent');
      expect(invoice.total).toBe('3000.0000');
      expect(invoice.remainingBalance).toBe('3000.0000');
      expect(invoice.notes).toContain('Converted from Estimate #EST-0001');
      expect(paymentLinkUrl).toMatch(/^\/i\/[a-f0-9]{64}$/);
      expect(token).toHaveLength(64);

      expect(estimate.status).toBe('converted');
      expect(estimate.convertedInvoiceId).toBe(invoice.id);
    });
  });
});
