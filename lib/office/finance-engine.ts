// path: lib/office/finance-engine.ts

import crypto from 'node:crypto';
import { z } from 'zod';
import { Role, Permission, assertPermission } from '@/lib/auth/roles';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

/**
 * 72-Hour SLA in milliseconds for resolving reconciliation discrepancies.
 */
export const RECONCILIATION_SLA_HOURS = 72;
export const RECONCILIATION_SLA_MS = RECONCILIATION_SLA_HOURS * 60 * 60 * 1000;

export type SupportedProcessor =
  | 'nmi'
  | 'payoneer'
  | 'rainforest'
  | 'stripe_connect'
  | 'airwallex';

/**
 * Reconciliation discrepancy item between internal double-entry ledger and processor settlement reports.
 */
export interface ReconciliationMismatch {
  readonly id: string;
  readonly batchId: string;
  readonly processor: SupportedProcessor;
  readonly detectedAt: string;
  readonly slaDeadline: string;
  readonly expectedLedgerAmountUsd: number;
  readonly actualProcessorAmountUsd: number;
  readonly discrepancyUsd: number;
  status: 'pending_resolution' | 'investigating' | 'resolved';
  resolutionType?: 'ADJUSTMENT_POSTED' | 'PROCESSOR_REVERSED' | 'TIMING_DIFFERENCE' | undefined;
  resolutionNotes?: string | undefined;
  resolvedBy?: string | undefined;
  resolvedAt?: string | undefined;
}

/**
 * Failed payout incident item requiring finance operations resolution.
 */
export interface FailedPayoutItem {
  readonly id: string;
  readonly payoutId: string;
  readonly companyId: string;
  readonly merchantName: string;
  readonly amountUsd: number;
  readonly bankAccountMasked: string;
  readonly bankRouting: string;
  readonly failureCode:
    | 'R01_INSUFFICIENT_FUNDS'
    | 'R02_ACCOUNT_CLOSED'
    | 'R03_NO_ACCOUNT'
    | 'R04_INVALID_ACCOUNT_NUMBER'
    | 'WIRE_ROUTING_INVALID';
  readonly failureReason: string;
  readonly attemptedAt: string;
  status: 'pending_investigation' | 'held_for_update' | 'retried' | 'returned_to_ledger';
  resolvedBy?: string | undefined;
  resolvedAt?: string | undefined;
  resolutionAction?:
    | 'RETRY_DISBURSEMENT'
    | 'HOLD_FOR_MERCHANT_BANK_UPDATE'
    | 'RETURN_TO_MERCHANT_BALANCE'
    | undefined;
  resolutionNotes?: string | undefined;
}

/**
 * Monthly invoice verification record from payment gateway processors.
 */
export interface ProcessorBillItem {
  readonly id: string;
  readonly invoiceNumber: string;
  readonly processor: SupportedProcessor;
  readonly billingMonth: string;
  readonly billedAmountUsd: number;
  readonly calculatedFeeUsd: number;
  readonly varianceUsd: number;
  status: 'matched' | 'variance_disputed' | 'under_review';
  reviewedBy?: string | undefined;
  reviewedAt?: string | undefined;
  notes?: string | undefined;
}

// In-memory operational stores for finance workflows
const reconciliationRegistry = new Map<string, ReconciliationMismatch>();
const failedPayoutRegistry = new Map<string, FailedPayoutItem>();
const processorBillRegistry = new Map<string, ProcessorBillItem>();

/**
 * Resets stores for test isolation.
 */
export function resetFinanceDataForTest(): void {
  reconciliationRegistry.clear();
  failedPayoutRegistry.clear();
  processorBillRegistry.clear();
}

/**
 * Seeds a reconciliation mismatch into the registry.
 */
export function seedReconciliationMismatchForTest(item: ReconciliationMismatch): void {
  reconciliationRegistry.set(item.id, { ...item });
}

/**
 * Seeds a failed payout into the registry.
 */
export function seedFailedPayoutForTest(item: FailedPayoutItem): void {
  failedPayoutRegistry.set(item.id, { ...item });
}

/**
 * Seeds a processor bill item into the registry.
 */
export function seedProcessorBillForTest(item: ProcessorBillItem): void {
  processorBillRegistry.set(item.id, { ...item });
}

/**
 * Computes remaining SLA hours and countdown state for a reconciliation mismatch.
 */
export function calculateRemainingSla(
  detectedAtIso: string,
  nowMs: number = Date.now()
): { remainingHours: number; remainingMinutes: number; isBreached: boolean } {
  const detectedMs = new Date(detectedAtIso).getTime();
  const deadlineMs = detectedMs + RECONCILIATION_SLA_MS;
  const remainingMs = deadlineMs - nowMs;

  if (remainingMs <= 0) {
    return {
      remainingHours: 0,
      remainingMinutes: 0,
      isBreached: true,
    };
  }

  const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
  const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  return {
    remainingHours,
    remainingMinutes,
    isBreached: false,
  };
}

/**
 * Step 069.2: Lists all reconciliation mismatches with 72-hour SLA tracking.
 */
export async function listReconciliationMismatches(
  actorRole: Role
): Promise<ReconciliationMismatch[]> {
  assertPermission(actorRole, Permission.MANAGE_RECONCILIATION);
  return Array.from(reconciliationRegistry.values());
}

/**
 * Step 069.2: Resolves a reconciliation mismatch with formal classification and audit log.
 */
export async function resolveReconciliationMismatch(params: {
  readonly mismatchId: string;
  readonly resolutionType: 'ADJUSTMENT_POSTED' | 'PROCESSOR_REVERSED' | 'TIMING_DIFFERENCE';
  readonly resolutionNotes: string;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<ReconciliationMismatch> {
  const { mismatchId, resolutionType, resolutionNotes, actorId, actorRole, auditRepo } = params;

  assertPermission(actorRole, Permission.RESOLVE_RECONCILIATION_MISMATCH);

  const item = reconciliationRegistry.get(mismatchId);
  if (!item) {
    throw new Error(`Reconciliation mismatch "${mismatchId}" not found.`);
  }

  if (item.status === 'resolved') {
    throw new Error(`Reconciliation mismatch "${mismatchId}" has already been resolved.`);
  }

  const resolvedAt = new Date().toISOString();
  item.status = 'resolved';
  item.resolutionType = resolutionType;
  item.resolutionNotes = resolutionNotes;
  item.resolvedBy = actorId;
  item.resolvedAt = resolvedAt;

  reconciliationRegistry.set(mismatchId, item);

  logger.info('Reconciliation mismatch resolved by finance operator', {
    mismatchId,
    batchId: item.batchId,
    resolutionType,
    discrepancyUsd: item.discrepancyUsd,
    actorId,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: '00000000-0000-7000-8000-000000000000',
      actor_id: actorId,
      action: 'LEDGER_TRANSACTION_RECORDED',
      entity_type: 'reconciliation_batch',
      entity_id: item.batchId,
      payload: {
        mismatchId,
        resolutionType,
        resolutionNotes,
        discrepancyUsd: item.discrepancyUsd,
        processor: item.processor,
      },
    });
  }

  return { ...item };
}

/**
 * Step 069.3: Lists failed payouts requiring bank investigation or retry.
 */
export async function listFailedPayouts(actorRole: Role): Promise<FailedPayoutItem[]> {
  assertPermission(actorRole, Permission.HANDLE_FAILED_PAYOUTS);
  return Array.from(failedPayoutRegistry.values());
}

/**
 * Step 069.3: Resolves a failed payout by retrying, holding for merchant bank update,
 * or returning funds to sub-merchant operating balance.
 */
export async function resolveFailedPayout(params: {
  readonly failedPayoutId: string;
  readonly action:
    | 'RETRY_DISBURSEMENT'
    | 'HOLD_FOR_MERCHANT_BANK_UPDATE'
    | 'RETURN_TO_MERCHANT_BALANCE';
  readonly notes: string;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<FailedPayoutItem> {
  const { failedPayoutId, action, notes, actorId, actorRole, auditRepo } = params;

  assertPermission(actorRole, Permission.HANDLE_FAILED_PAYOUTS);

  const item = failedPayoutRegistry.get(failedPayoutId);
  if (!item) {
    throw new Error(`Failed payout incident "${failedPayoutId}" not found.`);
  }

  const resolvedAt = new Date().toISOString();
  item.status =
    action === 'RETRY_DISBURSEMENT'
      ? 'retried'
      : action === 'HOLD_FOR_MERCHANT_BANK_UPDATE'
      ? 'held_for_update'
      : 'returned_to_ledger';

  item.resolutionAction = action;
  item.resolutionNotes = notes;
  item.resolvedBy = actorId;
  item.resolvedAt = resolvedAt;

  failedPayoutRegistry.set(failedPayoutId, item);

  logger.info('Failed payout incident resolved by finance operator', {
    failedPayoutId,
    payoutId: item.payoutId,
    companyId: item.companyId,
    action,
    amountUsd: item.amountUsd,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: item.companyId,
      actor_id: actorId,
      action: 'PAYOUT_REQUESTED',
      entity_type: 'payout_disbursement',
      entity_id: item.payoutId,
      payload: {
        failedPayoutId,
        action,
        notes,
        amountUsd: item.amountUsd,
      },
    });
  }

  return { ...item };
}

/**
 * Step 069.4: Lists monthly processor bills across all 5 payment gateways.
 */
export async function listProcessorBills(actorRole: Role): Promise<ProcessorBillItem[]> {
  assertPermission(actorRole, Permission.MATCH_PROCESSOR_BILLS);
  return Array.from(processorBillRegistry.values());
}

/**
 * Step 069.4: Verifies or disputes processor monthly invoice fees against internal calculations.
 */
export async function verifyProcessorBill(params: {
  readonly billId: string;
  readonly decision: 'matched' | 'variance_disputed';
  readonly notes: string;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<ProcessorBillItem> {
  const { billId, decision, notes, actorId, actorRole, auditRepo } = params;

  assertPermission(actorRole, Permission.MATCH_PROCESSOR_BILLS);

  const item = processorBillRegistry.get(billId);
  if (!item) {
    throw new Error(`Processor bill "${billId}" not found.`);
  }

  const reviewedAt = new Date().toISOString();
  item.status = decision;
  item.notes = notes;
  item.reviewedBy = actorId;
  item.reviewedAt = reviewedAt;

  processorBillRegistry.set(billId, item);

  logger.info('Processor monthly bill reviewed by finance operator', {
    billId,
    invoiceNumber: item.invoiceNumber,
    processor: item.processor,
    decision,
    varianceUsd: item.varianceUsd,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: '00000000-0000-7000-8000-000000000000',
      actor_id: actorId,
      action: 'SETTLEMENT_BATCH_GENERATED',
      entity_type: 'processor_monthly_bill',
      entity_id: item.invoiceNumber,
      payload: {
        billId,
        processor: item.processor,
        decision,
        billedAmountUsd: item.billedAmountUsd,
        calculatedFeeUsd: item.calculatedFeeUsd,
        varianceUsd: item.varianceUsd,
        notes,
      },
    });
  }

  return { ...item };
}
