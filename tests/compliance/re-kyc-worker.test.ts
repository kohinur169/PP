// path: tests/compliance/re-kyc-worker.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  runScheduledReKycEvaluationJob,
  triggerEventReKyc,
  seedMerchantKycProfile,
  seedReKycSchedule,
  getReKycSchedules,
  resetReKycStore,
} from '@/lib/compliance/re-kyc-worker';

describe('Scheduled Tier 3 Annual & Tier 1/2 Biennial Re-KYC Worker & Volume Spike Engine (Step 162)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyTier3 = '22222222-2222-4222-8222-222222222222';
  const companyTier1 = '33333333-3333-4333-8333-333333333333';
  const companySpike = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    resetReKycStore();
  });

  describe('Tier 3 Annual vs Tier 1/2 Biennial Re-KYC Invariant (Step 162.1)', () => {
    it('schedules Tier 3 at 365 days and Tier 1 at 730 days', async () => {
      // 1. Tier 3 approved 380 days ago (> 365 days) -> Must trigger
      seedMerchantKycProfile({
        companyId: companyTier3,
        tenantId,
        tier: 3,
        lastKycApprovedAt: '2025-10-20T00:00:00Z',
        historicalAvgMonthlyVolumeUsd: 50000,
        currentMonthVolumeUsd: 45000,
      });

      // 2. Tier 1 approved 380 days ago (< 730 days) -> Must NOT trigger yet
      seedMerchantKycProfile({
        companyId: companyTier1,
        tenantId,
        tier: 1,
        lastKycApprovedAt: '2025-10-20T00:00:00Z',
        historicalAvgMonthlyVolumeUsd: 10000,
        currentMonthVolumeUsd: 9000,
      });

      const summary = await runScheduledReKycEvaluationJob({
        tenantId,
        currentDateStr: '2026-11-05',
      });

      expect(summary.inspectedCount).toBe(2);
      expect(summary.scheduledCreatedCount).toBe(1);

      const schedules = getReKycSchedules(tenantId);
      const tier3Schedule = schedules.find((s) => s.companyId === companyTier3);
      const tier1Schedule = schedules.find((s) => s.companyId === companyTier1);

      expect(tier3Schedule).toBeDefined();
      expect(tier3Schedule?.triggerReason).toBe('TIER_3_ANNUAL_SCHEDULED');
      expect(tier1Schedule).toBeUndefined();
    });

    it('triggers Tier 1 biennial re-KYC once 730 days have elapsed', async () => {
      seedMerchantKycProfile({
        companyId: companyTier1,
        tenantId,
        tier: 1,
        lastKycApprovedAt: '2024-10-01T00:00:00Z', // > 730 days ago
        historicalAvgMonthlyVolumeUsd: 10000,
        currentMonthVolumeUsd: 9000,
      });

      const summary = await runScheduledReKycEvaluationJob({
        tenantId,
        currentDateStr: '2026-11-05',
      });

      expect(summary.scheduledCreatedCount).toBe(1);

      const schedules = getReKycSchedules(tenantId);
      const tier1Schedule = schedules.find((s) => s.companyId === companyTier1);

      expect(tier1Schedule).toBeDefined();
      expect(tier1Schedule?.triggerReason).toBe('TIER_1_2_BIENNIAL_SCHEDULED');
    });
  });

  describe('Volume Spike Trigger Invariant (Step 162.2)', () => {
    it('triggers immediate re-KYC review when volume surges >= 200% of historical average', async () => {
      seedMerchantKycProfile({
        companyId: companySpike,
        tenantId,
        tier: 2,
        lastKycApprovedAt: '2026-06-01T00:00:00Z', // Recent KYC
        historicalAvgMonthlyVolumeUsd: 10000,
        currentMonthVolumeUsd: 25000, // 250% spike!
      });

      const summary = await runScheduledReKycEvaluationJob({
        tenantId,
        currentDateStr: '2026-11-05',
      });

      expect(summary.volumeSpikesTriggeredCount).toBe(1);

      const schedules = getReKycSchedules(tenantId);
      const spikeSchedule = schedules.find((s) => s.companyId === companySpike);

      expect(spikeSchedule).toBeDefined();
      expect(spikeSchedule?.triggerReason).toBe('VOLUME_SPIKE_REVIEW');
      expect((spikeSchedule?.metadata as Record<string, unknown>).spikeRatio).toBe(2.5);
    });
  });

  describe('Event-Triggered Re-KYC & Overdue Restricting Invariant (Step 162.3)', () => {
    it('creates manual event-triggered re-KYC for UBO changes', async () => {
      const schedule = await triggerEventReKyc({
        tenantId,
        companyId: companyTier3,
        reason: 'UBO_CHANGE',
        dueDate: '2026-11-20',
        actorUserId: '00000000-0000-4000-8000-000000000001',
      });

      expect(schedule.triggerReason).toBe('UBO_CHANGE');
      expect(schedule.status).toBe('scheduled');
      expect(schedule.payoutsRestricted).toBe(false);
    });

    it('enforces overdue restriction on past due uncompleted re-KYCs', async () => {
      seedReKycSchedule({
        id: 'schedule_overdue_1',
        tenantId,
        companyId: companyTier3,
        triggerReason: 'TIER_3_ANNUAL_SCHEDULED',
        dueDate: '2026-11-01', // Past due (today is 2026-11-05)
        status: 'scheduled',
        payoutsRestricted: false,
        offerCreationRestricted: false,
        metadata: {},
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      });

      const summary = await runScheduledReKycEvaluationJob({
        tenantId,
        currentDateStr: '2026-11-05',
      });

      expect(summary.overdueRestrictedCount).toBe(1);

      const schedules = getReKycSchedules(tenantId);
      const overdue = schedules.find((s) => s.id === 'schedule_overdue_1');

      expect(overdue?.status).toBe('overdue_restricted');
      expect(overdue?.payoutsRestricted).toBe(true);
      expect(overdue?.offerCreationRestricted).toBe(true);
    });
  });
});
