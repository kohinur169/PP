// path: tests/compliance/prohibited-businesses.test.ts

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateMerchantMccEligibility,
  PROHIBITED_MCC_CATALOG,
  RESTRICTED_MCC_CATALOG,
} from '@/lib/compliance/mcc';

describe('Step 087: Underwriting, Risk Assessment & Prohibited/Restricted Business Policy', () => {
  describe('Step 087.1: Seed File Verification & Policy Specifications', () => {
    it('verifies db/seeds/policies/prohibited-businesses.md exists and covers prohibited MCCs and card network rules', () => {
      const seedPath = path.join(process.cwd(), 'db/seeds/policies/prohibited-businesses.md');
      expect(fs.existsSync(seedPath)).toBe(true);

      const content = fs.readFileSync(seedPath, 'utf8');

      expect(content).toContain('Visa Core Rules');
      expect(content).toContain('Mastercard Rules');
      expect(content).toContain('Mastercard BRAM');
      expect(content).toContain('Weapons, Firearms & Ammunition');
      expect(content).toContain('Adult Content & Pornographic Services');
      expect(content).toContain('Unlicensed Gambling, Sports Betting');
      expect(content).toContain('MATCH / TMF');
      expect(content).toContain('18 U.S.C. § 1344');
    });
  });

  describe('Step 087.2: Automated Underwriting Gating for Prohibited MCCs', () => {
    it('blocks prohibited adult content MCC 5967 with explicit violation code', () => {
      const result = validateMerchantMccEligibility('5967');
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('PROHIBITED');
      expect(result.rejectionCode).toBe('MCC_PROHIBITED_VIOLATION');
      expect(result.reasons[0]).toContain('strictly prohibited');
      expect(result.reasons[1]).toContain('Mastercard BRAM');
    });

    it('blocks prohibited online gambling and betting MCC 7995', () => {
      const result = validateMerchantMccEligibility('7995');
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('PROHIBITED');
      expect(result.rejectionCode).toBe('MCC_PROHIBITED_VIOLATION');
      expect(result.reasons[0]).toContain('Gambling & Betting');
    });

    it('blocks prohibited crypto mixing and unregulated currency MCC 6051', () => {
      const result = validateMerchantMccEligibility('6051');
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('PROHIBITED');
      expect(result.rejectionCode).toBe('MCC_PROHIBITED_VIOLATION');
    });

    it('blocks deceptive multi-level marketing and pyramid scheme MCC 5968', () => {
      const result = validateMerchantMccEligibility('5968');
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('PROHIBITED');
    });
  });

  describe('Step 087.3: Restricted Business Category Underwriting & Mandatory Reserves', () => {
    it('approves restricted telemedicine/pharmacy MCC 5122 with mandatory 10% 90-day reserve', () => {
      const result = validateMerchantMccEligibility('5122');
      expect(result.eligible).toBe(true);
      expect(result.status).toBe('RESTRICTED');
      expect(result.mandatoryReservePercent).toBe(10);
      expect(result.mandatoryReserveDays).toBe(90);
      expect(result.requiredDocumentation).toContain('State Pharmacy License');
      expect(result.requiredDocumentation).toContain('NABP Digital Pharmacy Accreditation');
    });

    it('approves restricted travel agency MCC 4722 with mandatory 10% 120-day reserve', () => {
      const result = validateMerchantMccEligibility('4722');
      expect(result.eligible).toBe(true);
      expect(result.status).toBe('RESTRICTED');
      expect(result.mandatoryReservePercent).toBe(10);
      expect(result.mandatoryReserveDays).toBe(120);
      expect(result.requiredDocumentation).toContain('Surety Bond Documentation');
    });

    it('approves standard commercial e-commerce or SaaS MCC with standard terms', () => {
      const result = validateMerchantMccEligibility('5734'); // Computer Software Stores
      expect(result.eligible).toBe(true);
      expect(result.status).toBe('STANDARD');
      expect(result.mandatoryReservePercent).toBeUndefined();
    });
  });

  describe('Step 087.4: Public Page Accessibility & Catalog Display', () => {
    it('verifies public policy page exists at app/(public)/legal/prohibited-businesses/page.tsx', () => {
      const pagePath = path.join(process.cwd(), 'app/(public)/legal/prohibited-businesses/page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);

      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('Underwriting & Prohibited/Restricted Businesses Policy');
      expect(content).toContain('compliance.officer@kdsolution.it');
      expect(content).toContain('Strictly Prohibited Merchant Categories');
      expect(content).toContain('Restricted Business Categories');
      expect(content).toContain('18 U.S.C. § 1344');
    });
  });
});
