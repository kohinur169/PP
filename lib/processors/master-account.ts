// path: lib/processors/master-account.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import type { PaymentProcessorSlug } from '@/types/processors';
import { getDecryptedGatewaySecret } from '@/lib/processors/credentials';

export type MasterAccountStatus =
  | 'configured'
  | 'missing_credentials'
  | 'connection_failed';

export type ProvisioningJobStatus =
  | 'active'
  | 'queued_missing_master_credentials'
  | 'failed'
  | 'retry_pending';

export interface MasterAccountVerificationResult {
  isConfigured: boolean;
  status: MasterAccountStatus;
  providerSlug: PaymentProcessorSlug;
  missingKey?: string | undefined;
}

export interface ProvisioningJob {
  id: string;
  tenantId: string;
  companyId: string;
  companyLegalName: string;
  providerSlug: PaymentProcessorSlug;
  status: ProvisioningJobStatus;
  errorMessage?: string | undefined;
  queuedAt: string;
  retriedAt?: string | undefined;
  completedAt?: string | undefined;
  retryCount: number;
  metadata: Record<string, unknown>;
}

export interface QueueProvisioningParams {
  tenantId: string;
  companyId: string;
  companyLegalName: string;
  providerSlug: PaymentProcessorSlug;
  environment?: 'sandbox' | 'production' | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface DispatchedMissingKeyAlert {
  id: string;
  providerSlug: PaymentProcessorSlug;
  companyId: string;
  companyLegalName: string;
  recipientRoles: ('SUPER_ADMIN' | 'CEO')[];
  subject: string;
  message: string;
  actionUrl: string;
  timestamp: string;
}

export interface ProvisioningRetryResult {
  providerSlug: PaymentProcessorSlug;
  totalQueuedFound: number;
  successfullyRetriedCount: number;
  retriedJobs: ProvisioningJob[];
}

// In-memory queue and alert storage for runtime and unit test isolation
const provisioningJobQueue = new Map<string, ProvisioningJob>();
const missingKeyAlertsLog: DispatchedMissingKeyAlert[] = [];

/**
 * Expected credential type per payment processor adapter.
 */
function getExpectedCredentialType(providerSlug: PaymentProcessorSlug): string {
  switch (providerSlug) {
    case 'stripe_connect':
      return 'api_secret_key';
    case 'nmi':
      return 'security_key';
    case 'rainforest':
      return 'api_key';
    case 'airwallex':
      return 'api_key';
    case 'payoneer':
      return 'program_token';
  }
}

/**
 * Verifies whether master platform gateway credentials are configured and active
 * before sub-merchant provisioning can proceed (Step 125.1).
 */
export async function verifyMasterAccountConfigured(
  tenantId: string,
  providerSlug: PaymentProcessorSlug,
  environment: 'sandbox' | 'production' = 'sandbox'
): Promise<MasterAccountVerificationResult> {
  const credentialType = getExpectedCredentialType(providerSlug);

  try {
    const secret = await getDecryptedGatewaySecret({
      tenantId,
      providerSlug,
      credentialType,
      environment,
    });

    if (!secret || secret.trim().length === 0) {
      return {
        isConfigured: false,
        status: 'missing_credentials',
        providerSlug,
        missingKey: `Master platform ${providerSlug} ${credentialType} is not configured`,
      };
    }

    return {
      isConfigured: true,
      status: 'configured',
      providerSlug,
    };
  } catch (err: unknown) {
    logger.warn('Failed reading master gateway credentials during verification', {
      providerSlug,
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      isConfigured: false,
      status: 'missing_credentials',
      providerSlug,
      missingKey: `Master platform ${providerSlug} credentials could not be decrypted or found`,
    };
  }
}

/**
 * Dispatches urgent notification to Super Admin and CEO requesting master gateway
 * credential configuration (Step 125.3).
 */
export function dispatchMissingMasterKeyAlert(
  job: ProvisioningJob
): DispatchedMissingKeyAlert {
  const alert: DispatchedMissingKeyAlert = {
    id: generateUuidV7(),
    providerSlug: job.providerSlug,
    companyId: job.companyId,
    companyLegalName: job.companyLegalName,
    recipientRoles: ['SUPER_ADMIN', 'CEO'],
    subject: `URGENT ACTION REQUIRED: Configure Master Gateway Credentials for ${job.providerSlug.toUpperCase()}`,
    message: `Sub-merchant provisioning for company "${job.companyLegalName}" (${job.companyId}) was queued because master platform credentials for gateway ${job.providerSlug.toUpperCase()} are missing. Please configure credentials at /super-admin/gateways immediately.`,
    actionUrl: '/super-admin/gateways',
    timestamp: new Date().toISOString(),
  };

  missingKeyAlertsLog.push(alert);

  logger.warn('URGENT: Dispatched missing master gateway credentials alert to Super Admin & CEO', {
    companyId: job.companyId,
    providerSlug: job.providerSlug,
    alertId: alert.id,
  });

  return alert;
}

/**
 * Enqueues or completes sub-merchant account provisioning for a merchant (Step 125.2).
 * If master platform gateway keys are missing, pauses provisioning in 'queued_missing_master_credentials'
 * state and dispatches urgent alerts.
 */
export async function queueSubMerchantProvisioning(
  params: QueueProvisioningParams
): Promise<ProvisioningJob> {
  const jobId = generateUuidV7();
  const now = new Date().toISOString();
  const env = params.environment ?? 'sandbox';

  const verification = await verifyMasterAccountConfigured(params.tenantId, params.providerSlug, env);

  if (!verification.isConfigured) {
    const queuedJob: ProvisioningJob = {
      id: jobId,
      tenantId: params.tenantId,
      companyId: params.companyId,
      companyLegalName: params.companyLegalName,
      providerSlug: params.providerSlug,
      status: 'queued_missing_master_credentials',
      errorMessage: verification.missingKey ?? `Missing master platform ${params.providerSlug} credentials`,
      queuedAt: now,
      retryCount: 0,
      metadata: params.metadata ?? {},
    };

    provisioningJobQueue.set(jobId, queuedJob);
    dispatchMissingMasterKeyAlert(queuedJob);

    logger.warn('Sub-merchant provisioning queued: master platform gateway credentials missing', {
      companyId: params.companyId,
      providerSlug: params.providerSlug,
      jobId,
    });

    return queuedJob;
  }

  // Master gateway keys are present: activate provisioning directly
  const activeJob: ProvisioningJob = {
    id: jobId,
    tenantId: params.tenantId,
    companyId: params.companyId,
    companyLegalName: params.companyLegalName,
    providerSlug: params.providerSlug,
    status: 'active',
    queuedAt: now,
    completedAt: now,
    retryCount: 0,
    metadata: params.metadata ?? {},
  };

  provisioningJobQueue.set(jobId, activeJob);

  logger.info('Sub-merchant provisioning activated immediately; master gateway credentials verified', {
    companyId: params.companyId,
    providerSlug: params.providerSlug,
    jobId,
  });

  return activeJob;
}

/**
 * Retries queued sub-merchant provisioning jobs once master gateway credentials are saved (Step 125.4).
 */
export async function retryQueuedProvisioningJobs(
  tenantId: string,
  providerSlug: PaymentProcessorSlug,
  environment: 'sandbox' | 'production' = 'sandbox'
): Promise<ProvisioningRetryResult> {
  const verification = await verifyMasterAccountConfigured(tenantId, providerSlug, environment);

  if (!verification.isConfigured) {
    throw new Error(
      `Cannot retry provisioning for ${providerSlug}: Master gateway credentials are still missing.`
    );
  }

  const retriedJobs: ProvisioningJob[] = [];
  const now = new Date().toISOString();

  for (const [jobId, job] of provisioningJobQueue.entries()) {
    if (
      job.tenantId === tenantId &&
      job.providerSlug === providerSlug &&
      job.status === 'queued_missing_master_credentials'
    ) {
      const updatedJob: ProvisioningJob = {
        ...job,
        status: 'active',
        errorMessage: undefined,
        retriedAt: now,
        completedAt: now,
        retryCount: job.retryCount + 1,
      };

      provisioningJobQueue.set(jobId, updatedJob);
      retriedJobs.push(updatedJob);

      logger.info('Successfully retried and activated queued sub-merchant provisioning job', {
        companyId: job.companyId,
        providerSlug,
        jobId,
        retryCount: updatedJob.retryCount,
      });
    }
  }

  return {
    providerSlug,
    totalQueuedFound: retriedJobs.length,
    successfullyRetriedCount: retriedJobs.length,
    retriedJobs,
  };
}

/**
 * Returns dispatched alerts (for assertions and office dashboards).
 */
export function getDispatchedMissingKeyAlerts(): readonly DispatchedMissingKeyAlert[] {
  return [...missingKeyAlertsLog];
}

/**
 * Clears dispatched alerts for test isolation.
 */
export function clearMissingKeyAlerts(): void {
  missingKeyAlertsLog.length = 0;
}

/**
 * Retrieves queued provisioning jobs.
 */
export function getQueuedProvisioningJobs(
  providerSlug?: PaymentProcessorSlug
): readonly ProvisioningJob[] {
  const allJobs = Array.from(provisioningJobQueue.values());
  if (providerSlug) {
    return allJobs.filter((j) => j.providerSlug === providerSlug);
  }
  return allJobs;
}

/**
 * Clears provisioning job queue for test isolation.
 */
export function clearQueuedProvisioningJobs(): void {
  provisioningJobQueue.clear();
}
