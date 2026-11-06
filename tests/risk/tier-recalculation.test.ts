// path: tests/risk/tier-recalculation.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  rollMonthlyVolumePeriod,
  runMonthlyTierRecalculationJob,
  evaluateRealTimeRiskLimit,
  seedRiskProfile,
  seedMonthlyVolumeCounter,
  getRiskProfile,
  resetTierRecalculationStore,
  TIER_CONFIGS,
} from '@/lib/risk/tier-recalculation';

describe('Monthly Tier Recalculation Worker & Risk Limit Monitoring (Step 163)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const merchantUpgradeId = '22222222-2222-4222-8222-222222222222';
  const merchantDowngradeId = '33333333-3333-4333-8333-333333333333';
  const merchantTier3Candidate = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    resetTierRecalculationStore();
  });

  describe('Period Boundary Rolling Invariant (Step 163.1)', () => {
    it('idempotently closes previous month and opens fresh zeroed period counter', () => {
      seedMonthlyVolumeCounter({
        id: 'counter_oct',
        tenantId,
        companyId: merchantUpgradeId,
        periodMonth: '2026-10',
        processedVolumeUsd: 45000,
        transactionCount: 300,
        chargebackCount: 1,
        chargebackVolumeUsd: 150,
        isPeriodClosed: false,
      });

      const newCounter = rollMonthlyVolumePeriod({
        tenantId,
        companyId: merchantUpgradeId,
        closingPeriodMonth: '2026-10',
        newPeriodMonth: '2026-11',
      });

      expect(newCounter.periodMonth).toBe('2026-11');
      expect(newCounter.processedVolumeUsd).toBe(0);
      expect(newCounter.isPeriodClosed).toBe(false);
    });
  });

  describe('Tier Upgrade and Downgrade Recalculation Invariant (Step 163.2)', () => {
    it('automatically upgrades Tier 1 merchant to Tier 2 when trailing 3-month volume > $50k with low chargebacks', async () => {
      seedRiskProfile({
        id: 'risk_prof_1',
        tenantId,
        companyId: merchantUpgradeId,
        riskTier: 1,
        singleTransactionCapUsd: 500,
        monthlyVolumeCapUsd: 50000,
        rollingReservePercent: 5.0,
        rollingReserveDays: 90,
      });

      // 3 months of $60,000 volume with 0 chargebacks
      ['2026-08', '2026-09', '2026-10'].forEach((m) => {
        seedMonthlyVolumeCounter({
          id: `vol_${m}`,
          tenantId,
          companyId: merchantUpgradeId,
          periodMonth: m,
          processedVolumeUsd: 60000,
          transactionCount: 400,
          chargebackCount: 0,
          chargebackVolumeUsd: 0,
          isPeriodClosed: true,
        });
      });

      const results = await runMonthlyTierRecalculationJob({
        tenantId,
        evaluationMonth: '2026-11',
        trailingMonths: ['2026-08', '2026-09', '2026-10'],
      });

      expect(results.length).toBe(1);
      expect(results[0].actionTaken).toBe('UPGRADED');
      expect(results[0].newTier).toBe(2);

      const updatedProfile = getRiskProfile(merchantUpgradeId);
      expect(updatedProfile?.riskTier).toBe(2);
      expect(updatedProfile?.monthlyVolumeCapUsd).toBe(TIER_CONFIGS[2].monthlyVolumeCapUsd);
      expect(updatedProfile?.rollingReservePercent).toBe(TIER_CONFIGS[2].rollingReservePercent);
      expect(updatedProfile?.rollingReserveDays).toBe(TIER_CONFIGS[2].rollingReserveDays);
    });

    it('forces downgrade when chargeback rate exceeds 1.00% threshold', async () => {
      seedRiskProfile({
        id: 'risk_prof_2',
        tenantId,
        companyId: merchantDowngradeId,
        riskTier: 2,
        singleTransactionCapUsd: 2500,
        monthlyVolumeCapUsd: 250000,
        rollingReservePercent: 7.5,
        rollingReserveDays: 120,
      });

      // 3 months with high chargebacks (20 chargebacks out of 1000 tx = 2.0%)
      ['2026-08', '2026-09', '2026-10'].forEach((m) => {
        seedMonthlyVolumeCounter({
          id: `vol_${m}`,
          tenantId,
          companyId: merchantDowngradeId,
          periodMonth: m,
          processedVolumeUsd: 70000,
          transactionCount: 1000,
          chargebackCount: 20,
          chargebackVolumeUsd: 2000,
          isPeriodClosed: true,
        });
      });

      const results = await runMonthlyTierRecalculationJob({
        tenantId,
        evaluationMonth: '2026-11',
        trailingMonths: ['2026-08', '2026-09', '2026-10'],
      });

      expect(results.length).toBe(1);
      expect(results[0].actionTaken).toBe('DOWNGRADED');
      expect(results[0].newTier).toBe(1);

      const updatedProfile = getRiskProfile(merchantDowngradeId);
      expect(updatedProfile?.riskTier).toBe(1);
      expect(updatedProfile?.singleTransactionCapUsd).toBe(500);
    });

    it('flags manual review for Tier 3 promotion exceeding $250k/month', async () => {
      seedRiskProfile({
        id: 'risk_prof_3',
        tenantId,
        companyId: merchantTier3Candidate,
        riskTier: 2,
        singleTransactionCapUsd: 2500,
        monthlyVolumeCapUsd: 250000,
        rollingReservePercent: 7.5,
        rollingReserveDays: 120,
      });

      ['2026-08', '2026-09', '2026-10'].forEach((m) => {
        seedMonthlyVolumeCounter({
          id: `vol_${m}`,
          tenantId,
          companyId: merchantTier3Candidate,
          periodMonth: m,
          processedVolumeUsd: 300000,
          transactionCount: 2000,
          chargebackCount: 1,
          chargebackVolumeUsd: 200,
          isPeriodClosed: true,
        });
      });

      const results = await runMonthlyTierRecalculationJob({
        tenantId,
        evaluationMonth: '2026-11',
        trailingMonths: ['2026-08', '2026-09', '2026-10'],
      });

      expect(results[0].actionTaken).toBe('MANUAL_REVIEW_FLAGGED');
      expect(results[0].reason).toContain('Tier 3; requires manual review');
    });
  });

  describe('Real-Time Risk Limit Monitoring Invariant (Step 163.3)', () => {
    it('detects 80% warning and 100% cap breach during processing', () => {
      seedRiskProfile({
        id: 'risk_prof_limit',
        tenantId,
        companyId: merchantUpgradeId,
        riskTier: 1,
        singleTransactionCapUsd: 500,
        monthlyVolumeCapUsd: 50000,
        rollingReservePercent: 5.0,
        rollingReserveDays: 90,
      });

      // Test 85% utilization
      seedMonthlyVolumeCounter({
        id: 'vol_current_warn',
        tenantId,
        companyId: merchantUpgradeId,
        periodMonth: '2026-11',
        processedVolumeUsd: 42500, // 85% of 50k
        transactionCount: 200,
        chargebackCount: 0,
        chargebackVolumeUsd: 0,
        isPeriodClosed: false,
      });

      const evalWarn = evaluateRealTimeRiskLimit(tenantId, merchantUpgradeId, '2026-11');
      expect(evalWarn.status).toBe('WARNING_80_PCT');
      expect(evalWarn.utilizationRatio).toBe(0.85);

      // Test 102% breach
      seedMonthlyVolumeCounter({
        id: 'vol_current_breach',
        tenantId,
        companyId: merchantUpgradeId,
        periodMonth: '2026-11',
        processedVolumeUsd: 51000, // 102% of 50k
        transactionCount: 250,
        chargebackCount: 0,
        chargebackVolumeUsd: 0,
        isPeriodClosed: false,
      });

      const evalBreach = evaluateRealTimeRiskLimit(tenantId, merchantUpgradeId, '2026-11');
      expect(evalBreach.status).toBe('BREACHED_100_PCT');
      expect(evalBreach.utilizationRatio).toBe(1.02);
    });
  });
});
