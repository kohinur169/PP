// path: tests/idv/adapter-interface.test.ts

import crypto from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { MockIdvAdapter } from '@/lib/idv/mock';
import { applyIdvFailClosedPolicy, type IdvVerificationResult } from '@/lib/idv/types';

describe('Step 098: Supplementary IDV Adapter Common Interface Specification', () => {
  let adapter: MockIdvAdapter;

  beforeEach(() => {
    adapter = new MockIdvAdapter();
  });

  it('Step 098.1: initiates verification session fulfilling IdvAdapter interface', async () => {
    const session = await adapter.initiateVerificationSession({
      userId: 'user_018f6c4c_1234',
      companyId: 'comp_018f6c4c_5678',
      userEmail: 'ceo@kdsolution.it',
      userFullName: 'Johnathan Edward Doe',
      redirectUrl: 'https://kdsolution.it/onboarding/kyc/complete',
    });

    expect(session.sessionId).toBeDefined();
    expect(session.vendor).toBe('mock');
    expect(session.redirectUrl).toContain('https://idv.mock.kdsolution.it/verify');
    expect(session.vendorReference).toMatch(/^mock_ref_\d+/);
    expect(session.expiresAt).toBeDefined();
  });

  it('Step 098.2: checks verification status returning normalized identity fields', async () => {
    const result = await adapter.checkVerificationStatus('mock_ref_123456');

    expect(result.vendor).toBe('mock');
    expect(result.status).toBe('PASSED');
    expect(result.idType).toBe('PASSPORT');
    expect(result.idNumberMasked).toBe('USA*****4321');
    expect(result.fullName).toBe('Johnathan Edward Doe');
    expect(result.dob).toBe('1988-06-15');
    expect(result.nationality).toBe('US');
    expect(result.livenessPassed).toBe(true);
    expect(result.confidenceScore).toBe(0.98);
    expect(result.rawVendorStatus).toBe('MOCK_PASSED');
  });

  it('Step 098.3: verifies webhook HMAC-SHA256 signature using timing-safe comparison', () => {
    const secret = 'super-secret-idv-key';
    const payload = JSON.stringify({ event: 'VERIFICATION_COMPLETED', sessionId: 'sess_99' });

    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    expect(adapter.verifyWebhookSignature(payload, validSignature, secret)).toBe(true);
    expect(adapter.verifyWebhookSignature(payload, 'invalid_signature_hex', secret)).toBe(false);
    expect(adapter.verifyWebhookSignature(payload + 'tampered', validSignature, secret)).toBe(false);
  });

  it('Step 098.4: parses webhook payload into normalized IdvVerificationResult', () => {
    const webhookData = {
      sessionId: 'sess_webhook_01',
      status: 'PASSED',
      confidence: 0.95,
      livenessPassed: true,
      fullName: 'Alice Walker',
    };

    const parsed = adapter.parseWebhookPayload(webhookData);

    expect(parsed.sessionId).toBe('sess_webhook_01');
    expect(parsed.status).toBe('PASSED');
    expect(parsed.confidenceScore).toBe(0.95);
    expect(parsed.livenessPassed).toBe(true);
    expect(parsed.fullName).toBe('Alice Walker');
  });

  describe('Step 098.5: Fail-Closed Security Policy Guard', () => {
    const baseResult: IdvVerificationResult = {
      sessionId: 'sess_123',
      vendor: 'mock',
      status: 'PASSED',
      idType: 'PASSPORT',
      idNumberMasked: 'USA*****4321',
      fullName: 'Johnathan Edward Doe',
      dob: '1988-06-15',
      nationality: 'US',
      livenessPassed: true,
      confidenceScore: 0.95,
      rawVendorStatus: 'MOCK_PASSED',
      completedAt: new Date().toISOString(),
    };

    it('approves clean passed session with high confidence and verified liveness', () => {
      const decision = applyIdvFailClosedPolicy(baseResult);

      expect(decision.isApproved).toBe(true);
      expect(decision.requiresManualReview).toBe(false);
      expect(decision.isRejected).toBe(false);
      expect(decision.finalStatus).toBe('PASSED');
    });

    it('enforces fail-closed: blocks auto-pass and routes to MANUAL_REVIEW if liveness check failed', () => {
      const failedLivenessResult: IdvVerificationResult = {
        ...baseResult,
        livenessPassed: false, // Liveness failed
      };

      const decision = applyIdvFailClosedPolicy(failedLivenessResult);

      expect(decision.isApproved).toBe(false);
      expect(decision.requiresManualReview).toBe(true);
      expect(decision.finalStatus).toBe('MANUAL_REVIEW');
      expect(decision.reasons.some((r) => r.includes('liveness'))).toBe(true);
    });

    it('enforces fail-closed: blocks auto-pass and routes to MANUAL_REVIEW if confidence < 80%', () => {
      const lowConfidenceResult: IdvVerificationResult = {
        ...baseResult,
        confidenceScore: 0.74, // Below 0.80 threshold
      };

      const decision = applyIdvFailClosedPolicy(lowConfidenceResult);

      expect(decision.isApproved).toBe(false);
      expect(decision.requiresManualReview).toBe(true);
      expect(decision.finalStatus).toBe('MANUAL_REVIEW');
      expect(decision.reasons.some((r) => r.includes('below the mandatory 80.0% threshold'))).toBe(true);
    });

    it('rejects failed or expired sessions outright', () => {
      const failedResult: IdvVerificationResult = {
        ...baseResult,
        status: 'FAILED',
        rejectionReasons: ['Fraudulent document detected'],
      };

      const decision = applyIdvFailClosedPolicy(failedResult);

      expect(decision.isApproved).toBe(false);
      expect(decision.isRejected).toBe(true);
      expect(decision.finalStatus).toBe('FAILED');
      expect(decision.reasons).toContain('Fraudulent document detected');
    });
  });
});
