// path: tests/idv/sumsub.test.ts

import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { SumsubAdapter } from '@/lib/idv/sumsub';
import { POST as handleSumsubWebhook } from '@/app/api/webhooks/idv/sumsub/route';

describe('Step 101: Sumsub WebSDK Identity Verification Adapter Implementation', () => {
  const secret = 'sumsub_test_secret_key';
  const adapter = new SumsubAdapter({ secretKey: secret });

  it('Step 101.1: initiates Sumsub WebSDK session with client access token and applicant reference', async () => {
    const session = await adapter.initiateVerificationSession({
      userId: 'user_sumsub_01',
      companyId: 'comp_sumsub_01',
      userEmail: 'director.sumsub@kdsolution.it',
      userFullName: 'Marcus Vance',
    });

    expect(session.vendor).toBe('sumsub');
    expect(session.sessionId).toBeDefined();
    expect(session.clientToken).toMatch(/^sumsub_tok_/);
    expect(session.redirectUrl).toContain('https://cockpit.sumsub.com/idensic/app?accessToken=');
    expect(session.vendorReference).toMatch(/^sumsub_app_/);
  });

  it('Step 101.2: validates Sumsub HMAC-SHA256 and HMAC-SHA1 webhook payload digests', () => {
    const payload = JSON.stringify({ applicantId: 'app_123', type: 'applicantReviewed' });

    // SHA-256
    const validSha256 = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    expect(adapter.verifyWebhookSignature(payload, validSha256, secret, 'sha256')).toBe(true);
    expect(adapter.verifyWebhookSignature(payload, 'tampered_hash', secret, 'sha256')).toBe(false);

    // SHA-1
    const validSha1 = crypto.createHmac('sha1', secret).update(payload, 'utf8').digest('hex');
    expect(adapter.verifyWebhookSignature(payload, validSha1, secret, 'sha1')).toBe(true);

    // Rejection on payload tampering
    expect(adapter.verifyWebhookSignature(payload + 'tampered', validSha256, secret, 'sha256')).toBe(false);
  });

  it('Step 101.3: accurately normalizes Sumsub GREEN approval reviewAnswer into platform KYC model', () => {
    const payload = {
      applicantId: 'app_sumsub_approved_01',
      externalUserId: 'user_sumsub_approved_01',
      type: 'applicantReviewed',
      reviewStatus: 'completed',
      reviewResult: {
        reviewAnswer: 'GREEN' as const,
      },
      info: {
        firstName: 'Marcus',
        lastName: 'Vance',
        dob: '1984-07-19',
        country: 'GBR',
        addresses: [
          {
            street: '25 Bank St, Canary Wharf',
            city: 'London',
            postCode: 'E14 5JP',
            country: 'GB',
          },
        ],
        idDocs: [
          {
            idDocType: 'PASSPORT',
            number: 'GBR99887766',
            country: 'GBR',
          },
        ],
      },
    };

    const parsed = adapter.parseWebhookPayload(payload);

    expect(parsed.vendor).toBe('sumsub');
    expect(parsed.sessionId).toBe('user_sumsub_approved_01');
    expect(parsed.status).toBe('PASSED');
    expect(parsed.idType).toBe('PASSPORT');
    expect(parsed.fullName).toBe('Marcus Vance');
    expect(parsed.idNumberMasked).toBe('*******7766');
    expect(parsed.livenessPassed).toBe(true);
    expect(parsed.confidenceScore).toBe(0.98);
    expect(parsed.extractedAddress?.city).toBe('London');
  });

  it('Step 101.4: maps Sumsub RED with reviewRejectType RETRY to MANUAL_REVIEW', () => {
    const payload = {
      applicantId: 'app_sumsub_retry_01',
      externalUserId: 'user_retry_01',
      type: 'applicantReviewed',
      reviewResult: {
        reviewAnswer: 'RED' as const,
        reviewRejectType: 'RETRY' as const,
        rejectLabels: ['DOCUMENT_PAGE_MISSING'],
        moderationComment: 'Back of ID card is missing.',
      },
    };

    const parsed = adapter.parseWebhookPayload(payload);

    expect(parsed.status).toBe('MANUAL_REVIEW');
    expect(parsed.rejectionReasons).toContain('DOCUMENT_PAGE_MISSING');
    expect(parsed.rejectionReasons).toContain('Back of ID card is missing.');
  });

  it('Step 101.5: maps Sumsub RED with FINAL rejection to FAILED', () => {
    const payload = {
      applicantId: 'app_sumsub_final_01',
      externalUserId: 'user_final_01',
      type: 'applicantReviewed',
      reviewResult: {
        reviewAnswer: 'RED' as const,
        reviewRejectType: 'FINAL' as const,
        rejectLabels: ['FORGERY', 'SANCTION_HIT'],
      },
    };

    const parsed = adapter.parseWebhookPayload(payload);

    expect(parsed.status).toBe('FAILED');
    expect(parsed.livenessPassed).toBe(false);
    expect(parsed.rejectionReasons).toContain('FORGERY');
    expect(parsed.rejectionReasons).toContain('SANCTION_HIT');
  });

  describe('Step 101.6: Webhook API Route Handler (/api/webhooks/idv/sumsub)', () => {
    it('returns HTTP 401 when signature is missing or invalid', async () => {
      const body = JSON.stringify({ applicantId: 'test' });
      const req = new NextRequest('http://localhost:3000/api/webhooks/idv/sumsub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      const res = await handleSumsubWebhook(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('returns HTTP 200 and processes valid signed Sumsub webhook payload', async () => {
      const payloadObj = {
        applicantId: 'app_sumsub_ok_001',
        externalUserId: 'user_approved_001',
        type: 'applicantReviewed',
        reviewStatus: 'completed',
        reviewResult: {
          reviewAnswer: 'GREEN',
        },
      };
      const rawBody = JSON.stringify(payloadObj);
      const signature = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

      const req = new NextRequest('http://localhost:3000/api/webhooks/idv/sumsub', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-payload-digest': signature,
        },
        body: rawBody,
      });

      const res = await handleSumsubWebhook(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.received).toBe(true);
      expect(json.status).toBe('PASSED');
      expect(json.isApproved).toBe(true);
      expect(json.sessionId).toBe('user_approved_001');
    });

    it('returns HTTP 400 on malformed JSON payload with valid signature', async () => {
      const malformedBody = 'not-valid-json';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(malformedBody, 'utf8')
        .digest('hex');

      const req = new NextRequest('http://localhost:3000/api/webhooks/idv/sumsub', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-payload-digest': signature,
        },
        body: malformedBody,
      });

      const res = await handleSumsubWebhook(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Bad Request');
    });
  });
});
