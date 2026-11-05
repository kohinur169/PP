// path: tests/invoices/invoicing-engine.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateNextInvoiceNumber,
  resetInvoiceNumberingStore,
} from '@/lib/invoices/numbering';
import { calculateInvoiceTotals } from '@/lib/invoices/totals';
import {
  transitionInvoiceStatus,
  assertInvoiceMutable,
  duplicateInvoice,
  voidInvoice,
  resetInvoiceStateMachineStore,
  LockedInvoiceError,
  InvalidInvoiceTransitionError,
} from '@/lib/invoices/state-machine';
import {
  processInvoicePartialPayment,
  MinimumPartialPaymentError,
  ExcessPaymentAmountError,
} from '@/lib/invoices/partial-payments';
import type { Invoice } from '@/types/invoice';

describe('Professional Invoicing, Line Items, Lifecycle & Partial Payments (Phase 13 - Steps 186-189)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const companyId = '22222222-3333-4444-8555-666666666666';

  beforeEach(() => {
    resetInvoiceNumberingStore();
    resetInvoiceStateMachineStore();
  });

  describe('Step 186: Sequential Invoice Numbering Generator', () => {
    it('generates monotonic sequential invoice numbers with standard prefix', () => {
      const num1 = generateNextInvoiceNumber({ tenantId, companyId });
      const num2 = generateNextInvoiceNumber({ tenantId, companyId });
      const num3 = generateNextInvoiceNumber({ tenantId, companyId });

      expect(num1).toBe('INV-0001');
      expect(num2).toBe('INV-0002');
      expect(num3).toBe('INV-0003');
    });

    it('supports custom prefix and padding length', () => {
      const num1 = generateNextInvoiceNumber({
        tenantId,
        companyId,
        prefix: 'BILL-2026-',
        padLength: 5,
      });
      const num2 = generateNextInvoiceNumber({
        tenantId,
        companyId,
        prefix: 'BILL-2026-',
        padLength: 5,
      });

      expect(num1).toBe('BILL-2026-00001');
      expect(num2).toBe('BILL-2026-00002');
    });
  });

  describe('Step 187: Line Items & Invoice Totals Decimal Math', () => {
    it('calculates line items, subtotals, multi-tier discounts and taxes preserving penny precision', () => {
      const result = calculateInvoiceTotals([
        { description: 'Cloud Consulting', quantity: '10', unitPrice: '150.0000', discount: '50.0000', taxAmount: '120.0000' },
        { description: 'Server Setup', quantity: '2', unitPrice: '300.0000', discount: '0.0000', taxAmount: '48.0000' },
      ]);

      // Item 1: 10 * 150 = 1500 - 50 + 120 = 1570.0000
      // Item 2: 2 * 300 = 600 - 0 + 48 = 648.0000
      // Subtotal = 1500 + 600 = 2100.0000
      // Discount = 50.0000
      // Tax Total = 120 + 48 = 168.0000
      // Grand Total = 2100 - 50 + 168 = 2218.0000
      expect(result.subtotal).toBe('2100.0000');
      expect(result.discountTotal).toBe('50.0000');
      expect(result.taxTotal).toBe('168.0000');
      expect(result.total).toBe('2218.0000');
      expect(result.remainingBalance).toBe('2218.0000');
      expect(result.items).toHaveLength(2);
      expect(result.items[0].total).toBe('1570.0000');
      expect(result.items[1].total).toBe('648.0000');
    });
  });

  describe('Step 188: Invoice Lifecycle State Machine & Editing Lock', () => {
    function makeTestInvoice(): Invoice {
      return {
        id: '01a1ac35-0000-7000-8000-000000000001',
        tenantId,
        companyId,
        clientName: 'Acme Corp',
        clientEmail: 'billing@acme.com',
        invoiceNumber: 'INV-0001',
        status: 'draft',
        currency: 'USD',
        subtotal: '500.0000',
        discountTotal: '0.0000',
        taxTotal: '0.0000',
        total: '500.0000',
        amountPaid: '0.0000',
        remainingBalance: '500.0000',
        issueDate: '2026-11-05',
        dueDate: '2026-11-20',
        isLocked: false,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    it('transitions status through valid lifecycle: draft -> sent -> viewed -> paid', async () => {
      const inv = makeTestInvoice();

      await transitionInvoiceStatus(inv, 'sent');
      expect(inv.status).toBe('sent');

      await transitionInvoiceStatus(inv, 'viewed');
      expect(inv.status).toBe('viewed');

      await transitionInvoiceStatus(inv, 'paid');
      expect(inv.status).toBe('paid');
      expect(inv.isLocked).toBe(true);
      expect(inv.remainingBalance).toBe('0.0000');
    });

    it('rejects invalid status transitions', async () => {
      const inv = makeTestInvoice();
      await expect(transitionInvoiceStatus(inv, 'paid')).rejects.toThrow(InvalidInvoiceTransitionError);
    });

    it('locks paid invoice and throws LockedInvoiceError on modification attempts', () => {
      const inv = makeTestInvoice();
      inv.status = 'paid';
      inv.isLocked = true;

      expect(() => assertInvoiceMutable(inv)).toThrow(LockedInvoiceError);
    });

    it('duplicates invoice into a fresh draft with next sequential number', () => {
      const inv = makeTestInvoice();
      const dup = duplicateInvoice(inv);

      expect(dup.id).not.toBe(inv.id);
      expect(dup.invoiceNumber).toBe('INV-0001');
      expect(dup.status).toBe('draft');
      expect(dup.isLocked).toBe(false);
    });

    it('voids invoice and marks it locked', async () => {
      const inv = makeTestInvoice();
      await voidInvoice(inv, 'Client requested order cancellation');

      expect(inv.status).toBe('void');
      expect(inv.isLocked).toBe(true);
      expect(inv.notes).toContain('[VOIDED: Client requested order cancellation]');
    });
  });

  describe('Step 189: Partial Payment Acceptance Engine', () => {
    function makeActiveInvoice(): Invoice {
      return {
        id: '01a1ac35-0000-7000-8000-000000000002',
        tenantId,
        companyId,
        clientName: 'Tech Services Inc',
        clientEmail: 'finance@techservices.com',
        invoiceNumber: 'INV-0002',
        status: 'sent',
        currency: 'USD',
        subtotal: '200.0000',
        discountTotal: '0.0000',
        taxTotal: '0.0000',
        total: '200.0000',
        amountPaid: '0.0000',
        remainingBalance: '200.0000',
        issueDate: '2026-11-05',
        dueDate: '2026-11-20',
        isLocked: false,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    it('rejects partial payment attempt below mandatory USD $20 threshold', async () => {
      const inv = makeActiveInvoice();
      await expect(processInvoicePartialPayment(inv, '15.0000')).rejects.toThrow(
        MinimumPartialPaymentError
      );
    });

    it('rejects payment amount exceeding remaining balance', async () => {
      const inv = makeActiveInvoice();
      await expect(processInvoicePartialPayment(inv, '250.0000')).rejects.toThrow(
        ExcessPaymentAmountError
      );
    });

    it('accepts partial payment >= $20, transitions status to partially_paid and tracks remaining balance', async () => {
      const inv = makeActiveInvoice();

      const result1 = await processInvoicePartialPayment(inv, '75.0000');
      expect(result1.isFullyPaid).toBe(false);
      expect(result1.paymentAmount).toBe('75.0000');
      expect(result1.newRemainingBalance).toBe('125.0000');
      expect(inv.status).toBe('partially_paid');
      expect(inv.isLocked).toBe(false);

      // Second partial payment of $125 (pays off full remaining balance)
      const result2 = await processInvoicePartialPayment(inv, '125.0000');
      expect(result2.isFullyPaid).toBe(true);
      expect(result2.newRemainingBalance).toBe('0.0000');
      expect(inv.status).toBe('paid');
      expect(inv.isLocked).toBe(true);
    });
  });
});
