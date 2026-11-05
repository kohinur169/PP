// path: tests/processors/circuit-breaker.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getProcessorHealthState,
  recordProcessorSuccess,
  recordProcessorFailure,
  filterHealthyWaterfall,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
} from '@/lib/processors/circuit-breaker';

describe('Processor Circuit Breaker Engine & Health Tracking (Step 179)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    resetAllCircuitBreakers();
  });

  describe('Closed Healthy State & Metric Aggregation', () => {
    it('initializes in closed state and tracks latency and volume', async () => {
      const initial = getProcessorHealthState(tenantId, 'nmi');
      expect(initial.state).toBe('closed');
      expect(initial.consecutiveFailures).toBe(0);

      await recordProcessorSuccess(tenantId, 'nmi', 120.0, 500.0);
      await recordProcessorSuccess(tenantId, 'nmi', 180.0, 250.0);

      const state = getProcessorHealthState(tenantId, 'nmi');
      expect(state.totalRequests).toBe(2);
      expect(state.successfulRequests).toBe(2);
      expect(state.averageLatencyMs).toBe(150.0); // (120 + 180) / 2
      expect(state.totalVolumeUsd).toBe(750.0);
      expect(state.failureRatePct).toBe(0.0);
    });
  });

  describe('Trip to Open State upon Consecutive Failures', () => {
    it('trips circuit breaker to open after 5 consecutive gateway failures', async () => {
      for (let i = 0; i < 4; i++) {
        await recordProcessorFailure(tenantId, 'stripe_connect', 500.0, true);
        expect(getProcessorHealthState(tenantId, 'stripe_connect').state).toBe('closed');
      }

      // 5th consecutive failure triggers trip
      const tripped = await recordProcessorFailure(tenantId, 'stripe_connect', 500.0, true);
      expect(tripped.state).toBe('open');
      expect(tripped.consecutiveFailures).toBe(5);
      expect(tripped.trippedAt).toBeDefined();

      // Healthy waterfall filter must bypass tripped processor
      const originalWaterfall = ['stripe_connect', 'nmi', 'airwallex'] as const;
      const healthyWaterfall = filterHealthyWaterfall(tenantId, [...originalWaterfall]);

      expect(healthyWaterfall).toEqual(['nmi', 'airwallex']);
      expect(healthyWaterfall.includes('stripe_connect')).toBe(false);
    });
  });

  describe('Half-Open Canary Recovery & Re-Trip', () => {
    it('resets to closed when canary succeeds in half_open state', async () => {
      // Manually trip breaker and simulate expired cooldown
      const breaker = getProcessorHealthState(tenantId, 'rainforest');
      breaker.state = 'open';
      // Simulate tripped 70 seconds ago (cooldown = 60s)
      breaker.trippedAt = new Date(Date.now() - 70000).toISOString();

      // Check state -> should transition to half_open
      const halfOpen = getProcessorHealthState(tenantId, 'rainforest');
      expect(halfOpen.state).toBe('half_open');

      // Canary success -> resets to closed
      const recovered = await recordProcessorSuccess(tenantId, 'rainforest', 110.0, 100.0);
      expect(recovered.state).toBe('closed');
      expect(recovered.consecutiveFailures).toBe(0);
    });

    it('immediately re-trips to open if canary fails in half_open state', async () => {
      const breaker = getProcessorHealthState(tenantId, 'airwallex');
      breaker.state = 'open';
      breaker.trippedAt = new Date(Date.now() - 70000).toISOString();

      expect(getProcessorHealthState(tenantId, 'airwallex').state).toBe('half_open');

      // Canary failure -> immediately trips back to open
      const retripped = await recordProcessorFailure(tenantId, 'airwallex', 450.0, true);
      expect(retripped.state).toBe('open');
    });
  });

  describe('Administrative Manual Reset', () => {
    it('manually resets an open circuit breaker to closed', async () => {
      for (let i = 0; i < 5; i++) {
        await recordProcessorFailure(tenantId, 'payoneer', 300.0, true);
      }
      expect(getProcessorHealthState(tenantId, 'payoneer').state).toBe('open');

      const reset = resetCircuitBreaker(tenantId, 'payoneer');
      expect(reset.state).toBe('closed');
      expect(reset.consecutiveFailures).toBe(0);
    });
  });
});
