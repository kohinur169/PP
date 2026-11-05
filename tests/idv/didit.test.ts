// path: tests/idv/didit.test.ts

import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { DiditAdapter } from '@/lib/idv/didit';
import { POST as handleDiditWebhook } from '@/app/api/webhooks/idv/didit/route';

describe('Step 100: Didit Identity & Liveness Verification Adapter Implementation', () => {
  const secret = 'didit_test_secret';
  const adapter = new DiditAdapter({ apiSecret: secret });

  it('Step 100.1: initiates Didit verification session with WebSDK redirect and session token', async () => {
    const session = await adapter.initiateVerificationSession({
      userId: 'user_didit_01',
      companyId: 'comp_didit_01',
      userEmail: 'director.didit@kdsolution.it',
      userFullName: 'Sophia Lin',
    });

    expect(session.vendor).toBe('didit');
    expect(session.sessionId).toBeDefined();
    expect(session.clientToken).toMatch(/^didit_tok_/);
    expect(session.redirectUrl).toContain('https://verify.didit.me/session/didit_sess_');
    expect(session.vendorReference).toMatch(/^didit_sess_/);
  });

  it('Step 100.2: validates Didit HMAC signature with replay protection timestamp', () => {
    const now = Date.now();
    const timestampStr = Math.floor(now / 1000).toString();
    const rawBody = JSON.stringify({ event: 'session.completed', status: 'APPROVED' });

    // Valid signature with timestamp header prefix
    const payloadToSign = `${timestampStr}.${rawBody}`;
    const validSig = crypto.createHmac('sha256', secret).update(payloadToSign, 'utf8').digest('hex');

    expect(
      adapter.verifyWebhookSignature(rawBody, validSig, secret, timestampStr, new Date(now))
    ).toBe(true);

    // Replay attack: timestamp older than 5 minutes (e.g. 10 minutes ago)
    const oldTimestampStr = Math.floor((now - 10 * 60 * 1000) / 1000).toString();
    const oldPayloadToSign = `${oldTimestampStr}.${rawBody}`;
    const oldSig = crypto
      .createHmac('sha256', secret)
      .update(oldPayloadToSign, 'utf8')
      .digest('hex');

    expect(
      adapter.verifyWebhookSignature(rawBody, oldSig, secret, oldTimestampStr, new Date(now))
    ).toBe(false);

    // Tampered payload
    expect(
      adapter.verifyWebhookSignature(rawBody + 'tampered', validSig, secret, timestampStr, new Date(now))
    ).toBe(false);
  });

  it('Step 100.3: extracts OCR document numbers and biometric liveness into platform KYC model', () => {
    const payload = {
      session_id: 'didit_sess_abc123',
      user_id: 'user_sophia_lin',
      status: 'APPROVED' as const,
      timestamp: '2026-11-05T02:00:00.000Z',
      liveness: {
        passed: true,
        confidence: 99,
      },
      ocr_document: {
        document_type: 'PASSPORT',
        document_number: 'USA11223344',
        first_name: 'Sophia',
        last_name: 'Lin',
        date_of_birth: '1990-09-24',
        issuing_country: 'US',
        address: {
          street: '220 Greenwich St',
          city: 'New York',
          postal_code: '10007',
          country: 'US',
        },
      },
    };

    const parsed = adapter.parseWebhookPayload(payload);

    expect(parsed.vendor).toBe('didit');
    expect(parsed.sessionId).toBe('didit_sess_abc123');
    expect(parsed.status).toBe('PASSED');
    expect(parsed.idType).toBe('PASSPORT');
    expect(parsed.fullName).toBe('Sophia Lin');
    expect(parsed.idNumberMasked).toBe('*******3344');
    expect(parsed.livenessPassed).toBe(true);
    expect(parsed.confidenceScore).toBe(0.99);
    expect(parsed.extractedAddress?.city).toBe('New York');
  });

  it('Step 100.4: maps Didit REVIEW_NEEDED and RESUBMISSION_REQUESTED to MANUAL_REVIEW', () => {
    const payload = {
      session_id: 'didit_sess_review',
      user_id: 'user_test_review',
      status: 'REVIEW_NEEDED' as const,
      timestamp: '2026-11-05T02:00:00.000Z',
      liveness: {
        passed: true,
        confidence: 75,
      },
    };

    const parsed = adapter.parseWebhookPayload(payload);

    expect(parsed.status).toBe('MANUAL_REVIEW');
    expect(parsed.confidenceScore).toBe(0.75);
  });

  it('Step 100.5: maps Didit DECLINED to FAILED with decision reasons', () => {
    const payload = {
      session_id: 'didit_sess_fail',
      user_id: 'user_test_fail',
      status: 'DECLINED' as const,
      timestamp: '2026-11-05T02:00:00.000Z',
      liveness: {
        passed: false,
        confidence: 12,
      },
      decision_reasons: ['Liveness check failed - printed photograph detected'],
    };

    const parsed = adapter.parseWebhookPayload(payload);

    expect(parsed.status).toBe('FAILED');
    expect(parsed.livenessPassed).toBe(false);
    expect(parsed.rejectionReasons).toContain(
      'Liveness check failed - printed photograph detected'
    );
  });

  describe('Step 100.6: Webhook API Route Handler (/api/webhooks/idv/didit)', () => {
    it('returns HTTP 401 when signature is missing or invalid', async () => {
      const body = JSON.stringify({ session_id: 'test' });
      const req = new NextRequest('http://localhost:3000/api/webhooks/idv/didit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      const res = await handleDiditWebhook(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('returns HTTP 200 and processes valid signed Didit webhook callback', async () => {
      const payloadObj = {
        session_id: 'didit_sess_ok_001',
        user_id: 'user_approved_001',
        status: 'APPROVED',
        timestamp: new Date().toISOString(),
        liveness: {
          passed: true,
          confidence: 96,
        },
      };
      const rawBody = JSON.stringify(payloadObj);
      const signature = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

      const req = new NextRequest('http://localhost:3000/api/webhooks/idv/didit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-didit-signature': signature,
        },
        body: rawBody,
      });

      const res = await handleDiditWebhook(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.received).toBe(true);
      expect(json.status).toBe('PASSED');
      expect(json.isApproved).toBe(true);
      expect(json.sessionId).toBe('didit_sess_ok_001');
    });

    it('returns HTTP 400 on malformed JSON payload with valid signature', async () => {
      const malformedBody = 'not-valid-json';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(malformedBody, 'utf8')
        .digest('hex');

      const req = new NextRequest('http://localhost:3000/api/webhooks/idv/didit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-didit-signature': signature,
        },
        body: malformedBody,
      });

      const res = await handleDiditWebhook(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Bad Request');
    });
  });
});
