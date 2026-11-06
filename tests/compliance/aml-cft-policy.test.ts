// path: tests/compliance/aml-cft-policy.test.ts

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateAmlRisk,
  recordAmlPolicyAttestation,
  DEFAULT_HIGH_RISK_COUNTRIES,
} from '@/lib/compliance/aml';

describe('Step 085: Anti-Money Laundering (AML) & Counter-Terrorist Financing (CFT) Policy Implementation', () => {
  describe('Step 085.1: Seed File Verification & Statutory Compliance', () => {
    it('verifies db/seeds/policies/aml-cft.md exists and covers BSA, FATF, and AMLD6 standards', () => {
      const seedPath = path.join(process.cwd(), 'db/seeds/policies/aml-cft.md');
      expect(fs.existsSync(seedPath)).toBe(true);

      const content = fs.readFileSync(seedPath, 'utf8');

      expect(content).toContain('Bank Secrecy Act');
      expect(content).toContain('31 U.S.C. § 5311');
      expect(content).toContain('31 CFR Chapter X');
      expect(content).toContain('FATF 40 Recommendations');
      expect(content).toContain('AMLD6');
      expect(content).toContain('300%');
      expect(content).toContain('Suspicious Activity Report');
      expect(content).toContain('Anti-Tipping-Off Protocol');
      expect(content).toContain('31 U.S.C. § 5318(g)(2)');
    });
  });

  describe('Step 085.2: Red Flag Behavior Catalog and Real-Time Risk Heuristics', () => {
    it('approves compliant standard transaction with zero red flags', () => {
      const result = evaluateAmlRisk({
        merchantId: 'merch_01',
        transactionAmountUsd: 120.5,
        monthlyDeclaredVolumeUsd: 50000,
        monthlyCurrentVolumeUsd: 12000,
        recentTransactionsLastHourCount: 5,
        cardholderName: 'John Smith',
        merchantUboNames: ['Robert Vance'],
        originCountry: 'US',
      });

      expect(result.riskScore).toBe(0);
      expect(result.riskLevel).toBe('LOW');
      expect(result.action).toBe('APPROVE');
      expect(result.redFlags).toHaveLength(0);
      expect(result.sarFilingRecommended).toBe(false);
    });

    it('detects transaction structuring in the FinCEN $10,000 threshold avoidance band', () => {
      const result = evaluateAmlRisk({
        merchantId: 'merch_02',
        transactionAmountUsd: 9500, // Structuring band $9,000 - $9,999
        monthlyDeclaredVolumeUsd: 100000,
        monthlyCurrentVolumeUsd: 20000,
        recentTransactionsLastHourCount: 2,
        cardholderName: 'Jane Doe',
      });

      expect(result.redFlags.some((rf) => rf.code === 'AML_STRUC_10K')).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(35);
      expect(result.action).toBe('FLAG_FOR_REVIEW');
    });

    it('detects volume velocity surges exceeding 300% of declared underwriting cap', () => {
      const result = evaluateAmlRisk({
        merchantId: 'merch_03',
        transactionAmountUsd: 15000,
        monthlyDeclaredVolumeUsd: 10000, // Monthly cap: $10,000
        monthlyCurrentVolumeUsd: 25000, // Current + Transaction = $40,000 (400% of cap)
        recentTransactionsLastHourCount: 10,
      });

      expect(result.redFlags.some((rf) => rf.code === 'AML_VEL_SPIKE')).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(40);
    });

    it('detects round-tripping and self-dealing when cardholder matches merchant UBO', () => {
      const result = evaluateAmlRisk({
        merchantId: 'merch_04',
        transactionAmountUsd: 2500,
        monthlyDeclaredVolumeUsd: 50000,
        monthlyCurrentVolumeUsd: 10000,
        recentTransactionsLastHourCount: 3,
        cardholderName: 'Marcus Aurelius Vance',
        merchantUboNames: ['Marcus Aurelius Vance'], // Identical name
      });

      expect(result.redFlags.some((rf) => rf.code === 'AML_SELF_DEAL')).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(50);
      expect(result.action).toBe('FLAG_FOR_REVIEW');
    });

    it('detects refund rail arbitrage and flags for investigation', () => {
      const result = evaluateAmlRisk({
        merchantId: 'merch_05',
        transactionAmountUsd: 1200,
        monthlyDeclaredVolumeUsd: 50000,
        monthlyCurrentVolumeUsd: 10000,
        recentTransactionsLastHourCount: 1,
        isRefundToDifferentMethod: true,
      });

      expect(result.redFlags.some((rf) => rf.code === 'AML_REFUND_ARBITRAGE')).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(35);
    });

    it('blocks and recommends SAR filing for high-risk sanctioned geographic origin', () => {
      const result = evaluateAmlRisk({
        merchantId: 'merch_06',
        transactionAmountUsd: 9800, // Structuring + Sanctions
        monthlyDeclaredVolumeUsd: 20000,
        monthlyCurrentVolumeUsd: 5000,
        recentTransactionsLastHourCount: 1,
        originCountry: 'IR', // Sanctioned
      });

      expect(result.redFlags.some((rf) => rf.code === 'AML_SANCTIONED_GEO')).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(75);
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.action).toBe('BLOCK_AND_HOLD');
      expect(result.sarFilingRecommended).toBe(true);
    });
  });

  describe('Step 085.3: Cryptographic Merchant AML/CFT Policy Attestation', () => {
    it('creates immutable signed merchant attestation with SHA-256 fingerprint', () => {
      const attestation = recordAmlPolicyAttestation({
        companyId: 'comp_7721',
        companyLegalName: 'Zenith Logistics International LLC',
        acknowledgedByUserId: 'user_9912',
        acknowledgedByFullName: 'Gregory House',
        signerTitle: 'Managing Partner',
        clientIp: '198.51.100.42',
      });

      expect(attestation.attestationId).toBeDefined();
      expect(attestation.digitalFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(attestation.policyVersion).toBe('1.0');
      expect(attestation.legalAttestationText).toContain('Zenith Logistics International LLC');
      expect(attestation.legalAttestationText).toContain('Bank Secrecy Act');
      expect(attestation.legalAttestationText).toContain('prohibited cash-equivalent extraction');
    });
  });

  describe('Step 085.4: Public Page Accessibility & Compliance Officer Disclosure', () => {
    it('verifies public policy page exists at app/(public)/legal/aml-cft-policy/page.tsx', () => {
      const pagePath = path.join(process.cwd(), 'app/(public)/legal/aml-cft-policy/page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);

      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('Anti-Money Laundering (AML) & Counter-Terrorist Financing (CFT) Policy');
      expect(content).toContain('compliance.officer@kdsolution.it');
      expect(content).toContain('Anti-Tipping-Off Mandate');
      expect(content).toContain('FinCEN BSA 31 CFR Chapter X');
      expect(content).toContain('Volume Surges');
    });
  });
});
