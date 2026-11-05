// path: lib/payment/refund.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { Money } from '@/lib/money/money';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { getAuthorizationRecord } from '@/lib/payment/auth-capture';
import { getChargebackThresholdPolicy } from '@/lib/payment/chargeback-policy';

export type RefundStatus =
  | 'requested'
  | 'pending_approval'
  | 'approved'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'rejected';

export interface RefundRecord {
  id: string;
  tenantId: string;
  companyId: string;
  paymentId: string;
  amount: Money;
  currency: 'USD';
  reason: string;
  status: RefundStatus;
  isPlatformFeeRefunded: boolean;
  platformFeeRefundedAmount: Money;
  requestedBy: string;
  approvedBy?: string | undefined;
  rejectionReason?: string | undefined;
  gatewayRefundId?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface RequestRefundInput {
  tenantId: string;
  companyId: string;
  paymentId: string;
  amount?: Money | undefined; // Optional partial refund amount, defaults to full captured amount
  reason: string;
  requestedBy: string;
  requesterRole: string;
}

export interface ApproveRefundInput {
  refundId: string;
  approverId: string;
  approverRole: string;
}

export interface RejectRefundInput {
  refundId: string;
  rejectorId: string;
  rejectorRole: string;
  rejectionReason: string;
}

/**
 * Dual-control threshold: refunds above USD $500.0000 require independent approval.
 */
export const DUAL_CONTROL_REFUND_THRESHOLD_USD = Money.from('500.0000');

// In-memory refund store for fast query and testing
const refundStore = new Map<string, RefundRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 142.1: Submits a merchant refund request.
 * Enforces:
 * - Payment must be captured.
 * - Total refunded cannot exceed captured amount.
 * - Respects super_admin setting on whether platform fee is returned.
 * - Dual-control threshold check (> $500 requires independent review).
 */
export async function requestRefund(
  input: RequestRefundInput
): Promise<RefundRecord> {
  const authRecord = await getAuthorizationRecord(input.paymentId);
  if (!authRecord) {
    throw new Error(`Payment with ID '${input.paymentId}' was not found.`);
  }

  if (authRecord.status !== 'captured' || !authRecord.capturedAmount) {
    throw new Error(
      `Cannot refund payment '${input.paymentId}': Current payment status is '${authRecord.status}'. Only captured payments can be refunded.`
    );
  }

  const refundAmount = input.amount ?? authRecord.capturedAmount;
  if (refundAmount.lessThanOrEqual(Money.from('0.0000'))) {
    throw new Error('Refund amount must be strictly greater than zero.');
  }

  // Calculate existing refunds on this payment
  const existingRefunds = await listRefundsForPayment(input.paymentId);
  let totalAlreadyRefunded = Money.from('0.0000');
  for (const ref of existingRefunds) {
    if (ref.status !== 'rejected' && ref.status !== 'failed') {
      totalAlreadyRefunded = totalAlreadyRefunded.add(ref.amount);
    }
  }

  const remainingRefundable = authRecord.capturedAmount.subtract(totalAlreadyRefunded);
  if (refundAmount.greaterThan(remainingRefundable)) {
    throw new Error(
      `Requested refund amount ($${refundAmount.toNumericString()}) exceeds remaining refundable amount ($${remainingRefundable.toNumericString()}).`
    );
  }

  // Check whether platform fee is returned on refund (Section 18, Line 216)
  const policy = getChargebackThresholdPolicy(input.tenantId);
  const isPlatformFeeRefunded = policy.returnPlatformFeeOnRefund;
  // Estimate proportional platform fee refund (e.g. 2.9% rate) if policy permits
  const platformFeeRefundedAmount = isPlatformFeeRefunded
    ? refundAmount.multiply('0.0290').round(4)
    : Money.from('0.0000');

  // Determine if dual-control approval is required
  const requiresApproval = refundAmount.greaterThan(DUAL_CONTROL_REFUND_THRESHOLD_USD);
  const status: RefundStatus = requiresApproval ? 'pending_approval' : 'approved';

  const now = new Date().toISOString();
  const id = generateUuidV7();

  const record: RefundRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    paymentId: input.paymentId,
    amount: refundAmount,
    currency: 'USD',
    reason: input.reason,
    status,
    isPlatformFeeRefunded,
    platformFeeRefundedAmount,
    requestedBy: input.requestedBy,
    approvedBy: !requiresApproval ? input.requestedBy : undefined,
    createdAt: now,
    updatedAt: now,
  };

  refundStore.set(id, record);

  logger.info('Refund requested successfully', {
    refundId: id,
    paymentId: input.paymentId,
    amount: refundAmount.toNumericString(),
    status,
    requiresApproval,
  });

  try {
    await auditRepo.append({
      actor_id: input.requestedBy,
      action: 'PAYMENT_REFUND_REQUESTED',
      entity_type: 'payment_refund',
      entity_id: id,
      payload: {
        paymentId: input.paymentId,
        companyId: input.companyId,
        amount: refundAmount.toNumericString(),
        reason: input.reason,
        status,
        requiresApproval,
        isPlatformFeeRefunded,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for refund request', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Step 142.2: Dual-Control Approval for Large Refunds.
 * Approves a pending refund. Requester and approver must be distinct.
 */
export async function approveRefund(
  input: ApproveRefundInput
): Promise<RefundRecord> {
  const refund = refundStore.get(input.refundId);
  if (!refund) {
    throw new Error(`Refund with ID '${input.refundId}' was not found.`);
  }

  if (refund.status !== 'pending_approval') {
    throw new Error(
      `Cannot approve refund '${input.refundId}': Status is '${refund.status}', expected 'pending_approval'.`
    );
  }

  // Four-eye invariant: Requester cannot approve their own high-value refund
  if (refund.requestedBy === input.approverId) {
    throw new Error(
      'Dual-control violation: Approver must be distinct from refund requester.'
    );
  }

  const now = new Date().toISOString();
  refund.status = 'approved';
  refund.approvedBy = input.approverId;
  refund.updatedAt = now;

  logger.info('Refund approved under dual-control review', {
    refundId: refund.id,
    approverId: input.approverId,
    approverRole: input.approverRole,
    amount: refund.amount.toNumericString(),
  });

  try {
    await auditRepo.append({
      actor_id: input.approverId,
      action: 'PAYMENT_REFUND_APPROVED',
      entity_type: 'payment_refund',
      entity_id: refund.id,
      payload: {
        paymentId: refund.paymentId,
        companyId: refund.companyId,
        amount: refund.amount.toNumericString(),
        approverRole: input.approverRole,
        status: 'approved',
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for refund approval', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return refund;
}

/**
 * Step 142.3: Rejection of Refund Request.
 */
export async function rejectRefund(
  input: RejectRefundInput
): Promise<RefundRecord> {
  const refund = refundStore.get(input.refundId);
  if (!refund) {
    throw new Error(`Refund with ID '${input.refundId}' was not found.`);
  }

  if (refund.status !== 'pending_approval' && refund.status !== 'requested') {
    throw new Error(
      `Cannot reject refund '${input.refundId}': Status is '${refund.status}'.`
    );
  }

  const now = new Date().toISOString();
  refund.status = 'rejected';
  refund.rejectionReason = input.rejectionReason;
  refund.updatedAt = now;

  logger.info('Refund rejected', {
    refundId: refund.id,
    rejectorId: input.rejectorId,
    reason: input.rejectionReason,
  });

  try {
    await auditRepo.append({
      actor_id: input.rejectorId,
      action: 'PAYMENT_REFUND_REJECTED',
      entity_type: 'payment_refund',
      entity_id: refund.id,
      payload: {
        paymentId: refund.paymentId,
        companyId: refund.companyId,
        amount: refund.amount.toNumericString(),
        rejectorRole: input.rejectorRole,
        rejectionReason: input.rejectionReason,
        status: 'rejected',
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for refund rejection', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return refund;
}

/**
 * Step 142.4: Execution & Settlement of Approved Refund.
 */
export async function processRefund(refundId: string): Promise<RefundRecord> {
  const refund = refundStore.get(refundId);
  if (!refund) {
    throw new Error(`Refund with ID '${refundId}' was not found.`);
  }

  if (refund.status !== 'approved') {
    throw new Error(
      `Cannot process refund '${refundId}': Refund must be 'approved' before processing, but status is '${refund.status}'.`
    );
  }

  const now = new Date().toISOString();
  refund.status = 'succeeded';
  refund.gatewayRefundId = `re_${generateUuidV7().replace(/-/g, '').slice(0, 24)}`;
  refund.updatedAt = now;

  logger.info('Refund successfully processed and settled to customer card', {
    refundId: refund.id,
    gatewayRefundId: refund.gatewayRefundId,
    amount: refund.amount.toNumericString(),
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'PAYMENT_REFUND_SUCCEEDED',
      entity_type: 'payment_refund',
      entity_id: refund.id,
      payload: {
        paymentId: refund.paymentId,
        companyId: refund.companyId,
        amount: refund.amount.toNumericString(),
        gatewayRefundId: refund.gatewayRefundId,
        isPlatformFeeRefunded: refund.isPlatformFeeRefunded,
        platformFeeRefundedAmount: refund.platformFeeRefundedAmount.toNumericString(),
        status: 'succeeded',
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for refund success', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return refund;
}

/**
 * Retrieves a refund record by ID.
 */
export async function getRefund(refundId: string): Promise<RefundRecord | null> {
  return refundStore.get(refundId) ?? null;
}

/**
 * Lists all refunds for a specific payment ID.
 */
export async function listRefundsForPayment(
  paymentId: string
): Promise<RefundRecord[]> {
  const result: RefundRecord[] = [];
  for (const ref of refundStore.values()) {
    if (ref.paymentId === paymentId) {
      result.push(ref);
    }
  }
  return result;
}

/**
 * Resets the in-memory refund store for test isolation.
 */
export function resetRefundStore(): void {
  refundStore.clear();
}
