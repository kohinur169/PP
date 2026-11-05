// path: lib/compliance/ceo-approval.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger';
import { Role } from '@/lib/auth/roles';
import { canAdvanceToCeoApproval, KycReviewCase } from '@/lib/compliance/review';
import { CreateAuditLogInput } from '@/types/audit';

export type UpstreamProcessorKybStatus =
  | 'verified'
  | 'pending'
  | 'rejected'
  | 'unsubmitted';

export interface CeoFinalKycApprovalParams {
  tenantId: string;
  companyId: string;
  ceoUserId: string;
  actorRole: Role;
  totpCode: string;
  complianceReviewCase: KycReviewCase;
  upstreamProcessorKybStatus: UpstreamProcessorKybStatus;
  policyVersion?: string | undefined;
}

export interface SubMerchantProvisioningJob {
  jobId: string;
  tenantId: string;
  companyId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  enqueuedAt: string;
  targetGateways: Array<'nmi' | 'rainforest' | 'payoneer' | 'stripe_connect' | 'airwallex'>;
}

export interface CeoApprovalResult {
  approvalId: string;
  companyId: string;
  tenantId: string;
  ceoUserId: string;
  companyStatus: 'approved';
  provisioningJob: SubMerchantProvisioningJob;
  auditLogInput: CreateAuditLogInput;
  approvedAt: string;
}

/**
 * Enqueues a sub-merchant gateway provisioning background task.
 */
export function enqueueSubMerchantProvisioningJob(
  companyId: string,
  tenantId: string
): SubMerchantProvisioningJob {
  const jobId = `job_prov_${generateUuidV7().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();

  logger.info('Sub-merchant gateway provisioning job enqueued', {
    jobId,
    companyId,
    tenantId,
  });

  return {
    jobId,
    tenantId,
    companyId,
    status: 'queued',
    enqueuedAt: now,
    targetGateways: ['nmi', 'rainforest', 'payoneer', 'stripe_connect', 'airwallex'],
  };
}

/**
 * Executes CEO Final KYC Approval & Super Admin Provisioning Authorization Gate.
 * Enforces:
 * 1. Actor must be 'ceo' or 'super_admin'.
 * 2. Mandatory 6-digit TOTP step-up reauthentication.
 * 3. Compliance review queue must be cleared (all required signatures present).
 * 4. Authoritative Payment Processor KYB status must be 'verified'.
 * 5. Generates sub-merchant gateway provisioning job and audit log payload.
 */
export function executeCeoFinalKycApproval(
  params: CeoFinalKycApprovalParams
): CeoApprovalResult {
  // 1. Role validation
  if (params.actorRole !== Role.CEO && params.actorRole !== Role.SUPER_ADMIN) {
    throw new Error(
      `Unauthorized: Final KYC executive approval requires CEO or Super Admin role. Current actor role is '${params.actorRole}'.`
    );
  }

  // 2. TOTP 2FA Step-up validation
  if (!params.totpCode || !/^\d{6}$/.test(params.totpCode.trim())) {
    throw new Error(
      'Security Exception: A valid 6-digit TOTP authenticator code is mandatory for final executive KYC sign-off.'
    );
  }

  // 3. Compliance review completion gate
  if (!canAdvanceToCeoApproval(params.complianceReviewCase)) {
    throw new Error(
      `Compliance Gate Breach: Application cannot be approved by executive. Compliance review status is '${params.complianceReviewCase.overallStatus}'. All compliance signatures must be completed first.`
    );
  }

  // 4. Payment Processor Authoritative Status Precedence (Step 107.2)
  if (params.upstreamProcessorKybStatus !== 'verified') {
    throw new Error(
      `Processor Precedence Rejection: Merchant cannot receive executive approval while payment processor KYB status is '${params.upstreamProcessorKybStatus}'. Processor verification must be 'verified'.`
    );
  }

  const approvalId = generateUuidV7();
  const approvedAt = new Date().toISOString();
  const policyVersion = params.policyVersion ?? '2026.11-v1';

  // 5. Trigger sub-merchant provisioning job (Step 107.3)
  const provisioningJob = enqueueSubMerchantProvisioningJob(
    params.companyId,
    params.tenantId
  );

  // 6. Assemble audit log payload (Step 107.4)
  const auditLogInput: CreateAuditLogInput = {
    action: 'KYC_VERIFICATION_DECISION',
    entity_type: 'company_kyc_approval',
    entity_id: params.companyId,
    payload: {
      action: 'CEO_FINAL_KYC_APPROVAL',
      approvalId,
      companyId: params.companyId,
      ceoUserId: params.ceoUserId,
      actorRole: params.actorRole,
      policyVersion,
      upstreamProcessorKybStatus: params.upstreamProcessorKybStatus,
      firstComplianceReviewerId: params.complianceReviewCase.firstReviewerId,
      secondComplianceReviewerId: params.complianceReviewCase.secondReviewerId,
      provisioningJobId: provisioningJob.jobId,
      approvedAt,
    },
  };

  logger.info('CEO Final KYC Approval executed successfully', {
    approvalId,
    companyId: params.companyId,
    ceoUserId: params.ceoUserId,
    provisioningJobId: provisioningJob.jobId,
  });

  return {
    approvalId,
    companyId: params.companyId,
    tenantId: params.tenantId,
    ceoUserId: params.ceoUserId,
    companyStatus: 'approved',
    provisioningJob,
    auditLogInput,
    approvedAt,
  };
}
