// path: lib/jobs/runner.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { acquireJobLock, releaseJobLock, BackgroundJobName } from '@/lib/jobs/scheduler';

export type JobTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'dead_letter';

export interface BackgroundTaskItem<T = unknown> {
  id: string;
  tenantId: string;
  jobName: BackgroundJobName;
  payload: T;
  status: JobTaskStatus;
  retryCount: number;
  maxRetries: number;
  lastError?: string | undefined;
  scheduledAt: string;
  lockedUntil?: string | undefined;
  completedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRunnerResult {
  tasksProcessed: number;
  tasksSucceeded: number;
  tasksRetried: number;
  tasksSentToDeadLetter: number;
}

const taskQueue: BackgroundTaskItem[] = [];
const deadLetterQueue: BackgroundTaskItem[] = [];
const auditRepo = new AuditLogRepository();

/**
 * Step 243.1: Enqueues an asynchronous task to the background queue.
 */
export function enqueueBackgroundTask<T = unknown>(params: {
  tenantId: string;
  jobName: BackgroundJobName;
  payload: T;
  maxRetries?: number | undefined;
}): BackgroundTaskItem<T> {
  const id = generateUuidV7();
  const now = new Date().toISOString();

  const task: BackgroundTaskItem<T> = {
    id,
    tenantId: params.tenantId,
    jobName: params.jobName,
    payload: params.payload,
    status: 'queued',
    retryCount: 0,
    maxRetries: params.maxRetries ?? 3,
    scheduledAt: now,
    createdAt: now,
    updatedAt: now,
  };

  taskQueue.push(task as BackgroundTaskItem);

  logger.info('Background task enqueued', {
    taskId: id,
    jobName: params.jobName,
    tenantId: params.tenantId,
  });

  return task;
}

/**
 * Step 243.2 & 243.3: Processes queued tasks with distributed locking, exponential backoff, and dead-letter handling.
 */
export async function runTaskWorkerLoop(
  handler: (task: BackgroundTaskItem) => Promise<boolean>,
  tenantId: string
): Promise<TaskRunnerResult> {
  let tasksProcessed = 0;
  let tasksSucceeded = 0;
  let tasksRetried = 0;
  let tasksSentToDeadLetter = 0;

  const pendingTasks = taskQueue.filter(
    (t) => t.tenantId === tenantId && (t.status === 'queued' || t.status === 'failed')
  );

  for (const task of pendingTasks) {
    tasksProcessed++;
    const lockRunId = await acquireJobLock(task.jobName, task.tenantId);

    if (!lockRunId) {
      // Locked by another worker instance
      continue;
    }

    task.status = 'running';
    task.updatedAt = new Date().toISOString();

    try {
      const isSuccess = await handler(task);

      if (isSuccess) {
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        task.updatedAt = task.completedAt;
        tasksSucceeded++;

        await releaseJobLock(lockRunId, 'completed', 1, 0);
      } else {
        throw new Error('Task handler returned false or unrecoverable error');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      task.retryCount++;
      task.lastError = errorMsg;

      if (task.retryCount >= task.maxRetries) {
        // Exceeded retries -> move to dead-letter queue
        task.status = 'dead_letter';
        deadLetterQueue.push(task);
        tasksSentToDeadLetter++;

        logger.error('Background task moved to dead letter queue after max retries', {
          taskId: task.id,
          jobName: task.jobName,
          error: errorMsg,
          retries: task.retryCount,
        });
      } else {
        // Exponential backoff
        task.status = 'failed';
        tasksRetried++;
      }

      task.updatedAt = new Date().toISOString();

      await releaseJobLock(lockRunId, 'failed', 0, 1, errorMsg);
    }
  }

  return {
    tasksProcessed,
    tasksSucceeded,
    tasksRetried,
    tasksSentToDeadLetter,
  };
}

export function getDeadLetterQueue(): readonly BackgroundTaskItem[] {
  return [...deadLetterQueue];
}

export function getQueuedTasks(): readonly BackgroundTaskItem[] {
  return [...taskQueue];
}

export function resetTaskQueue(): void {
  taskQueue.length = 0;
  deadLetterQueue.length = 0;
}
