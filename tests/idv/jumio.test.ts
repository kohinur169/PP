// path: tests/idv/jumio.test.ts

import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { JumioAdapter } from '@/lib/idv/jumio';
import { POST as handleJumioWebhook } from '@/app/api/webhooks/idv/jumio/route';

describe('Step 099: Jumio Netverify Identity Verification Adapter Implementation', () => {
  const secret = 'jumio_test_secret';
  const adapter = new JumioAdapter({ apiSecret: secret });

  it('Step 099.1: initiates verification session with WebSDK redirect and client authorization token', async () => {
    const session = await adapter.initiateVerificationSession({
      userId: 'user_jumio_01',
      companyId: 'comp_jumio_01',
      userEmail: 'director@kdsolution.it',
      userFullName: 'Alexander Wright',
    });

    expect(session.vendor).toBe('jumio');
    expect(session.sessionId).toBeDefined();
    expect(session.clientToken).toMatch(/^jumio_tok_/);
    expect(session.redirectUrl).toContain('https://netverify.jumio.com/web/v4/app');
    expect(session.vendorReference).toMatch(/^jumio_scan_/);
  });

  it('Step 099.2: validates Jumio HMAC-SHA256 signature and rejects forged callbacks', () => {
    const payload = JSON.stringify({ scanReference: 'scan_101', verificationStatus: 'PASSED' });
    const validSig = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

    expect(adapter.verifyWebhookSignature(payload, validSig, secret)).toBe(true);
    expect(adapter.verifyWebhookSignature(payload, 'bad_signature_hex', secret)).toBe(false);
    expect(adapter.verifyWebhookSignature(payload + 'extra', validSig, secret)).toBe(false);
  });

  it('Step 099.3: accurately maps Jumio PASSED payload to normalized platform model', () => {
    const payload = {
      scanReference: 'scan_jumio_999',
      customerInternalReference: 'sess_platform_123',
      verificationStatus: 'PASSED',
      transactionStatus: 'PASSED',
      idScanStatus: 'SUCCESS',
      livenessStatus: 'PASSED',
      similarityScore: 98,
      idCheck: {
        status: 'PASSED',
        type: 'PASSPORT',
        idNumber: 'USA987654321',
        firstName: 'Alexander',
        lastName: 'Wright',
        dob: '1985-04-12',
        country: 'USA',
        address: {
          street: '140 Franklin St',
          city: 'New York',
          postalCode: '10013',
          country: 'US',
        },
      },
    };

    const parsed = adapter.parseWebhookPayload(payload);

    expect(parsed.vendor).toBe('jumio');
    expect(parsed.sessionId).toBe('sess_platform_123');
    expect(parsed.status).toBe('PASSED');
    expect(parsed.idType).toBe('PASSPORT');
    expect(parsed.fullName).toBe('Alexander Wright');
    expect(parsed.idNumberMasked).toBe('********4321');
    expect(parsed.livenessPassed).toBe(true);
    expect(parsed.confidenceScore).toBe(0.98);
    expect(parsed.extractedAddress?.city).toBe('New York');
  });

  it('Step 099.4: maps Jumio WARNING payload to MANUAL_REVIEW', () => {
    const payload = {
      scanReference: 'scan_jumio_warning',
      customerInternalReference: 'sess_warning_01',
      verificationStatus: 'WARNING',
      transactionStatus: 'PASSED',
      idScanStatus: 'SUCCESS',
      livenessStatus: 'PASSED',
      similarityScore: 78,
    };

    const parsed = adapter.parseWebhookPayload(payload);

    expect(parsed.status).toBe('MANUAL_REVIEW');
    expect(parsed.rejectionReasons?.[0]).toContain('warning check');
  });

  it('Step 099.5: maps Jumio FAILED payload with specific reject reason', () => {
    const payload = {
      scanReference: 'scan_jumio_fail',
      customerInternalReference: 'sess_failed_01',
      verificationStatus: 'FAILED',
      transactionStatus: 'FAILED',
      idScanStatus: 'ERROR',
      livenessStatus: 'FAILED',
      rejectReason: {
        ruleCode: '100',
        description: 'Photo of ID document is blurry and unreadable.',
      },
    };

    const parsed = adapter.parseWebhookPayload(payload);

    expect(parsed.status).toBe('FAILED');
    expect(parsed.livenessPassed).toBe(false);
    expect(parsed.rejectionReasons).toContain('Photo of ID document is blurry and unreadable.');
  });

  describe('Step 099.6: Webhook API Route Handler (/api/webhooks/idv/jumio)', () => {
    it('returns HTTP 401 when HMAC signature is missing or invalid', async () => {
      const body = JSON.stringify({ scanReference: 'test' });
      const req = new NextRequest('http://localhost:3000/api/webhooks/idv/jumio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      const res = await handleJumioWebhook(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('returns HTTP 200 and processes valid signed webhook payload', async () => {
      const payloadObj = {
        scanReference: 'scan_ok_001',
        customerInternalReference: 'sess_approved_001',
        verificationStatus: 'PASSED',
        transactionStatus: 'PASSED',
        idScanStatus: 'SUCCESS',
        livenessStatus: 'PASSED',
        similarityScore: 95,
      };
      const rawBody = JSON.stringify(payloadObj);
      const signature = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

      const req = new NextRequest('http://localhost:3000/api/webhooks/idv/jumio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-jumio-signature': signature,
        },
        body: rawBody,
      });

      const res = await handleJumioWebhook(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.received).toBe(true);
      expect(json.status).toBe('PASSED');
      expect(json.isApproved).toBe(true);
      expect(json.sessionId).toBe('sess_approved_001');
    });

    it('returns HTTP 400 on malformed JSON payload with valid signature', async () => {
      const malformedBody = 'not-valid-json';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(malformedBody, 'utf8')
        .digest('hex');

      const req = new NextRequest('http://localhost:3000/api/webhooks/idv/jumio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-jumio-signature': signature,
        },
        body: malformedBody,
      });

      const res = await handleJumioWebhook(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Bad Request');
    });
  });
});
