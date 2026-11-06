// path: tests/webhooks/idempotency.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  acquireWebhookLock,
  completeWebhookEvent,
  failWebhookEvent,
  processWebhookWithIdempotency,
  resetWebhookLockStore,
} from '@/lib/webhooks/idempotency';

describe('Webhook Idempotency & Distributed Event Lock Engine (Step 128)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const provider = 'stripe_connect';
  const eventId = 'evt_test_stripe_idempotency_001';
  const eventType = 'payment_intent.succeeded';

  beforeEach(() => {
    resetWebhookLockStore();
  });

  describe('Distributed Lock Acquisition & Deduplication (Step 128.2)', () => {
    it('acquires lock successfully for new unseen webhook event', async () => {
      const lock = await acquireWebhookLock({
        tenantId,
        provider,
        eventId,
        eventType,
      });

      expect(lock.acquired).toBe(true);
      expect(lock.status).toBe('processing');
      expect(lock.isAlreadyCompleted).toBe(false);
      expect(lock.isAlreadyProcessing).toBe(false);
    });

    it('rejects concurrent lock acquisition while event is actively processing', async () => {
      // First worker acquires lock
      const first = await acquireWebhookLock({ tenantId, provider, eventId, eventType });
      expect(first.acquired).toBe(true);

      // Second worker attempts lock concurrently
      const second = await acquireWebhookLock({ tenantId, provider, eventId, eventType });
      expect(second.acquired).toBe(false);
      expect(second.isAlreadyProcessing).toBe(true);
      expect(second.isAlreadyCompleted).toBe(false);
    });
  });

  describe('Completed Event Fast-Path Return (Step 128.3)', () => {
    it('returns HTTP 200 immediately without re-executing action when event previously completed', async () => {
      let executionCount = 0;
      const ledgerAction = vi.fn().mockImplementation(async () => {
        executionCount++;
        return { balanceUpdated: true };
      });

      // 1. First execution
      const firstResult = await processWebhookWithIdempotency({
        tenantId,
        provider,
        eventId,
        eventType,
        execute: ledgerAction,
      });

      expect(firstResult.executed).toBe(true);
      expect(firstResult.httpStatus).toBe(200);
      expect(executionCount).toBe(1);

      // 2. Second retried delivery (e.g. from network retry)
      const secondResult = await processWebhookWithIdempotency({
        tenantId,
        provider,
        eventId,
        eventType,
        execute: ledgerAction,
      });

      expect(secondResult.executed).toBe(false);
      expect(secondResult.httpStatus).toBe(200);
      expect(secondResult.message).toContain('previously completed');
      expect(executionCount).toBe(1); // Action was NOT re-executed!

      // 3. Third retried delivery
      const thirdResult = await processWebhookWithIdempotency({
        tenantId,
        provider,
        eventId,
        eventType,
        execute: ledgerAction,
      });

      expect(thirdResult.executed).toBe(false);
      expect(thirdResult.httpStatus).toBe(200);
      expect(executionCount).toBe(1);
    });
  });

  describe('High Concurrency Race Condition Guard (Step 128.4)', () => {
    it('ensures exactly 1 execution occurs when identical webhook is delivered 5 times concurrently', async () => {
      let executions = 0;
      const concurrentAction = vi.fn().mockImplementation(async () => {
        // Simulate asynchronous processing latency
        await new Promise((resolve) => setTimeout(resolve, 15));
        executions++;
        return { processed: true };
      });

      const concurrentEventId = 'evt_concurrent_spike_999';

      // Simulate 5 simultaneous deliveries
      const promises = Array.from({ length: 5 }, () =>
        processWebhookWithIdempotency({
          tenantId,
          provider: 'rainforest',
          eventId: concurrentEventId,
          eventType: 'merchant.payment.succeeded',
          execute: concurrentAction,
        })
      );

      const results = await Promise.all(promises);

      // Exactly 1 execution must have succeeded and executed the business logic
      expect(executions).toBe(1);

      const executedRuns = results.filter((r) => r.executed);
      expect(executedRuns.length).toBe(1);

      // Other 4 deliveries must have been guarded (HTTP 409 or HTTP 200 cached)
      const nonExecutedRuns = results.filter((r) => !r.executed);
      expect(nonExecutedRuns.length).toBe(4);
    });
  });

  describe('Failure Handling & Retry Recovery', () => {
    it('marks event as failed and allows retry when handler throws', async () => {
      const failingAction = vi.fn().mockRejectedValue(new Error('Downstream database network timeout'));

      await expect(
        processWebhookWithIdempotency({
          tenantId,
          provider,
          eventId: 'evt_failing_001',
          eventType,
          execute: failingAction,
        })
      ).rejects.toThrow('Downstream database network timeout');

      // Next retry attempt should be able to acquire lock again
      const retryLock = await acquireWebhookLock({
        tenantId,
        provider,
        eventId: 'evt_failing_001',
        eventType,
      });

      expect(retryLock.acquired).toBe(true);
      expect(retryLock.status).toBe('processing');
    });
  });

  describe('Provider Isolation', () => {
    it('isolates event IDs across different payment providers', async () => {
      const sharedEventId = 'evt_cross_provider_collision_test';

      // Stripe acquires and completes
      const stripeLock = await acquireWebhookLock({
        tenantId,
        provider: 'stripe_connect',
        eventId: sharedEventId,
        eventType,
      });
      expect(stripeLock.acquired).toBe(true);
      await completeWebhookEvent('stripe_connect', sharedEventId);

      // Airwallex with same eventId must still be able to acquire its own lock independently
      const airwallexLock = await acquireWebhookLock({
        tenantId,
        provider: 'airwallex',
        eventId: sharedEventId,
        eventType,
      });
      expect(airwallexLock.acquired).toBe(true);
      expect(airwallexLock.isAlreadyCompleted).toBe(false);
    });
  });
});
