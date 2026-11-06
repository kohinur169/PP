// path: tests/compliance/re-kyc.test.ts

import { describe, it, expect } from 'vitest';
import {
  calculateNextPeriodicReKycDueDate,
  schedulePeriodicReKyc,
  triggerEventDrivenReKyc,
  evaluateReKycComplianceRestrictions,
  resolveReKycSchedule,
} from '@/lib/compliance/re-kyc';

describe('Step 109: Periodic Re-KYC Scheduling & Event-Triggered Review Engine', () => {
  it('Step 109.1: schedules periodic Re-KYC every 12 months for Tier 3 and 24 months for Tiers 1/2', () => {
    const base = new Date('2026-01-01T00:00:00Z');

    const tier1Due = calculateNextPeriodicReKycDueDate({ riskTier: 1, baseDate: base });
    expect(tier1Due).toBe('2028-01-01'); // 24 months

    const tier2Due = calculateNextPeriodicReKycDueDate({ riskTier: 2, baseDate: base });
    expect(tier2Due).toBe('2028-01-01'); // 24 months

    const tier3Due = calculateNextPeriodicReKycDueDate({ riskTier: 3, baseDate: base });
    expect(tier3Due).toBe('2027-01-01'); // 12 months
  });

  it('Step 109.2: creates periodic schedule with clean initial status and zero restrictions', () => {
    const schedule = schedulePeriodicReKyc({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      riskTier: 1,
    });

    expect(schedule.status).toBe('scheduled');
    expect(schedule.triggerReason).toBe('periodic_schedule');
    expect(schedule.payoutsRestricted).toBe(false);
    expect(schedule.offerCreationRestricted).toBe(false);

    const evalRes = evaluateReKycComplianceRestrictions(schedule);
    expect(evalRes.isRestricted).toBe(false);
  });

  it('Step 109.3: automatically triggers immediate Re-KYC and freezes payouts upon bank account modification', () => {
    const eventSchedule = triggerEventDrivenReKyc({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      triggerReason: 'bank_account_changed',
      details: {
        oldBankName: 'JPMorgan Chase',
        newBankName: 'Wells Fargo',
        newAccountEnding: '9921',
      },
    });

    expect(eventSchedule.status).toBe('in_progress');
    expect(eventSchedule.triggerReason).toBe('bank_account_changed');
    expect(eventSchedule.payoutsRestricted).toBe(true);
    expect(eventSchedule.offerCreationRestricted).toBe(false);

    const evalRes = evaluateReKycComplianceRestrictions(eventSchedule);
    expect(evalRes.isRestricted).toBe(true);
    expect(evalRes.payoutsRestricted).toBe(true);
    expect(evalRes.offerCreationRestricted).toBe(false);
    expect(evalRes.restrictionReason).toContain('Payouts frozen');
  });

  it('Step 109.4: triggers immediate Re-KYC on UBO equity modification and 3x volume spike', () => {
    const uboSchedule = triggerEventDrivenReKyc({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      triggerReason: 'ubo_ownership_changed',
    });
    expect(uboSchedule.triggerReason).toBe('ubo_ownership_changed');

    const spikeSchedule = triggerEventDrivenReKyc({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      triggerReason: 'volume_spike_3x',
    });
    expect(spikeSchedule.triggerReason).toBe('volume_spike_3x');
  });

  it('Step 109.5: restricts payouts and offer creation capabilities when periodic Re-KYC is overdue', () => {
    const overdueSchedule = schedulePeriodicReKyc({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      riskTier: 3,
      baseDate: new Date('2024-01-01T00:00:00Z'), // Due 2025-01-01
    });

    const asOfDate = new Date('2026-11-05T00:00:00Z'); // Far past due date
    const evalRes = evaluateReKycComplianceRestrictions(overdueSchedule, asOfDate);

    expect(evalRes.isRestricted).toBe(true);
    expect(evalRes.payoutsRestricted).toBe(true);
    expect(evalRes.offerCreationRestricted).toBe(true);
    expect(evalRes.restrictionReason).toContain('Overdue Re-KYC review');
  });

  it('Step 109.6: clears Re-KYC review and lifts all payout and offer creation restrictions', () => {
    const eventSchedule = triggerEventDrivenReKyc({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      triggerReason: 'bank_account_changed',
    });

    const clearedSchedule = resolveReKycSchedule({
      schedule: eventSchedule,
      resolvedByUserId: 'officer_elena_01',
      notes: 'New Wells Fargo commercial bank account verified via micro-deposits and voided check.',
    });

    expect(clearedSchedule.status).toBe('cleared');
    expect(clearedSchedule.payoutsRestricted).toBe(false);
    expect(clearedSchedule.offerCreationRestricted).toBe(false);
    expect(clearedSchedule.resolvedByUserId).toBe('officer_elena_01');
    expect(clearedSchedule.resolvedAt).toBeDefined();

    const evalRes = evaluateReKycComplianceRestrictions(clearedSchedule);
    expect(evalRes.isRestricted).toBe(false);
  });
});
