// path: tests/client-portal/portal-tokens-and-receipt.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateDocumentToken,
  resolveDocumentToken,
  revokeDocumentToken,
  resetDocumentTokensStore,
  MAX_TOKEN_ACCESS_PER_MINUTE,
} from '@/lib/client-portal/tokens';
import {
  evaluateInvoicePortalView,
  validatePortalPaymentSubmission,
  InvoiceAlreadyPaidError,
} from '@/lib/client-portal/receipt-mode';
import type { Invoice } from '@/types/invoice';

describe('Tokenized Client Portal & Paid Receipt Mode (Phase 13 - Steps 196-197)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const companyId = '22222222-3333-4444-8555-666666666666';
  const documentId = '33333333-4444-5555-8666-777777777777';

  beforeEach(() => {
    resetDocumentTokensStore();
  });

  describe('Step 196: Tokenized Client Link Access Engine', () => {
    it('generates high-entropy 256-bit token for invoice and estimate routes', () => {
      const invToken = generateDocumentToken({
        tenantId,
        companyId,
        tokenType: 'invoice',
        documentId,
      });

      expect(invToken.token).toHaveLength(64);
      expect(invToken.urlPath).toMatch(/^\/i\/[a-f0-9]{64}$/);

      const estToken = generateDocumentToken({
        tenantId,
        companyId,
        tokenType: 'estimate',
        documentId,
      });

      expect(estToken.urlPath).toMatch(/^\/e\/[a-f0-9]{64}$/);
    });

    it('resolves valid token and returns associated document metadata', () => {
      const { token } = generateDocumentToken({
        tenantId,
        companyId,
        tokenType: 'invoice',
        documentId,
      });

      const resolved = resolveDocumentToken(token);
      expect(resolved.isValid).toBe(true);
      expect(resolved.documentId).toBe(documentId);
      expect(resolved.tokenType).toBe('invoice');
    });

    it('returns error for expired or revoked token', () => {
      const { token, record } = generateDocumentToken({
        tenantId,
        companyId,
        tokenType: 'invoice',
        documentId,
      });

      // Simulate expiration
      record.expiresAt = new Date(Date.now() - 1000).toISOString();
      const expired = resolveDocumentToken(token);
      expect(expired.isValid).toBe(false);
      expect(expired.error).toBe('expired');

      // Reset expiration, test revocation
      record.expiresAt = new Date(Date.now() + 86400000).toISOString();
      revokeDocumentToken(token);
      const revoked = resolveDocumentToken(token);
      expect(revoked.isValid).toBe(false);
      expect(revoked.error).toBe('revoked');
    });

    it('enforces rate limiting on tokenized route to prevent enumeration attacks', () => {
      const { token } = generateDocumentToken({
        tenantId,
        companyId,
        tokenType: 'invoice',
        documentId,
      });

      // Exhaust limit
      for (let i = 0; i < MAX_TOKEN_ACCESS_PER_MINUTE; i++) {
        resolveDocumentToken(token, '192.0.2.1');
      }

      const rateLimited = resolveDocumentToken(token, '192.0.2.1');
      expect(rateLimited.isValid).toBe(false);
      expect(rateLimited.error).toBe('rate_limited');
    });
  });

  describe('Step 197: Paid Invoice Link Locking & Receipt Mode Enforcement', () => {
    function makeTestInvoice(status: Invoice['status'], remaining: string): Invoice {
      return {
        id: documentId,
        tenantId,
        companyId,
        clientName: 'Client Corp',
        clientEmail: 'billing@clientcorp.test',
        invoiceNumber: 'INV-2026-9090',
        status,
        currency: 'USD',
        subtotal: '500.0000',
        discountTotal: '0.0000',
        taxTotal: '0.0000',
        total: '500.0000',
        amountPaid: (500 - Number(remaining)).toFixed(4),
        remainingBalance: Number(remaining).toFixed(4),
        issueDate: '2026-11-01',
        dueDate: '2026-11-15',
        isLocked: status === 'paid',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    it('renders read-only receipt mode when invoice is fully paid', () => {
      const paidInvoice = makeTestInvoice('paid', '0.0000');
      const view = evaluateInvoicePortalView(paidInvoice);

      expect(view.isReceiptMode).toBe(true);
      expect(view.canAcceptPayment).toBe(false);
      expect(view.maxPayableAmount).toBe('0.0000');
      expect(view.pdfDownloadUrl).toContain('/receipt.pdf');
    });

    it('renders payment checkout mode when invoice is partially paid', () => {
      const partialInvoice = makeTestInvoice('partially_paid', '150.0000');
      const view = evaluateInvoicePortalView(partialInvoice);

      expect(view.isReceiptMode).toBe(false);
      expect(view.canAcceptPayment).toBe(true);
      expect(view.maxPayableAmount).toBe('150.0000');
    });

    it('rejects payment submission on fully paid invoice with InvoiceAlreadyPaidError', () => {
      const paidInvoice = makeTestInvoice('paid', '0.0000');
      expect(() => validatePortalPaymentSubmission(paidInvoice, '50.0000')).toThrow(
        InvoiceAlreadyPaidError
      );
    });

    it('rejects payment submission exceeding remaining balance on partially paid invoice', () => {
      const partialInvoice = makeTestInvoice('partially_paid', '150.0000');
      expect(() => validatePortalPaymentSubmission(partialInvoice, '150.0100')).toThrow(
        /exceeds remaining invoice balance/
      );

      const valid = validatePortalPaymentSubmission(partialInvoice, '100.0000');
      expect(valid.isPermitted).toBe(true);
      expect(valid.clampedAmount).toBe('100.0000');
    });
  });
});
