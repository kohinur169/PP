// path: tests/processors/test-connection.test.ts

import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  testGatewayConnection,
  assertGatewayConnectable,
  isValidProviderSlug,
} from '@/lib/processors/test-connection';
import { POST } from '@/app/api/office/gateways/[provider]/test/route';
import type { PaymentProcessorSlug } from '@/types/processors';

describe('Step 122: Built-in Live Gateway Connection Test Harness', () => {
  describe('Step 122.1: Provider Validation & Slug Checks', () => {
    it('validates all 5 launch provider slugs', () => {
      expect(isValidProviderSlug('nmi')).toBe(true);
      expect(isValidProviderSlug('stripe_connect')).toBe(true);
      expect(isValidProviderSlug('rainforest')).toBe(true);
      expect(isValidProviderSlug('airwallex')).toBe(true);
      expect(isValidProviderSlug('payoneer')).toBe(true);
      expect(isValidProviderSlug('unsupported_processor')).toBe(false);
    });
  });

  describe('Step 122.2: Live Gateway Connection Probes', () => {
    const launchProviders: PaymentProcessorSlug[] = [
      'nmi',
      'stripe_connect',
      'rainforest',
      'airwallex',
      'payoneer',
    ];

    for (const provider of launchProviders) {
      it(`successfully tests connection for launch provider: ${provider}`, async () => {
        const report = await testGatewayConnection({
          providerSlug: provider,
        });

        expect(report.providerSlug).toBe(provider);
        expect(report.isConnected).toBe(true);
        expect(report.latencyMs).toBeGreaterThanOrEqual(0);
        expect(report.diagnostics.timestamp).toBeDefined();
        expect(report.diagnostics.dnsResolved).toBe(true);
      });
    }

    it('captures custom credentials flag in diagnostics when provided', async () => {
      const report = await testGatewayConnection({
        providerSlug: 'rainforest',
        credentials: { apiKey: 'rf_test_custom_key_001' },
      });

      expect(report.diagnostics.testedWithCustomCredentials).toBe(true);
    });

    it('enforces timeout boundary when test connection exceeds timeout limit', async () => {
      // Simulate extreme timeout of 1 millisecond
      const report = await testGatewayConnection({
        providerSlug: 'nmi',
        timeoutMs: 0,
      });

      expect(report.isConnected).toBe(false);
      expect(report.message).toMatch(/timed out/i);
      expect(report.diagnostics.httpStatus).toBe(504);
    });
  });

  describe('Step 122.3: Gateway Activation Assertions & Safeguard', () => {
    it('assertGatewayConnectable succeeds for healthy gateways', async () => {
      const report = await assertGatewayConnectable('stripe_connect');
      expect(report.isConnected).toBe(true);
    });

    it('assertGatewayConnectable throws descriptive error when connection fails', async () => {
      // Pass invalid empty credentials to trigger connection failure
      await expect(
        assertGatewayConnectable('stripe_connect', { apiKey: '' })
      ).rejects.toThrow(/Gateway activation blocked/i);
    });
  });

  describe('Step 122.4: Office API Endpoint POST /api/office/gateways/[provider]/test', () => {
    it('returns HTTP 400 when an invalid provider slug is provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/office/gateways/invalid_mid/test', {
        method: 'POST',
      });

      const res = await POST(req, { params: Promise.resolve({ provider: 'invalid_mid' }) });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toMatch(/Invalid gateway provider/i);
    });

    it('returns HTTP 200 with test report for valid connected provider', async () => {
      const req = new NextRequest('http://localhost:3000/api/office/gateways/rainforest/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: { apiKey: 'rf_mock_api_key' } }),
      });

      const res = await POST(req, { params: Promise.resolve({ provider: 'rainforest' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.providerSlug).toBe('rainforest');
      expect(json.isConnected).toBe(true);
      expect(json.diagnostics.dnsResolved).toBe(true);
    });

    it('returns HTTP 422 with diagnostic payload when test fails', async () => {
      const req = new NextRequest('http://localhost:3000/api/office/gateways/stripe_connect/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: { apiKey: '' } }),
      });

      const res = await POST(req, { params: Promise.resolve({ provider: 'stripe_connect' }) });
      expect(res.status).toBe(422);

      const json = await res.json();
      expect(json.isConnected).toBe(false);
      expect(json.diagnostics.httpStatus).toBe(401);
    });
  });
});
