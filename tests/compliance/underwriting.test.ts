// path: tests/compliance/underwriting.test.ts

import { describe, it, expect } from 'vitest';
import {
  calculateUnderwritingTiers,
  createCompanyRiskProfileRecord,
  TIER_1_PARAMETERS,
  TIER_2_PARAMETERS,
  TIER_3_PARAMETERS,
} from '@/lib/compliance/underwriting';

describe('Step 105: Risk-Based Underwriting & Starting Limit Assignment Calculator', () => {
  it('Step 105.1: enforces Tier 1 default caps ($500 single charge, $2,500 monthly limit, 10% 90-day reserve) for new merchants', () => {
    const result = calculateUnderwritingTiers({
      mccCode: '5411', // Grocery stores (Low Risk)
      businessAgeMonths: 6,
      isNewMerchant: true,
      requestedMonthlyVolumeUsd: 2000,
      requestedMaxTransactionUsd: 150,
    });

    expect(result.riskTier).toBe(1);
    expect(result.singleTransactionCap.toNumericString()).toBe('500.0000');
    expect(result.monthlyVolumeCap.toNumericString()).toBe('2500.0000');
    expect(result.rollingReservePercent).toBe(10.0);
    expect(result.rollingReserveDays).toBe(90);
    expect(result.requestedLimitsApproved).toBe(true);
  });

  it('Step 105.2: strictly restricts new sellers to Tier 1 even when requesting elevated volume ($50,000/mo, $5,000/tx)', () => {
    const result = calculateUnderwritingTiers({
      mccCode: '5734', // Computer Software Stores
      businessAgeMonths: 2,
      isNewMerchant: true,
      requestedMonthlyVolumeUsd: 50000,
      requestedMaxTransactionUsd: 5000,
    });

    // Regardless of requested volume, strictly assigned to Tier 1
    expect(result.riskTier).toBe(1);
    expect(result.singleTransactionCap.toNumericString()).toBe('500.0000');
    expect(result.monthlyVolumeCap.toNumericString()).toBe('2500.0000');
    expect(result.rollingReservePercent).toBe(10.0);
    expect(result.rollingReserveDays).toBe(90);
    expect(result.requestedLimitsApproved).toBe(false);

    const explanationText = result.explanations.join(' ');
    expect(explanationText).toContain('Underwriting Policy Rule LR-U01 strictly assigns all new merchants to Tier 1');
  });

  it('Step 105.3: factors MCC risk and young business age into composite risk score', () => {
    const youngHighRisk = calculateUnderwritingTiers({
      mccCode: '7995', // Gambling / Betting (Prohibited/High)
      businessAgeMonths: 3, // Young business
      websiteRiskScore: 75,
      isNewMerchant: true,
    });

    expect(youngHighRisk.compositeRiskScore).toBeGreaterThanOrEqual(80);
    expect(youngHighRisk.explanations.some((e) => e.includes('Business age < 12 months'))).toBe(true);
  });

  it('Step 105.4: qualifies established merchant with completed probation for Tier 2 limits', () => {
    const result = calculateUnderwritingTiers({
      mccCode: '5411',
      businessAgeMonths: 18,
      isNewMerchant: false,
      hasCompletedProbationaryPeriod: true,
      historicalChargebackRatePercent: 0.35,
    });

    expect(result.riskTier).toBe(2);
    expect(result.singleTransactionCap.toNumericString()).toBe('2500.0000');
    expect(result.monthlyVolumeCap.toNumericString()).toBe('25000.0000');
    expect(result.rollingReservePercent).toBe(5.0);
    expect(result.rollingReserveDays).toBe(60);
    expect(result.requestedLimitsApproved).toBe(true);
  });

  it('Step 105.5: qualifies mature low-risk enterprise merchant with clean history for Tier 3 limits', () => {
    const result = calculateUnderwritingTiers({
      mccCode: '5411', // Grocery (Low risk)
      businessAgeMonths: 48, // 4 years
      isNewMerchant: false,
      hasCompletedProbationaryPeriod: true,
      historicalChargebackRatePercent: 0.05, // Exceptionally low
      websiteRiskScore: 10,
    });

    expect(result.riskTier).toBe(3);
    expect(result.singleTransactionCap.toNumericString()).toBe('10000.0000');
    expect(result.monthlyVolumeCap.toNumericString()).toBe('100000.0000');
    expect(result.rollingReservePercent).toBe(0.0);
    expect(result.rollingReserveDays).toBe(0);
  });

  it('Step 105.6: generates company_risk_profiles record formatted in USD numeric(18, 4)', () => {
    const underwriting = calculateUnderwritingTiers({
      mccCode: '5411',
      businessAgeMonths: 4,
      isNewMerchant: true,
    });

    const record = createCompanyRiskProfileRecord({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      underwriting,
      mccCode: '5411',
      reviewerId: '018f6c4c-3500-7fa1-b1e2-888888888abc',
      version: 1,
    });

    expect(record.id).toBeDefined();
    expect(record.riskTier).toBe(1);
    expect(record.singleTransactionCapUsd).toBe('500.0000');
    expect(record.monthlyVolumeCapUsd).toBe('2500.0000');
    expect(record.rollingReservePercent).toBe(10.0);
    expect(record.rollingReserveDays).toBe(90);
    expect(record.version).toBe(1);
  });
});
