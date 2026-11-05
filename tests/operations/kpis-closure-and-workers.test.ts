// path: tests/operations/kpis-closure-and-workers.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateGlobalPlatformKpis,
  calculateSubMerchantAnalytics,
} from '@/lib/metrics/platform-kpis';
import {
  initiateAccountClosure,
  getAccountClosureRecord,
  resetAccountClosureStore,
} from '@/lib/merchant/closure';
import {
  runDailySettlementReleaseWorker,
  PendingSettlementItem,
} from '@/lib/jobs/settlement-release';
import {
  evaluateMerchantReKycAndSpikes,
  MerchantRiskVelocityItem,
} from '@/lib/jobs/re-kyc-worker';

describe('Operations, Closure, Schedulers & Workers (Steps 239-247)', () => {
  const companyId = '22222222-3333-4444-8555-666666666666';
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const actorId = 'usr_owner_01';

  beforeEach(() => {
    resetAccountClosureStore();
  });

  describe('Step 239 & Step 240: Executive KPIs & Sub-Merchant Analytics', () => {
    it('aggregates global executive KPIs for Super Admin', () => {
      const kpis = calculateGlobalPlatformKpis();
      expect(Number(kpis.totalProcessingVolumeUsd)).toBeGreaterThan(20000000);
      expect(kpis.activeMerchantsCount).toBeGreaterThan(1000);
      expect(kpis.overallChargebackRatePercent).toBeLessThan(0.3); // Under warning
      expect(kpis.processorDistribution.stripePercent).toBe(40);
    });

    it('calculates personal sub-merchant chargeback rate and detects threshold breaches', () => {
      // 100 transactions, 0 disputes
      const cleanMerchant = calculateSubMerchantAnalytics({
        companyId,
        transactionCount: 100,
        chargebackCount: 0,
      });
      expect(cleanMerchant.ownChargebackRatePercent).toBe(0);
      expect(cleanMerchant.isBreachingSchemeWarning).toBe(false);

      // 100 transactions, 1 dispute = 1.0% (Breaching 0.3% scheme warning)
      const breachingMerchant = calculateSubMerchantAnalytics({
        companyId,
        transactionCount: 100,
        chargebackCount: 1,
      });
      expect(breachingMerchant.ownChargebackRatePercent).toBe(1.0);
      expect(breachingMerchant.isBreachingSchemeWarning).toBe(true);
    });
  });

  describe('Step 242: Sub-Merchant Account Closure & 7-Year Regulatory Retention', () => {
    it('initiates closure: holds 120-day dispute liability buffer, deletes tokens, locks 7-year retention', async () => {
      const closure = await initiateAccountClosure({
        companyId,
        tenantId,
        actorId,
        currentAvailableBalanceUsd: '5000.0000',
        rollingReserveHeldUsd: '2500.0000',
        simulatedDeletedCardTokensCount: 42,
      });

      expect(closure.status).toBe('closing_pending_chargeback_window');
      expect(closure.cardTokensDeletedCount).toBe(42);
      expect(closure.heldDisputeLiabilityBufferUsd).toBe('2500.0000');
      expect(closure.isArchivalLockActive).toBe(true);

      // Verify 120 days dispute window
      const initTime = new Date(closure.closureInitiatedAt).getTime();
      const cbExpire = new Date(closure.chargebackWindowExpiresAt).getTime();
      const daysDiff = (cbExpire - initTime) / (1000 * 60 * 60 * 24);
      expect(Math.round(daysDiff)).toBe(120);

      // Verify 7 years retention
      const archiveTime = new Date(closure.recordsArchivedUntil).getTime();
      const yearsDiff = (archiveTime - initTime) / (1000 * 60 * 60 * 24 * 365.25);
      expect(Math.round(yearsDiff)).toBe(7);

      const retrieved = getAccountClosureRecord(companyId);
      expect(retrieved?.id).toBe(closure.id);
    });
  });

  describe('Step 244: Settlement Holding Period Release & Multi-Gate Verification Worker', () => {
    it('releases funds only when holding period matured AND delivery verified AND zero blocking reviews', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const futureDate = new Date(Date.now() + 86400000).toISOString();

      const items: PendingSettlementItem[] = [
        {
          id: 'set_01',
          tenantId,
          companyId,
          paymentId: 'pay_01',
          amountUsd: '150.0000',
          holdMaturesAt: pastDate,
          isDeliveryTrackingVerified: true,
          hasActiveDisputeOrReview: false,
          isReleased: false,
        }, // Should release
        {
          id: 'set_02',
          tenantId,
          companyId,
          paymentId: 'pay_02',
          amountUsd: '300.0000',
          holdMaturesAt: pastDate,
          isDeliveryTrackingVerified: false, // Delivery not verified
          hasActiveDisputeOrReview: false,
          isReleased: false,
        }, // Should block
        {
          id: 'set_03',
          tenantId,
          companyId,
          paymentId: 'pay_03',
          amountUsd: '450.0000',
          holdMaturesAt: futureDate, // Not matured
          isDeliveryTrackingVerified: true,
          hasActiveDisputeOrReview: false,
          isReleased: false,
        }, // Should block
      ];

      const result = await runDailySettlementReleaseWorker(items);
      expect(result.inspectedCount).toBe(3);
      expect(result.releasedCount).toBe(1);
      expect(result.blockedCount).toBe(2);
      expect(result.totalReleasedUsd).toBe('150.0000');
      expect(items[0].isReleased).toBe(true);
      expect(items[1].isReleased).toBe(false);
    });
  });

  describe('Step 246: Scheduled Re-KYC Evaluator & Sudden Volume Spike Detection Worker', () => {
    it('detects Tier 3 12-month re-KYC due status', async () => {
      const past13Months = new Date(Date.now() - 13 * 30.44 * 24 * 60 * 60 * 1000).toISOString();
      const merchant: MerchantRiskVelocityItem = {
        companyId,
        tenantId,
        riskTier: 3,
        lastKycApprovedAt: past13Months,
        averageMonthlyVolumeUsd: 10000,
        recent48hVolumeUsd: 500,
      };

      const evalResult = await evaluateMerchantReKycAndSpikes(merchant);
      expect(evalResult.isReKycDue).toBe(true);
      expect(evalResult.reKycIntervalMonths).toBe(12);
      expect(evalResult.isVolumeSpikeDetected).toBe(false);
      expect(evalResult.complianceReviewTicketOpened).toBe(true);
    });

    it('detects sudden volume spike (>3x monthly average) and freezes payouts', async () => {
      const recentKyc = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const spikingMerchant: MerchantRiskVelocityItem = {
        companyId,
        tenantId,
        riskTier: 1,
        lastKycApprovedAt: recentKyc,
        averageMonthlyVolumeUsd: 10000,
        recent48hVolumeUsd: 2500, // Normalized monthly pace = 2500 * 15 = 37,500 (3.75x normal)
      };

      const evalResult = await evaluateMerchantReKycAndSpikes(spikingMerchant);
      expect(evalResult.isVolumeSpikeDetected).toBe(true);
      expect(evalResult.volumeSpikeRatio).toBe(3.75);
      expect(evalResult.payoutsFrozen).toBe(true);
      expect(evalResult.complianceReviewTicketOpened).toBe(true);
    });
  });
});
