// path: lib/compliance/re-kyc.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger';
import { RiskTier } from '@/lib/compliance/underwriting';

export type ReKycTriggerReason =
  | 'periodic_schedule'
  | 'bank_account_changed'
  | 'ubo_ownership_changed'
  | 'volume_spike_3x'
  | 'adverse_media_detected';

export type ReKycStatus =
  | 'scheduled'
  | 'in_progress'
  | 'cleared'
  | 'overdue_restricted';

export interface ReKycScheduleEntity {
  id: string;
  tenantId: string;
  companyId: string;
  triggerReason: ReKycTriggerReason;
  dueDate: string; // YYYY-MM-DD
  status: ReKycStatus;
  payoutsRestricted: boolean;
  offerCreationRestricted: boolean;
  resolvedAt?: string | undefined;
  resolvedByUserId?: string | undefined;
  resolutionNotes?: string | undefined;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ReKycRestrictionEvaluation {
  isRestricted: boolean;
  payoutsRestricted: boolean;
  offerCreationRestricted: boolean;
  restrictionReason?: string | undefined;
}

/**
 * Calculates the next periodic Re-KYC due date based on risk tier:
 * Tier 3: 12 months.
 * Tier 1 & 2: 24 months.
 */
export function calculateNextPeriodicReKycDueDate(params: {
  riskTier: RiskTier;
  baseDate?: Date | undefined;
}): string {
  const base = params.baseDate ?? new Date();
  const monthsToAdd = params.riskTier === 3 ? 12 : 24;

  const due = new Date(base.getTime());
  due.setMonth(due.getMonth() + monthsToAdd);

  return due.toISOString().split('T')[0]!;
}

/**
 * Schedules a standard periodic Re-KYC review for a merchant.
 */
export function schedulePeriodicReKyc(params: {
  tenantId: string;
  companyId: string;
  riskTier: RiskTier;
  baseDate?: Date | undefined;
}): ReKycScheduleEntity {
  const id = generateUuidV7();
  const now = new Date().toISOString();
  const dueDate = calculateNextPeriodicReKycDueDate({
    riskTier: params.riskTier,
    baseDate: params.baseDate,
  });

  logger.info('Periodic Re-KYC scheduled', {
    companyId: params.companyId,
    riskTier: params.riskTier,
    dueDate,
  });

  return {
    id,
    tenantId: params.tenantId,
    companyId: params.companyId,
    triggerReason: 'periodic_schedule',
    dueDate,
    status: 'scheduled',
    payoutsRestricted: false,
    offerCreationRestricted: false,
    metadata: { riskTier: params.riskTier },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Triggers an immediate event-driven Re-KYC review (e.g. payout bank change, UBO change, 3x volume spike).
 * Automatically restricts payouts for bank account changes to prevent fraud / account takeover.
 */
export function triggerEventDrivenReKyc(params: {
  tenantId: string;
  companyId: string;
  triggerReason: ReKycTriggerReason;
  details?: Record<string, unknown> | undefined;
}): ReKycScheduleEntity {
  const id = generateUuidV7();
  const now = new Date();
  const nowIso = now.toISOString();

  // Due immediately or within 5 business days
  const dueDate = now.toISOString().split('T')[0]!;

  // Bank account change immediately freezes payouts pending verification
  const isBankChange = params.triggerReason === 'bank_account_changed';
  const payoutsRestricted = isBankChange;
  const offerCreationRestricted = false;

  logger.warn('Event-driven Re-KYC review triggered', {
    companyId: params.companyId,
    triggerReason: params.triggerReason,
    payoutsRestricted,
  });

  return {
    id,
    tenantId: params.tenantId,
    companyId: params.companyId,
    triggerReason: params.triggerReason,
    dueDate,
    status: 'in_progress',
    payoutsRestricted,
    offerCreationRestricted,
    metadata: params.details ?? {},
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Evaluates whether merchant processing or payouts must be restricted due to overdue Re-KYC.
 * If due date has passed and Re-KYC is not cleared, restricts payouts and offer creation.
 */
export function evaluateReKycComplianceRestrictions(
  schedule: ReKycScheduleEntity,
  asOfDate: Date = new Date()
): ReKycRestrictionEvaluation {
  if (schedule.status === 'cleared') {
    return {
      isRestricted: false,
      payoutsRestricted: false,
      offerCreationRestricted: false,
    };
  }

  // Check if manually/event restricted (e.g. bank account change)
  if (schedule.payoutsRestricted && !schedule.offerCreationRestricted) {
    return {
      isRestricted: true,
      payoutsRestricted: true,
      offerCreationRestricted: false,
      restrictionReason: `Payouts frozen: Pending event-driven Re-KYC review (${schedule.triggerReason.replace(/_/g, ' ')}).`,
    };
  }

  const currentDateString = asOfDate.toISOString().split('T')[0]!;
  const isOverdue = currentDateString > schedule.dueDate;

  if (isOverdue) {
    return {
      isRestricted: true,
      payoutsRestricted: true,
      offerCreationRestricted: true,
      restrictionReason: `Overdue Re-KYC review: Due date (${schedule.dueDate}) elapsed. Payouts and offer creation are restricted under PayFac Compliance Policy LR-C08.`,
    };
  }

  return {
    isRestricted: false,
    payoutsRestricted: false,
    offerCreationRestricted: false,
  };
}

/**
 * Compliance Officer formally clears and resolves a Re-KYC review, lifting all restrictions.
 */
export function resolveReKycSchedule(params: {
  schedule: ReKycScheduleEntity;
  resolvedByUserId: string;
  notes: string;
}): ReKycScheduleEntity {
  if (params.schedule.status === 'cleared') {
    throw new Error('Re-KYC review is already cleared.');
  }

  if (!params.notes || params.notes.trim().length < 10) {
    throw new Error('Re-KYC resolution requires documented notes (minimum 10 characters).');
  }

  const now = new Date().toISOString();

  logger.info('Re-KYC review cleared by compliance', {
    scheduleId: params.schedule.id,
    companyId: params.schedule.companyId,
    resolvedByUserId: params.resolvedByUserId,
  });

  return {
    ...params.schedule,
    status: 'cleared',
    payoutsRestricted: false,
    offerCreationRestricted: false,
    resolvedAt: now,
    resolvedByUserId: params.resolvedByUserId,
    resolutionNotes: params.notes.trim(),
    updatedAt: now,
  };
}
