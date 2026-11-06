// path: tests/compliance/chargeback-settlement-policy.test.ts

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateDisputeSla,
  calculateMerchantReserveTerms,
  evaluateChargebackRatio,
} from '@/lib/compliance/disputes';

describe('Step 088: Chargeback, Dispute, Refund & Settlement Policy Implementation', () => {
  describe('Step 088.1: Seed File Verification & Policy Terms', () => {
    it('verifies db/seeds/policies/chargeback-settlement.md exists and covers SLAs, reserves, and network thresholds', () => {
      const seedPath = path.join(process.cwd(), 'db/seeds/policies/chargeback-settlement.md');
      expect(fs.existsSync(seedPath)).toBe(true);

      const content = fs.readFileSync(seedPath, 'utf8');

      expect(content).toContain('ten percent (10.00%) rolling reserve');
      expect(content).toContain('ninety (90) calendar days');
      expect(content).toContain('five percent (5.00%) rolling reserve');
      expect(content).toContain('sixty (60) calendar days');
      expect(content).toContain('twenty-four (24) hours');
      expect(content).toContain('forty-eight (48) hours');
      expect(content).toContain('twenty-five dollars ($25.00 USD)');
      expect(content).toContain('zero point three zero percent (0.30%)');
      expect(content).toContain('zero point nine zero percent (0.90%)');
    });
  });

  describe('Step 088.2: Dispute SLA Timeline Calculation Engine', () => {
    it('calculates strict 24-hour merchant evidence pack cut-off and 48-hour gateway filing cut-off', () => {
      const receivedTime = new Date('2026-11-01T12:00:00.000Z');
      const testNow = new Date('2026-11-01T18:00:00.000Z'); // 6 hours later

      const timeline = calculateDisputeSla(receivedTime, testNow);

      expect(timeline.merchantEvidenceCutoff).toBe('2026-11-02T12:00:00.000Z');
      expect(timeline.networkFilingCutoff).toBe('2026-11-03T12:00:00.000Z');
      expect(timeline.isMerchantDeadlineExpired).toBe(false);
      expect(timeline.isNetworkDeadlineExpired).toBe(false);
      expect(timeline.hoursRemainingMerchantDeadline).toBe(18);
    });

    it('marks merchant deadline expired when more than 24 hours have elapsed', () => {
      const receivedTime = new Date('2026-11-01T12:00:00.000Z');
      const testNow = new Date('2026-11-02T13:00:00.000Z'); // 25 hours later

      const timeline = calculateDisputeSla(receivedTime, testNow);

      expect(timeline.isMerchantDeadlineExpired).toBe(true);
      expect(timeline.isNetworkDeadlineExpired).toBe(false);
      expect(timeline.hoursRemainingMerchantDeadline).toBe(0);
    });
  });

  describe('Step 088.3: Risk Tier Reserve Calibration Engine', () => {
    it('returns 10% 90-day reserve for Tier 1 High-Risk merchants', () => {
      const terms = calculateMerchantReserveTerms(1);
      expect(terms.riskTier).toBe(1);
      expect(terms.reservePercent).toBe(10);
      expect(terms.reserveHoldingDays).toBe(90);
    });

    it('returns 5% 60-day reserve for Tier 2 Medium-Risk merchants', () => {
      const terms = calculateMerchantReserveTerms(2);
      expect(terms.riskTier).toBe(2);
      expect(terms.reservePercent).toBe(5);
      expect(terms.reserveHoldingDays).toBe(60);
    });

    it('returns 0% base reserve for Tier 3 Low-Risk merchants', () => {
      const terms = calculateMerchantReserveTerms(3);
      expect(terms.riskTier).toBe(3);
      expect(terms.reservePercent).toBe(0);
      expect(terms.reserveHoldingDays).toBe(0);
    });
  });

  describe('Step 088.4: Chargeback Ratio Network Monitoring Engine', () => {
    it('clears low chargeback ratio (0.10%) as healthy with zero mitigation action', () => {
      const evalResult = evaluateChargebackRatio(1000, 1); // 1 / 1000 = 0.10%
      expect(evalResult.ratioPercent).toBe(0.1);
      expect(evalResult.status).toBe('HEALTHY');
      expect(evalResult.mitigationPlanMandatory).toBe(false);
    });

    it('flags ratio exceeding 0.30% with Early Warning and mandatory mitigation plan', () => {
      const evalResult = evaluateChargebackRatio(1000, 4); // 4 / 1000 = 0.40%
      expect(evalResult.ratioPercent).toBe(0.4);
      expect(evalResult.status).toBe('EARLY_WARNING_03');
      expect(evalResult.mitigationPlanMandatory).toBe(true);
      expect(evalResult.actionRequired).toContain('EARLY WARNING');
    });

    it('flags ratio exceeding 0.90% with Critical Network Breach status', () => {
      const evalResult = evaluateChargebackRatio(1000, 11); // 11 / 1000 = 1.10%
      expect(evalResult.ratioPercent).toBe(1.1);
      expect(evalResult.status).toBe('CRITICAL_NETWORK_BREACH_09');
      expect(evalResult.mitigationPlanMandatory).toBe(true);
      expect(evalResult.actionRequired).toContain('CRITICAL BREACH');
    });
  });

  describe('Step 088.5: Public Page Accessibility', () => {
    it('verifies public policy page exists at app/(public)/legal/chargeback-settlement-policy/page.tsx', () => {
      const pagePath = path.join(process.cwd(), 'app/(public)/legal/chargeback-settlement-policy/page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);

      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('Chargeback, Dispute, Refund & Settlement Policy');
      expect(content).toContain('compliance.officer@kdsolution.it');
      expect(content).toContain('24h Merchant / 48h Gateway Filing');
      expect(content).toContain('Tier 1 (10% 90d)');
      expect(content).toContain('Early Warning');
    });
  });
});
