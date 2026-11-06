// path: tests/client-portal/tokenized-portal.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  resetTokenizedPortalDataForTest,
  seedTokenizedInvoiceForTest,
  seedTokenizedEstimateForTest,
  generateHighEntropyToken,
  verifyInvoiceToken,
  payTokenizedInvoice,
  verifyEstimateToken,
  acceptAndSignEstimate,
  enforceTokenRateLimit,
  TOKEN_PORTAL_RATE_LIMIT,
  TokenizedInvoice,
  TokenizedEstimate,
} from '@/lib/client-portal/tokens';
import { resetRateLimits } from '@/lib/security/rate-limit';
import { AuditLogRepository } from '@/lib/db/audit';
import {
  GET as getInvoiceByToken,
  POST as postPayInvoice,
} from '@/app/api/client/invoice/[token]/route';
import {
  GET as getEstimateByToken,
  POST as postSignEstimate,
} from '@/app/api/client/estimate/[token]/route';

describe('Step 073: Tokenized Client Link Portal Architecture (i/[token] & e/[token])', () => {
  const companyId = '018f6c4c-3500-7fa1-b1e2-000000000001';
  let mockAuditRepo: AuditLogRepository;
  let auditLogsRecorded: any[];

  beforeEach(() => {
    resetTokenizedPortalDataForTest();
    resetRateLimits();
    auditLogsRecorded = [];

    mockAuditRepo = {
      createLog: async (input: any) => {
        auditLogsRecorded.push(input);
        return {} as any;
      },
    } as unknown as AuditLogRepository;
  });

  describe('Step 073.1 & Step 073.3: Tokenized Invoices & Read-Only Payment Lockdown', () => {
    it('verifies invoice without login and processes payment with receipt lockdown', async () => {
      const token = generateHighEntropyToken();
      expect(token.length).toBeGreaterThan(32);

      const invoice: TokenizedInvoice = {
        id: 'inv_token_01',
        invoiceNumber: 'INV-2026-0042',
        companyId,
        companyName: 'Acme Digital Services',
        clientName: 'Global Cloud Systems',
        clientEmail: 'billing@globalcloud.com',
        subtotalUsd: 1000,
        taxAmountUsd: 80,
        totalAmountUsd: 1080,
        status: 'issued',
        lineItems: [
          {
            description: 'API Gateway Integration',
            quantity: 1,
            unitPriceUsd: 1000,
            totalUsd: 1000,
          },
        ],
        token,
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      seedTokenizedInvoiceForTest(invoice);

      // Verify and retrieve without login
      const retrieved = await verifyInvoiceToken(token, '203.0.113.10');
      expect(retrieved.invoiceNumber).toBe('INV-2026-0042');
      expect(retrieved.status).toBe('issued');

      // Pay invoice
      const paid = await payTokenizedInvoice({
        token,
        paymentMethod: { type: 'card', last4: '4242' },
        clientIp: '203.0.113.10',
        auditRepo: mockAuditRepo,
      });

      expect(paid.status).toBe('paid');
      expect(paid.paidAt).toBeDefined();
      expect(paid.paymentReceipt).toBeDefined();
      expect(paid.paymentReceipt?.paidAmountUsd).toBe(1080);
      expect(paid.paymentReceipt?.last4).toBe('4242');

      // Verify audit log recorded
      expect(auditLogsRecorded).toHaveLength(1);
      expect(auditLogsRecorded[0].action).toBe('INVOICE_PAID');
      expect(auditLogsRecorded[0].payload.amountUsd).toBe(1080);

      // Attempting to pay an already paid invoice throws error
      await expect(
        payTokenizedInvoice({
          token,
          paymentMethod: { type: 'card', last4: '4242' },
          clientIp: '203.0.113.10',
        })
      ).rejects.toThrow(/already paid in full/i);
    });

    it('rejects expired invoice tokens', async () => {
      const expiredToken = generateHighEntropyToken();
      const expiredInvoice: TokenizedInvoice = {
        id: 'inv_expired_01',
        invoiceNumber: 'INV-2026-EXPIRED',
        companyId,
        companyName: 'Acme Digital Services',
        clientName: 'Late Payer Corp',
        clientEmail: 'ap@latepayer.com',
        subtotalUsd: 500,
        taxAmountUsd: 0,
        totalAmountUsd: 500,
        status: 'issued',
        lineItems: [],
        token: expiredToken,
        tokenExpiresAt: new Date(Date.now() - 3600 * 1000).toISOString(), // expired 1h ago
      };
      seedTokenizedInvoiceForTest(expiredInvoice);

      await expect(verifyInvoiceToken(expiredToken, '203.0.113.10')).rejects.toThrow(
        /link has expired/i
      );
    });
  });

  describe('Step 073.2: Tokenized Estimates & Digital Signature Acceptance', () => {
    it('verifies estimate without login and accepts digital signature', async () => {
      const token = generateHighEntropyToken();
      const estimate: TokenizedEstimate = {
        id: 'est_token_01',
        estimateNumber: 'EST-2026-0019',
        companyId,
        companyName: 'Acme Digital Services',
        clientName: 'Enterprise Client LLC',
        clientEmail: 'cto@enterprise.com',
        totalAmountUsd: 4800,
        status: 'sent',
        lineItems: [
          {
            description: 'Custom PayFac Gateway Architecture',
            quantity: 1,
            unitPriceUsd: 4800,
            totalUsd: 4800,
          },
        ],
        token,
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      seedTokenizedEstimateForTest(estimate);

      // Verify estimate without login
      const retrieved = await verifyEstimateToken(token, '198.51.100.22');
      expect(retrieved.estimateNumber).toBe('EST-2026-0019');
      expect(retrieved.status).toBe('sent');

      // Sign and accept estimate
      const signatureDataUrl = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
      const signed = await acceptAndSignEstimate({
        token,
        signatureDataUrl,
        clientIp: '198.51.100.22',
        auditRepo: mockAuditRepo,
      });

      expect(signed.status).toBe('accepted');
      expect(signed.acceptedAt).toBeDefined();
      expect(signed.signerIp).toBe('198.51.100.22');
      expect(signed.signatureDataUrl).toBe(signatureDataUrl);

      // Verify audit log
      expect(auditLogsRecorded).toHaveLength(1);
      expect(auditLogsRecorded[0].action).toBe('ESTIMATE_ACCEPTED');

      // Re-signing throws error
      await expect(
        acceptAndSignEstimate({
          token,
          signatureDataUrl,
          clientIp: '198.51.100.22',
        })
      ).rejects.toThrow(/already been digitally signed/i);
    });
  });

  describe('Step 073.4: Rate Limiting Defense Against Token Brute Force', () => {
    it('permits valid rate and blocks scanning attempts after limit is reached', () => {
      const scannerIp = '198.51.100.99';

      // Perform allowed requests up to TOKEN_PORTAL_RATE_LIMIT
      for (let i = 0; i < TOKEN_PORTAL_RATE_LIMIT; i++) {
        const res = enforceTokenRateLimit(scannerIp);
        expect(res.allowed).toBe(true);
      }

      // Next request must be blocked with rate limit error
      expect(() => enforceTokenRateLimit(scannerIp)).toThrow(/Rate limit exceeded/i);
    });
  });

  describe('HTTP API Endpoints Integration', () => {
    it('retrieves and pays tokenized invoice via /api/client/invoice/[token]', async () => {
      const token = generateHighEntropyToken();
      seedTokenizedInvoiceForTest({
        id: 'inv_http_01',
        invoiceNumber: 'INV-HTTP-001',
        companyId,
        companyName: 'Acme Digital',
        clientName: 'Online Buyer',
        clientEmail: 'buyer@test.com',
        subtotalUsd: 250,
        taxAmountUsd: 0,
        totalAmountUsd: 250,
        status: 'issued',
        lineItems: [],
        token,
        tokenExpiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
      });

      // GET invoice
      const getReq = new NextRequest(`http://localhost/api/client/invoice/${token}`);
      const getRes = await getInvoiceByToken(getReq, {
        params: Promise.resolve({ token }),
      });
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.invoice.invoiceNumber).toBe('INV-HTTP-001');

      // POST pay invoice
      const postReq = new NextRequest(`http://localhost/api/client/invoice/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: { type: 'card', last4: '1111' },
        }),
      });
      const postRes = await postPayInvoice(postReq, {
        params: Promise.resolve({ token }),
      });
      expect(postRes.status).toBe(200);
      const postData = await postRes.json();
      expect(postData.success).toBe(true);
      expect(postData.invoice.status).toBe('paid');
      expect(postData.receipt.last4).toBe('1111');
    });

    it('retrieves and signs estimate via /api/client/estimate/[token]', async () => {
      const token = generateHighEntropyToken();
      seedTokenizedEstimateForTest({
        id: 'est_http_01',
        estimateNumber: 'EST-HTTP-001',
        companyId,
        companyName: 'Acme Digital',
        clientName: 'Online Prospect',
        clientEmail: 'prospect@test.com',
        totalAmountUsd: 1500,
        status: 'sent',
        lineItems: [],
        token,
        tokenExpiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
      });

      // GET estimate
      const getReq = new NextRequest(`http://localhost/api/client/estimate/${token}`);
      const getRes = await getEstimateByToken(getReq, {
        params: Promise.resolve({ token }),
      });
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.estimate.estimateNumber).toBe('EST-HTTP-001');

      // POST sign estimate
      const postReq = new NextRequest(`http://localhost/api/client/estimate/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        }),
      });
      const postRes = await postSignEstimate(postReq, {
        params: Promise.resolve({ token }),
      });
      expect(postRes.status).toBe(200);
      const postData = await postRes.json();
      expect(postData.success).toBe(true);
      expect(postData.estimate.status).toBe('accepted');
    });

    it('returns HTTP 404 for nonexistent invoice or estimate tokens', async () => {
      const fakeToken = 'nonexistent-token-xyz';

      const invReq = new NextRequest(`http://localhost/api/client/invoice/${fakeToken}`);
      const invRes = await getInvoiceByToken(invReq, {
        params: Promise.resolve({ token: fakeToken }),
      });
      expect(invRes.status).toBe(404);

      const estReq = new NextRequest(`http://localhost/api/client/estimate/${fakeToken}`);
      const estRes = await getEstimateByToken(estReq, {
        params: Promise.resolve({ token: fakeToken }),
      });
      expect(estRes.status).toBe(404);
    });
  });
});
