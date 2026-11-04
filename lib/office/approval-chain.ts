// path: lib/office/approval-chain.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import {
  ApprovalChainStepEntity,
  ApprovalChainWorkflow,
  ChainActionType,
  InitiateChainSchema,
  StepSignOffSchema,
  StepRejectSchema,
} from '@/types/approval-chain';
import { ApprovalChainRepository } from '@/lib/db/approval-chains';
import { AuditLogRepository } from '@/lib/db/audit';
import { Role } from '@/lib/auth/roles';
import { logger } from '@/lib/logger';

const defaultChainRepo = new ApprovalChainRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * In-memory notification log tracking internal alerts and email dispatches.
 */
export interface DispatchedNotification {
  readonly recipientRole: string;
  readonly chainId: string;
  readonly actionType: string;
  readonly subject: string;
  readonly message: string;
  readonly timestamp: string;
}

const notificationQueue: DispatchedNotification[] = [];

/**
 * Retrieves all dispatched internal notifications.
 */
export function getDispatchedNotifications(): readonly DispatchedNotification[] {
  return [...notificationQueue];
}

/**
 * Clears the notification queue (primarily for test resets).
 */
export function clearDispatchedNotifications(): void {
  notificationQueue.length = 0;
}

/**
 * Dispatches internal dashboard notifications and emails to authorized roles.
 */
export function dispatchChainNotification(
  recipientRole: string,
  chainId: string,
  actionType: string,
  stepOrder: number
): void {
  const subject = `Action Required: Step ${stepOrder} Approval Pending for ${actionType}`;
  const message = `A high-risk platform operation (${actionType}) is awaiting review and sign-off by role "${recipientRole}" under chain ${chainId}.`;

  const notification: DispatchedNotification = {
    recipientRole,
    chainId,
    actionType,
    subject,
    message,
    timestamp: new Date().toISOString(),
  };

  notificationQueue.push(notification);

  logger.info('Approval chain notification dispatched', {
    recipientRole,
    chainId,
    actionType,
    stepOrder,
  });
}

/**
 * Parameters for initiating an approval chain.
 */
export interface InitiateChainParams {
  readonly company_id?: string | undefined;
  readonly proposal_id?: string | undefined;
  readonly action_type: ChainActionType | string;
  readonly action_payload: Record<string, unknown>;
  readonly requester_id: string;
  readonly requester_role: string;
  readonly requester_notes?: string | undefined;
  readonly clientIp?: string | undefined;
  readonly userAgent?: string | undefined;
}

/**
 * Assembles the workflow view from sorted steps.
 */
function buildWorkflowView(
  chainId: string,
  steps: ApprovalChainStepEntity[]
): ApprovalChainWorkflow {
  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);
  const currentStep = sorted.find((s) => s.status === 'awaiting_action');
  const rejected = sorted.find((s) => s.status === 'rejected');
  const allApproved = sorted.every((s) => s.status === 'approved');

  let status: 'in_progress' | 'completed' | 'rejected' | 'cancelled' = 'in_progress';
  if (rejected) status = 'rejected';
  else if (allApproved) status = 'completed';

  const first = sorted[0];

  return {
    chainId,
    companyId: first?.company_id ?? '00000000-0000-7000-8000-000000000000',
    proposalId: first?.proposal_id ?? null,
    actionType: first?.action_type ?? 'unknown',
    currentStepOrder: currentStep?.step_order ?? (allApproved ? sorted.length : 1),
    totalSteps: sorted.length,
    status,
    steps: sorted,
    currentStep,
    nextRequiredRole: currentStep?.required_role,
  };
}

/**
 * Step 064.1 & Step 064.2: Initiates a 3-tier sequential approval chain workflow:
 * Step 1: Requester proposes (approved upon initiation)
 * Step 2: CEO reviews and signs off (awaiting_action)
 * Step 3: Super Admin confirms final release (pending)
 */
export async function initiateApprovalChain(
  params: InitiateChainParams,
  options?: {
    readonly chainRepo?: ApprovalChainRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<ApprovalChainWorkflow> {
  const repo = options?.chainRepo ?? defaultChainRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const validated = InitiateChainSchema.parse(params);
  const chainId = generateUuidV7();
  const nowIso = new Date().toISOString();
  const companyId = validated.company_id ?? '00000000-0000-7000-8000-000000000000';

  // Step 1: Requester Initiation (approved automatically by creator)
  const step1 = await repo.create({
    chain_id: chainId,
    company_id: companyId,
    proposal_id: validated.proposal_id ?? null,
    action_type: validated.action_type,
    step_order: 1,
    required_role: validated.requester_role,
    actor_id: validated.requester_id,
    status: 'approved',
    decision_notes: validated.requester_notes ?? 'Initiated by requester',
    action_payload: validated.action_payload,
    decided_at: nowIso,
  });

  // Step 2: CEO Review & Sign-Off (immediately awaiting action)
  const step2 = await repo.create({
    chain_id: chainId,
    company_id: companyId,
    proposal_id: validated.proposal_id ?? null,
    action_type: validated.action_type,
    step_order: 2,
    required_role: Role.CEO,
    actor_id: null,
    status: 'awaiting_action',
    action_payload: validated.action_payload,
  });

  // Step 3: Super Admin Final Release (pending completion of Step 2)
  const step3 = await repo.create({
    chain_id: chainId,
    company_id: companyId,
    proposal_id: validated.proposal_id ?? null,
    action_type: validated.action_type,
    step_order: 3,
    required_role: Role.SUPER_ADMIN,
    actor_id: null,
    status: 'pending',
    action_payload: validated.action_payload,
  });

  // Step 064.3: Dispatch notification to CEO for Step 2
  dispatchChainNotification(Role.CEO, chainId, validated.action_type, 2);

  try {
    await auditRepo.append({
      company_id: companyId,
      action: 'APPROVAL_CHAIN_INITIATED',
      actor_id: validated.requester_id,
      entity_type: 'approval_chains',
      entity_id: chainId,
      payload: {
        actionType: validated.action_type,
        requesterRole: validated.requester_role,
        totalSteps: 3,
        step2RequiredRole: Role.CEO,
        step3RequiredRole: Role.SUPER_ADMIN,
        clientIp: params.clientIp,
        userAgent: params.userAgent,
      },
    });
  } catch (err) {
    logger.warn('Audit record creation for approval chain failed non-fatally', { err });
  }

  return buildWorkflowView(chainId, [step1, step2, step3]);
}

/**
 * Parameters for signing off on an active approval chain step.
 */
export interface AdvanceChainParams {
  readonly chainId: string;
  readonly actorId: string;
  readonly actorRole: string;
  readonly decisionNotes?: string | undefined;
  readonly clientIp?: string | undefined;
  readonly userAgent?: string | undefined;
}

/**
 * Step 064.2: Advances the sequential workflow state machine upon authorized sign-off.
 */
export async function advanceApprovalChain(
  params: AdvanceChainParams,
  options?: {
    readonly chainRepo?: ApprovalChainRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<ApprovalChainWorkflow> {
  const repo = options?.chainRepo ?? defaultChainRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const validated = StepSignOffSchema.parse({
    chain_id: params.chainId,
    actor_id: params.actorId,
    actor_role: params.actorRole,
    decision_notes: params.decisionNotes,
  });

  const steps = await repo.findChainSteps(validated.chain_id);
  if (steps.length === 0) {
    throw new Error(`Approval chain "${validated.chain_id}" was not found.`);
  }

  const activeStep = steps.find((s) => s.status === 'awaiting_action');
  if (!activeStep) {
    throw new Error(
      `Approval chain "${validated.chain_id}" has no active step awaiting action.`
    );
  }

  // Four-Eye Rule: Requester cannot sign off on subsequent steps
  const requesterStep = steps.find((s) => s.step_order === 1);
  if (requesterStep && requesterStep.actor_id === validated.actor_id) {
    throw new Error(
      `Dual-control violation: original requester "${validated.actor_id}" cannot approve subsequent steps in the approval chain.`
    );
  }

  // Role validation: actor must possess the required role for the active step
  if (
    validated.actor_role !== activeStep.required_role &&
    validated.actor_role !== Role.SUPER_ADMIN
  ) {
    throw new Error(
      `Role mismatch: Step ${activeStep.step_order} requires role "${activeStep.required_role}". Provided role was "${validated.actor_role}".`
    );
  }

  const nowIso = new Date().toISOString();

  // Approve active step
  const updatedActive = await repo.update(activeStep.id, activeStep.version, {
    status: 'approved',
    actor_id: validated.actor_id,
    decision_notes: validated.decision_notes ?? `Approved by ${validated.actor_role}`,
    decided_at: nowIso,
  });

  // Advance next step if present
  const nextStep = steps.find((s) => s.step_order === activeStep.step_order + 1);
  let updatedNext: ApprovalChainStepEntity | undefined;

  if (nextStep && nextStep.status === 'pending') {
    updatedNext = await repo.update(nextStep.id, nextStep.version, {
      status: 'awaiting_action',
    });

    // Step 064.3: Dispatch notification to next role in chain (e.g. Super Admin)
    dispatchChainNotification(
      nextStep.required_role,
      validated.chain_id,
      nextStep.action_type,
      nextStep.step_order
    );
  }

  const updatedSteps = steps.map((s) => {
    if (s.id === updatedActive.id) return updatedActive;
    if (updatedNext && s.id === updatedNext.id) return updatedNext;
    return s;
  });

  try {
    await auditRepo.append({
      company_id: activeStep.company_id,
      action: 'APPROVAL_CHAIN_STEP_ADVANCED',
      actor_id: validated.actor_id,
      entity_type: 'approval_chains',
      entity_id: validated.chain_id,
      payload: {
        stepOrder: activeStep.step_order,
        actorRole: validated.actor_role,
        nextStepOrder: nextStep?.step_order ?? null,
        nextRequiredRole: nextStep?.required_role ?? null,
        completed: !nextStep,
        clientIp: params.clientIp,
        userAgent: params.userAgent,
      },
    });
  } catch (err) {
    logger.warn('Audit record creation for approval chain advance failed non-fatally', { err });
  }

  return buildWorkflowView(validated.chain_id, updatedSteps);
}

/**
 * Parameters for rejecting an active approval chain step.
 */
export interface RejectChainParams {
  readonly chainId: string;
  readonly actorId: string;
  readonly actorRole: string;
  readonly rejectionReason: string;
  readonly clientIp?: string | undefined;
  readonly userAgent?: string | undefined;
}

/**
 * Rejects an active approval chain step, cancelling all subsequent steps.
 */
export async function rejectApprovalChain(
  params: RejectChainParams,
  options?: {
    readonly chainRepo?: ApprovalChainRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<ApprovalChainWorkflow> {
  const repo = options?.chainRepo ?? defaultChainRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const validated = StepRejectSchema.parse({
    chain_id: params.chainId,
    actor_id: params.actorId,
    actor_role: params.actorRole,
    rejection_reason: params.rejectionReason,
  });

  const steps = await repo.findChainSteps(validated.chain_id);
  if (steps.length === 0) {
    throw new Error(`Approval chain "${validated.chain_id}" was not found.`);
  }

  const activeStep = steps.find((s) => s.status === 'awaiting_action');
  if (!activeStep) {
    throw new Error(
      `Approval chain "${validated.chain_id}" has no active step awaiting action.`
    );
  }

  const nowIso = new Date().toISOString();

  // Mark active step as rejected
  const updatedActive = await repo.update(activeStep.id, activeStep.version, {
    status: 'rejected',
    actor_id: validated.actor_id,
    decision_notes: validated.rejection_reason,
    decided_at: nowIso,
  });

  // Cancel subsequent steps
  const subsequentSteps = steps.filter((s) => s.step_order > activeStep.step_order);
  const updatedSubsequent: ApprovalChainStepEntity[] = [];

  for (const sub of subsequentSteps) {
    const cancelled = await repo.update(sub.id, sub.version, {
      status: 'cancelled',
      decision_notes: `Cancelled due to Step ${activeStep.step_order} rejection.`,
    });
    updatedSubsequent.push(cancelled);
  }

  const updatedSteps = steps.map((s) => {
    if (s.id === updatedActive.id) return updatedActive;
    const cancelledMatch = updatedSubsequent.find((c) => c.id === s.id);
    if (cancelledMatch) return cancelledMatch;
    return s;
  });

  try {
    await auditRepo.append({
      company_id: activeStep.company_id,
      action: 'APPROVAL_CHAIN_STEP_REJECTED',
      actor_id: validated.actor_id,
      entity_type: 'approval_chains',
      entity_id: validated.chain_id,
      payload: {
        stepOrder: activeStep.step_order,
        actorRole: validated.actor_role,
        rejectionReason: validated.rejection_reason,
        clientIp: params.clientIp,
        userAgent: params.userAgent,
      },
    });
  } catch (err) {
    logger.warn('Audit record creation for approval chain rejection failed non-fatally', { err });
  }

  return buildWorkflowView(validated.chain_id, updatedSteps);
}

/**
 * Retrieves the full workflow view of an approval chain by chain ID.
 */
export async function getApprovalChainWorkflow(
  chainId: string,
  options?: { readonly chainRepo?: ApprovalChainRepository | undefined }
): Promise<ApprovalChainWorkflow> {
  const repo = options?.chainRepo ?? defaultChainRepo;
  const steps = await repo.findChainSteps(chainId);
  return buildWorkflowView(chainId, steps);
}
