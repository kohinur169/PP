// path: tests/jobs/runner.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueBackgroundTask,
  runTaskWorkerLoop,
  getDeadLetterQueue,
  getQueuedTasks,
  resetTaskQueue,
} from '@/lib/jobs/runner';
import { resetJobSchedulerStore } from '@/lib/jobs/scheduler';
import {
  verifySanctionsFeedFreshness,
  runInternationalSanctionsRescreeningWorker,
  SanctionsListFeedMetadata,
} from '@/lib/jobs/sanctions-rescreen';
import {
  seedScreenableEntity,
  seedSanctionsBlocklistName,
  resetRescreeningStore,
} from '@/lib/compliance/rescreening-worker';

describe('Distributed Job Queue & Sanctions Rescreening Workers (Phase 19 - Steps 243 & 245)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';

  beforeEach(() => {
    resetTaskQueue();
    resetJobSchedulerStore();
    resetRescreeningStore();
  });

  describe('Step 243: Distributed Background Job Queue Architecture & Task Runner', () => {
    it('enqueues background task and processes successfully', async () => {
      const task = enqueueBackgroundTask({
        tenantId,
        jobName: 'submerchant_provisioning',
        payload: { companyId: 'comp_001', merchantName: 'Tech Services LLC' },
      });

      expect(task.status).toBe('queued');
      expect(task.retryCount).toBe(0);

      const workerResult = await runTaskWorkerLoop(async (item) => {
        return true; // Success
      }, tenantId);

      expect(workerResult.tasksProcessed).toBe(1);
      expect(workerResult.tasksSucceeded).toBe(1);
      expect(workerResult.tasksRetried).toBe(0);
      expect(workerResult.tasksSentToDeadLetter).toBe(0);

      const queued = getQueuedTasks();
      expect(queued[0].status).toBe('completed');
    });

    it('retries failed task with exponential backoff and moves to dead-letter queue when retries exhausted', async () => {
      enqueueBackgroundTask({
        tenantId,
        jobName: 'webhook_dispatch',
        payload: { url: 'https://unreachable.test/hook' },
        maxRetries: 2,
      });

      // First run: Fails (retry 1)
      let workerResult = await runTaskWorkerLoop(async () => {
        throw new Error('Connection refused (ETIMEDOUT)');
      }, tenantId);

      expect(workerResult.tasksRetried).toBe(1);
      expect(workerResult.tasksSentToDeadLetter).toBe(0);

      // Second run: Fails again (retry 2 -> dead letter)
      workerResult = await runTaskWorkerLoop(async () => {
        throw new Error('Connection refused (ETIMEDOUT)');
      }, tenantId);

      expect(workerResult.tasksSentToDeadLetter).toBe(1);

      const deadLetter = getDeadLetterQueue();
      expect(deadLetter).toHaveLength(1);
      expect(deadLetter[0].jobName).toBe('webhook_dispatch');
      expect(deadLetter[0].lastError).toContain('ETIMEDOUT');
    });
  });

  describe('Step 245: Daily Sanctions (OFAC/UN/EU/UK HMT) & PEP Automated Rescreening Worker', () => {
    it('detects stale sanctions feeds older than 24 hours and raises critical warning', () => {
      const staleTime = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(); // 36 hours old
      const freshTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();  // 2 hours old

      const feeds: SanctionsListFeedMetadata[] = [
        { source: 'OFAC_SDN', lastPublishedAt: freshTime, sha256Hash: 'abc', entriesCount: 15000 },
        { source: 'EU_CONSOLIDATED', lastPublishedAt: staleTime, sha256Hash: 'def', entriesCount: 4000 },
      ];

      const freshness = verifySanctionsFeedFreshness(feeds);
      expect(freshness.isStale).toBe(true);
      expect(freshness.warning).toContain('Critical Stale Feed Alert');
      expect(freshness.warning).toContain('EU_CONSOLIDATED');
    });

    it('scans active entities against international sanctions lists and freezes payouts on match', async () => {
      const freshTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const feeds: SanctionsListFeedMetadata[] = [
        { source: 'OFAC_SDN', lastPublishedAt: freshTime, sha256Hash: 'h1', entriesCount: 15000 },
        { source: 'UN_SECURITY_COUNCIL', lastPublishedAt: freshTime, sha256Hash: 'h2', entriesCount: 3000 },
      ];

      // Seed blocklist and entity
      seedSanctionsBlocklistName('Victor Petrov');
      seedScreenableEntity({
        id: 'owner_99',
        tenantId,
        companyId: 'comp_99',
        entityType: 'beneficial_owner',
        fullName: 'Victor Petrov',
        payoutsBlocked: false,
      });

      const summary = await runInternationalSanctionsRescreeningWorker({
        tenantId,
        feeds,
      });

      expect(summary.inspectedEntitiesCount).toBe(1);
      expect(summary.matchesDetectedCount).toBe(1);
      expect(summary.payoutsFrozenCount).toBe(1);
      expect(summary.isFeedStale).toBe(false);
    });
  });
});
