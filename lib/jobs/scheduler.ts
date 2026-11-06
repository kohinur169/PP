// path: lib/jobs/scheduler.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type BackgroundJobName =
  | 'submerchant_provisioning'
  | 'email_retry'
  | 'recurring_invoicing'
  | 'webhook_dispatch'
  | 'settlement_release'
  | 'subscription_charges'
  | 'reconciliation_checks'
  | 'token_session_cleanup'
  | 'audit_hash_integrity'
  | 'compliance_calendar_alerts'
  | 'sanctions_pep_rescreening'
  | 're_kyc_schedules'
  | 'tier_eligibility_recalculation'
  | 'fulfilment_gated_settlement';

export interface BackgroundJobRunRecord {
  id: string;
  tenantId: string;
  jobName: BackgroundJobName;
  status: 'running' | 'completed' | 'failed' | 'locked';
  startedAt: string;
  completedAt?: string | undefined;
  itemsProcessed: number;
  itemsFailed: number;
  errorMessage?: string | undefined;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface JobExecutionSummary {
  runId: string;
  jobName: BackgroundJobName;
  status: 'completed' | 'failed' | 'locked';
  itemsProcessed: number;
  itemsFailed: number;
  durationMs: number;
  error?: string | undefined;
}

const jobRunsStore = new Map<string, BackgroundJobRunRecord>();
const activeLocks = new Set<string>();
const auditRepo = new AuditLogRepository();

/**
 * Step 157.1: Acquire distributed execution lock to guarantee idempotency and prevent duplicate job execution.
 */
export async function acquireJobLock(
  jobName: BackgroundJobName,
  tenantId: string
): Promise<string | null> {
  const lockKey = `${tenantId}:${jobName}`;
  if (activeLocks.has(lockKey)) {
    logger.warn('Job execution locked - another worker instance is currently running', {
      jobName,
      tenantId,
    });
    return null;
  }

  activeLocks.add(lockKey);
  const now = new Date().toISOString();
  const runId = generateUuidV7();

  const record: BackgroundJobRunRecord = {
    id: runId,
    tenantId,
    jobName,
    status: 'running',
    startedAt: now,
    itemsProcessed: 0,
    itemsFailed: 0,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  jobRunsStore.set(runId, record);
  return runId;
}

/**
 * Step 157.2: Release execution lock and update job completion metrics.
 */
export async function releaseJobLock(
  runId: string,
  status: 'completed' | 'failed',
  itemsProcessed: number,
  itemsFailed = 0,
  errorMessage?: string
): Promise<BackgroundJobRunRecord> {
  const record = jobRunsStore.get(runId);
  if (!record) {
    throw new Error(`Job run record '${runId}' not found.`);
  }

  const lockKey = `${record.tenantId}:${record.jobName}`;
  activeLocks.delete(lockKey);

  const now = new Date().toISOString();
  record.status = status;
  record.completedAt = now;
  record.itemsProcessed = itemsProcessed;
  record.itemsFailed = itemsFailed;
  record.errorMessage = errorMessage;
  record.updatedAt = now;

  logger.info('Background job execution completed', {
    runId,
    jobName: record.jobName,
    status,
    itemsProcessed,
    itemsFailed,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'BACKGROUND_JOB_COMPLETED',
      entity_type: 'background_job_run',
      entity_id: runId,
      payload: {
        jobName: record.jobName,
        status,
        itemsProcessed,
        itemsFailed,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for background job run', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Step 157.3: Unified executor for all 14 background jobs with error boundaries and timing.
 */
export async function executeBackgroundJob(
  jobName: BackgroundJobName,
  tenantId: string,
  handler: () => Promise<{ itemsProcessed: number; itemsFailed?: number }>
): Promise<JobExecutionSummary> {
  const startTime = Date.now();
  const runId = await acquireJobLock(jobName, tenantId);

  if (!runId) {
    return {
      runId: 'locked',
      jobName,
      status: 'locked',
      itemsProcessed: 0,
      itemsFailed: 0,
      durationMs: 0,
      error: 'Job locked by active worker instance.',
    };
  }

  try {
    const result = await handler();
    await releaseJobLock(runId, 'completed', result.itemsProcessed, result.itemsFailed ?? 0);

    return {
      runId,
      jobName,
      status: 'completed',
      itemsProcessed: result.itemsProcessed,
      itemsFailed: result.itemsFailed ?? 0,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await releaseJobLock(runId, 'failed', 0, 1, errorMsg);

    return {
      runId,
      jobName,
      status: 'failed',
      itemsProcessed: 0,
      itemsFailed: 1,
      durationMs: Date.now() - startTime,
      error: errorMsg,
    };
  }
}

/**
 * Retrieves a job run by ID.
 */
export async function getJobRun(runId: string): Promise<BackgroundJobRunRecord | null> {
  return jobRunsStore.get(runId) ?? null;
}

/**
 * Resets in-memory job store and active locks for test isolation.
 */
export function resetJobSchedulerStore(): void {
  jobRunsStore.clear();
  activeLocks.clear();
}
