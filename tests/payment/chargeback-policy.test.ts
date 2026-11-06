// path: tests/payment/chargeback-policy.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/lib/money/money';
import {
  evaluateMerchantChargebackMetrics,
  updateChargebackThresholdPolicy,
  getChargebackThresholdPolicy,
  deductChargebackLossAndFee,
  resetChargebackPolicyStore,
} from '@/lib/payment/chargeback-policy';

describe('Graduated Chargeback Monitoring & Dispute Policy Engine (Step 141)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const superAdminId = '99999999-9999-4999-8999-999999999999';

  beforeEach(() => {
    resetChargebackPolicyStore();
  });

  describe('Minimum Transaction Count Sample Guard (Step 141.1)', () => {
    it('does not penalize merchant whose transaction count is below minimum sample threshold', () => {
      // 1 chargeback out of 4 transactions would mathematically be 25%, but sample size is too low
      const evaluation = evaluateMerchantChargebackMetrics({
        companyId,
        tenantId,
        totalTransactions: 4,
        totalChargebacks: 1,
      });

      expect(evaluation.status).toBe('normal');
      expect(evaluation.isSuspended).toBe(false);
      expect(evaluation.extraReserveRate).toBe(0.0);
      expect(evaluation.actionRequired).toContain('below card network minimum threshold');
    });
  });

  describe('Graduated Network Enforcement Actions (Step 141.2)', () => {
    it('maintains status "normal" when chargeback rate is below warning threshold', () => {
      // 200 transactions, 1 chargeback = 0.50% (50 bps < 65 bps warning)
      const evaluation = evaluateMerchantChargebackMetrics({
        companyId,
        tenantId,
        totalTransactions: 200,
        totalChargebacks: 1,
      });

      expect(evaluation.status).toBe('normal');
      expect(evaluation.chargebackRateBps).toBe(50);
      expect(evaluation.chargebackRatePercentage).toBe(0.5);
      expect(evaluation.isSuspended).toBe(false);
      expect(evaluation.extraReserveRate).toBe(0.0);
    });

    it('triggers status "warning" when rate crosses warning threshold (>= 0.65%)', () => {
      // 150 transactions, 1 chargeback = 0.67% (67 bps >= 65 bps)
      const evaluation = evaluateMerchantChargebackMetrics({
        companyId,
        tenantId,
        totalTransactions: 150,
        totalChargebacks: 1,
      });

      expect(evaluation.status).toBe('warning');
      expect(evaluation.chargebackRateBps).toBe(67);
      expect(evaluation.isSuspended).toBe(false);
      expect(evaluation.extraReserveRate).toBe(0.0);
      expect(evaluation.actionRequired).toContain('exceeded monitoring threshold');
    });

    it('triggers status "extra_reserve" when rate crosses excessive threshold (>= 1.00%)', () => {
      // 200 transactions, 2 chargebacks = 1.00% (100 bps >= 100 bps)
      const evaluation = evaluateMerchantChargebackMetrics({
        companyId,
        tenantId,
        totalTransactions: 200,
        totalChargebacks: 2,
      });

      expect(evaluation.status).toBe('extra_reserve');
      expect(evaluation.chargebackRateBps).toBe(100);
      expect(evaluation.isSuspended).toBe(false);
      expect(evaluation.extraReserveRate).toBe(10.0);
      expect(evaluation.actionRequired).toContain('Added rolling reserve of 10% imposed');
    });

    it('triggers status "suspended" when rate crosses critical threshold (>= 1.50%)', () => {
      // 200 transactions, 4 chargebacks = 2.00% (200 bps >= 150 bps)
      const evaluation = evaluateMerchantChargebackMetrics({
        companyId,
        tenantId,
        totalTransactions: 200,
        totalChargebacks: 4,
      });

      expect(evaluation.status).toBe('suspended');
      expect(evaluation.chargebackRateBps).toBe(200);
      expect(evaluation.isSuspended).toBe(true);
      expect(evaluation.extraReserveRate).toBe(10.0);
      expect(evaluation.actionRequired).toContain('Payment processing suspended at once');
    });
  });

  describe('Super Admin Policy Customization (Step 141.3)', () => {
    it('forbids non-super_admin roles from modifying chargeback policy or fees', async () => {
      await expect(
        updateChargebackThresholdPolicy({
          tenantId,
          updaterId: 'user-support-123',
          updaterRole: 'support',
          warningRateBps: 80,
        })
      ).rejects.toThrow(/Only super_admin can configure chargeback threshold policies/);
    });

    it('allows super_admin to configure custom thresholds, fee, and refund platform fee setting', async () => {
      const updated = await updateChargebackThresholdPolicy({
        tenantId,
        updaterId: superAdminId,
        updaterRole: 'super_admin',
        minTransactionCount: 50,
        warningRateBps: 50, // 0.50%
        extraReserveRateBps: 80, // 0.80%
        suspensionRateBps: 120, // 1.20%
        chargebackFeeUsd: Money.from('35.0000'),
        returnPlatformFeeOnRefund: true,
      });

      expect(updated.minTransactionCount).toBe(50);
      expect(updated.warningRateBps).toBe(50);
      expect(updated.extraReserveRateBps).toBe(80);
      expect(updated.suspensionRateBps).toBe(120);
      expect(updated.chargebackFeeUsd.toNumericString()).toBe('35.0000');
      expect(updated.returnPlatformFeeOnRefund).toBe(true);

      const fetched = getChargebackThresholdPolicy(tenantId);
      expect(fetched.warningRateBps).toBe(50);
    });

    it('validates threshold ordering hierarchy', async () => {
      await expect(
        updateChargebackThresholdPolicy({
          tenantId,
          updaterId: superAdminId,
          updaterRole: 'super_admin',
          warningRateBps: 120,
          extraReserveRateBps: 100, // Invalid: Warning > Extra Reserve
        })
      ).rejects.toThrow(/Invalid threshold hierarchy/);
    });
  });

  describe('Chargeback Loss & Fee Deduction Engine (Step 141.4)', () => {
    it('deducts dispute amount plus configured chargeback fee from sub-merchant balance', async () => {
      const disputeAmount = Money.from('120.0000');

      const deduction = await deductChargebackLossAndFee({
        companyId,
        tenantId,
        disputeAmount,
      });

      expect(deduction.companyId).toBe(companyId);
      expect(deduction.disputeAmount.toNumericString()).toBe('120.0000');
      expect(deduction.chargebackFee.toNumericString()).toBe('25.0000'); // Default $25
      expect(deduction.totalDeducted.toNumericString()).toBe('145.0000'); // 120 + 25 = 145
      expect(deduction.currency).toBe('USD');
      expect(deduction.debitedAt).toBeDefined();
    });
  });
});
