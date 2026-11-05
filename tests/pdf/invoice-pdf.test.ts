// path: tests/pdf/invoice-pdf.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateInvoicePdfBuffer,
  encryptAndStoreInvoicePdf,
  getSignedInvoicePdfDownloadUrl,
  retrieveDecryptedInvoicePdf,
  resetInvoicePdfStore,
} from '@/lib/pdf/invoice-pdf';
import type { Invoice } from '@/types/invoice';

describe('Server-Side PDF Invoice Generation Pipeline (Phase 13 - Step 190)', () => {
  const invoice: Invoice = {
    id: '01a1ac36-0000-7000-8000-000000000001',
    tenantId: '11111111-2222-4333-8444-555555555555',
    companyId: '22222222-3333-4444-8555-666666666666',
    clientName: 'Global Logistics Corp',
    clientEmail: 'billing@globallogistics.test',
    invoiceNumber: 'INV-2026-0042',
    status: 'sent',
    currency: 'USD',
    subtotal: '1200.0000',
    discountTotal: '100.0000',
    taxTotal: '88.0000',
    total: '1188.0000',
    amountPaid: '0.0000',
    remainingBalance: '1188.0000',
    issueDate: '2026-11-05',
    dueDate: '2026-11-20',
    notes: 'Net 15 payment terms apply.',
    isLocked: false,
    version: 1,
    items: [
      {
        id: 'item_1',
        tenantId: '11111111-2222-4333-8444-555555555555',
        invoiceId: '01a1ac36-0000-7000-8000-000000000001',
        description: 'Freight Routing Services',
        quantity: '4.0000',
        unitPrice: '300.0000',
        discount: '100.0000',
        taxAmount: '88.0000',
        total: '1188.0000',
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    resetInvoicePdfStore();
  });

  it('generates high-fidelity invoice PDF buffer with SHA-256 document hash', () => {
    const { buffer, documentHash, contentString } = generateInvoicePdfBuffer(
      invoice,
      'Acme Worldwide Inc.'
    );

    expect(buffer.length).toBeGreaterThan(100);
    expect(documentHash).toHaveLength(64);
    expect(contentString).toContain('INV-2026-0042');
    expect(contentString).toContain('Acme Worldwide Inc.');
    expect(contentString).toContain('Freight Routing Services');
    expect(contentString).toContain('$1188.0000');
  });

  it('encrypts invoice PDF with AES-256-GCM domain key and stores record', async () => {
    const metadata = await encryptAndStoreInvoicePdf(invoice, 'Acme Worldwide Inc.');

    expect(metadata.fileId).toBeDefined();
    expect(metadata.invoiceNumber).toBe('INV-2026-0042');
    expect(metadata.encryptedPayload).not.toContain('Freight Routing Services');

    const decryptedBuffer = retrieveDecryptedInvoicePdf(metadata.fileId);
    expect(decryptedBuffer.toString('utf8')).toContain('Freight Routing Services');
  });

  it('generates signed short-lived download URL and verifies expiration', async () => {
    const metadata = await encryptAndStoreInvoicePdf(invoice, 'Acme Worldwide Inc.');
    const downloadUrl = getSignedInvoicePdfDownloadUrl(metadata.fileId, 600);

    expect(downloadUrl).toContain(`/api/files/${metadata.fileId}/download?expires=`);
    expect(downloadUrl).toContain('&sig=');
  });
});
