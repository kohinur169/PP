// path: tests/processors/decline-handling.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyDeclineCode,
  evaluateDeclineAndFailover,
  resetFailoverLogsStore,
} from '@/lib/processors/decline-handling';
import {
  recordProcessorFailure,
  resetAllCircuitBreakers,
} from '@/lib/processors/circuit-breaker';

describe('Soft Decline Failover & Hard Decline Terminal Handling Engine (Step 180)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const paymentIntentId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    resetFailoverLogsStore();
    resetAllCircuitBreakers();
  });

  describe('Decline Code Classification Invariants', () => {
    it('classifies soft retryable codes vs hard terminal codes accurately', () => {
      // Soft declines
      expect(classifyDeclineCode('05').category).toBe('soft');
      expect(classifyDeclineCode('05').isRetryable).toBe(true);
      expect(classifyDeclineCode('91').category).toBe('soft');
      expect(classifyDeclineCode('TO').category).toBe('soft');

      // Hard declines
      expect(classifyDeclineCode('04').category).toBe('hard');
      expect(classifyDeclineCode('04').isRetryable).toBe(false);
      expect(classifyDeclineCode('14').category).toBe('hard');
      expect(classifyDeclineCode('41').category).toBe('hard');
      expect(classifyDeclineCode('54').category).toBe('hard');
    });
  });

  describe('Soft Decline Automatic Failover', () => {
    it('triggers failover to secondary processor on 05 Do Not Honor', async () => {
      const res = await evaluateDeclineAndFailover({
        tenantId,
        paymentIntentId,
        primaryProcessor: 'nmi',
        declineCode: '05',
        attemptNumber: 1,
        waterfallOrder: ['nmi', 'stripe_connect', 'rainforest'],
      });

      expect(res.canFailover).toBe(true);
      expect(res.isTerminalHardDecline).toBe(false);
      expect(res.nextProcessor).toBe('stripe_connect');
      expect(res.attemptNumber).toBe(2);
    });

    it('triggers failover on gateway timeout TO', async () => {
      const res = await evaluateDeclineAndFailover({
        tenantId,
        paymentIntentId,
        primaryProcessor: 'rainforest',
        declineCode: 'TO',
        attemptNumber: 1,
        waterfallOrder: ['rainforest', 'airwallex', 'stripe_connect'],
      });

      expect(res.canFailover).toBe(true);
      expect(res.nextProcessor).toBe('airwallex');
    });
  });

  describe('Hard Decline Terminal Enforcement', () => {
    it('strictly suppresses failover and terminates on 04 Pick Up Card fraud decline', async () => {
      const res = await evaluateDeclineAndFailover({
        tenantId,
        paymentIntentId,
        primaryProcessor: 'nmi',
        declineCode: '04',
        attemptNumber: 1,
        waterfallOrder: ['nmi', 'stripe_connect', 'rainforest'],
      });

      expect(res.canFailover).toBe(false);
      expect(res.isTerminalHardDecline).toBe(true);
      expect(res.nextProcessor).toBeUndefined();
      expect(res.cardholderMessage).toContain('Please use another payment method');
    });

    it('strictly suppresses failover on 54 Expired Card', async () => {
      const res = await evaluateDeclineAndFailover({
        tenantId,
        paymentIntentId,
        primaryProcessor: 'stripe_connect',
        declineCode: '54',
        attemptNumber: 1,
        waterfallOrder: ['stripe_connect', 'nmi'],
      });

      expect(res.canFailover).toBe(false);
      expect(res.isTerminalHardDecline).toBe(true);
    });
  });

  describe('Circuit Breaker Integrated Failover', () => {
    it('bypasses secondary processor if its circuit breaker is open', async () => {
      // Trip stripe_connect circuit breaker
      for (let i = 0; i < 5; i++) {
        await recordProcessorFailure(tenantId, 'stripe_connect', 500.0, true);
      }

      // Waterfall is [nmi, stripe_connect, rainforest].
      // When NMI soft-declines, failover should skip tripped stripe_connect and select rainforest!
      const res = await evaluateDeclineAndFailover({
        tenantId,
        paymentIntentId,
        primaryProcessor: 'nmi',
        declineCode: '05',
        attemptNumber: 1,
        waterfallOrder: ['nmi', 'stripe_connect', 'rainforest'],
      });

      expect(res.canFailover).toBe(true);
      expect(res.nextProcessor).toBe('rainforest');
    });
  });

  describe('Maximum Failover Attempts Cap', () => {
    it('halts failover when maximum attempts limit is reached', async () => {
      const res = await evaluateDeclineAndFailover({
        tenantId,
        paymentIntentId,
        primaryProcessor: 'nmi',
        declineCode: '05',
        attemptNumber: 3, // Already reached attempt 3 (max is 2 failovers)
        waterfallOrder: ['nmi', 'stripe_connect'],
      });

      expect(res.canFailover).toBe(false);
      expect(res.nextProcessor).toBeUndefined();
    });
  });
});
