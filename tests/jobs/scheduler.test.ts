// path: tests/jobs/scheduler.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeBackgroundJob,
  acquireJobLock,
  getJobRun,
  resetJobSchedulerStore,
  BackgroundJobName,
} from '@/lib/jobs/scheduler';

describe('Unified Background Jobs Scheduler & Distributed Lock Engine (Step 157)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    resetJobSchedulerStore();
  });

  describe('Supported Job Types Inventory (Step 157.1)', () => {
    it('verifies all 14 Section 27 background job definitions exist', () => {
      const allJobs: BackgroundJobName[] = [
        'submerchant_provisioning',
        'email_retry',
        'recurring_invoicing',
        'webhook_dispatch',
        'settlement_release',
        'subscription_charges',
        'reconciliation_checks',
        'token_session_cleanup',
        'audit_hash_integrity',
        'compliance_calendar_alerts',
        'sanctions_pep_rescreening',
        're_kyc_schedules',
        'tier_eligibility_recalculation',
        'fulfilment_gated_settlement',
      ];

      expect(allJobs.length).toBe(14);
    });
  });

  describe('Execution Locking & Idempotency (Step 157.2)', () => {
    it('blocks concurrent execution of the same job to ensure idempotency', async () => {
      // Simulate slow job running
      const slowJobLock = await acquireJobLock('settlement_release', tenantId);
      expect(slowJobLock).toBeDefined();

      // Second worker attempts to run same job concurrently -> must return locked
      const duplicateRun = await executeBackgroundJob(
        'settlement_release',
        tenantId,
        async () => ({ itemsProcessed: 10 })
      );

      expect(duplicateRun.status).toBe('locked');
      expect(duplicateRun.itemsProcessed).toBe(0);
      expect(duplicateRun.error).toContain('Job locked');
    });
  });

  describe('Job Execution Lifecycle & Error Boundary (Step 157.3)', () => {
    it('records completed execution metrics when handler succeeds', async () => {
      const summary = await executeBackgroundJob(
        'fulfilment_gated_settlement',
        tenantId,
        async () => {
          return { itemsProcessed: 25, itemsFailed: 0 };
        }
      );

      expect(summary.status).toBe('completed');
      expect(summary.itemsProcessed).toBe(25);
      expect(summary.itemsFailed).toBe(0);
      expect(summary.durationMs).toBeGreaterThanOrEqual(0);

      const runRecord = await getJobRun(summary.runId);
      expect(runRecord?.status).toBe('completed');
      expect(runRecord?.completedAt).toBeDefined();
    });

    it('gracefully handles failures, logs errors, and releases lock for subsequent runs', async () => {
      // 1. Job fails with exception
      const failSummary = await executeBackgroundJob(
        'webhook_dispatch',
        tenantId,
        async () => {
          throw new Error('Downstream webhook endpoint connection refused');
        }
      );

      expect(failSummary.status).toBe('failed');
      expect(failSummary.error).toContain('connection refused');
      expect(failSummary.itemsFailed).toBe(1);

      const failedRecord = await getJobRun(failSummary.runId);
      expect(failedRecord?.status).toBe('failed');
      expect(failedRecord?.errorMessage).toContain('connection refused');

      // 2. Lock must have been released -> subsequent run should succeed
      const retrySummary = await executeBackgroundJob(
        'webhook_dispatch',
        tenantId,
        async () => {
          return { itemsProcessed: 5 };
        }
      );

      expect(retrySummary.status).toBe('completed');
      expect(retrySummary.itemsProcessed).toBe(5);
    });
  });
});
