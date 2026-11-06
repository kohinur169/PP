// path: tests/compliance/mcc.test.ts

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ISO_18245_MCC_CATALOG,
  classifyMccRisk,
  searchMccCatalog,
} from '@/lib/constants/mcc';

describe('Step 093: Merchant Category Code (MCC) Registry & Risk Classifier', () => {
  describe('Step 093.1: ISO 18245 MCC Catalog Integrity', () => {
    it('verifies catalog contains standard codes with complete metadata', () => {
      expect(ISO_18245_MCC_CATALOG.length).toBeGreaterThanOrEqual(15);

      const software = ISO_18245_MCC_CATALOG.find((m) => m.code === '5734');
      expect(software).toBeDefined();
      expect(software?.title).toBe('Computer Software Stores');
      expect(software?.riskTier).toBe(3);
      expect(software?.isProhibited).toBe(false);

      const adult = ISO_18245_MCC_CATALOG.find((m) => m.code === '5967');
      expect(adult).toBeDefined();
      expect(adult?.isProhibited).toBe(true);

      const travel = ISO_18245_MCC_CATALOG.find((m) => m.code === '4722');
      expect(travel).toBeDefined();
      expect(travel?.isRestricted).toBe(true);
      expect(travel?.baselineReservePercent).toBe(10);
    });
  });

  describe('Step 093.2: Automated Risk Classifier & Reserve Assignment', () => {
    it('classifies SaaS Software 5734 as Tier 3 Low Risk with zero baseline reserve', () => {
      const result = classifyMccRisk('5734');
      expect(result.riskTier).toBe(3);
      expect(result.isProhibited).toBe(false);
      expect(result.isRestricted).toBe(false);
      expect(result.baselineReservePercent).toBe(0);
      expect(result.reserveHoldDays).toBe(0);
      expect(result.payoutDelayDays).toBe(2);
      expect(result.status).toBe('ELIGIBLE_STANDARD');
    });

    it('classifies General Retail 5311 as Tier 2 Medium Risk with 5% 60-day reserve', () => {
      const result = classifyMccRisk('5311');
      expect(result.riskTier).toBe(2);
      expect(result.isProhibited).toBe(false);
      expect(result.isRestricted).toBe(false);
      expect(result.baselineReservePercent).toBe(5);
      expect(result.reserveHoldDays).toBe(60);
      expect(result.payoutDelayDays).toBe(3);
      expect(result.status).toBe('ELIGIBLE_STANDARD');
    });

    it('classifies Travel Agencies 4722 as Tier 1 Restricted High Risk with 10% 120-day reserve', () => {
      const result = classifyMccRisk('4722');
      expect(result.riskTier).toBe(1);
      expect(result.isProhibited).toBe(false);
      expect(result.isRestricted).toBe(true);
      expect(result.baselineReservePercent).toBe(10);
      expect(result.reserveHoldDays).toBe(120);
      expect(result.payoutDelayDays).toBe(7);
      expect(result.status).toBe('ELIGIBLE_RESTRICTED_RESERVE');
    });

    it('classifies Telemedicine / Pharmacy 5122 as Tier 1 Restricted High Risk with 10% 90-day reserve', () => {
      const result = classifyMccRisk('5122');
      expect(result.riskTier).toBe(1);
      expect(result.isRestricted).toBe(true);
      expect(result.baselineReservePercent).toBe(10);
      expect(result.reserveHoldDays).toBe(90);
      expect(result.status).toBe('ELIGIBLE_RESTRICTED_RESERVE');
    });

    it('classifies Adult Entertainment 5967 as Prohibited Violation', () => {
      const result = classifyMccRisk('5967');
      expect(result.isProhibited).toBe(true);
      expect(result.status).toBe('PROHIBITED_VIOLATION');
      expect(result.explanation).toContain('PROHIBITED');
    });

    it('classifies Online Gambling 7995 as Prohibited Violation', () => {
      const result = classifyMccRisk('7995');
      expect(result.isProhibited).toBe(true);
      expect(result.status).toBe('PROHIBITED_VIOLATION');
      expect(result.explanation).toContain('UIGEA');
    });
  });

  describe('Step 093.3: Catalog Search & Filter Utility', () => {
    it('searches catalog by keyword and filters by prohibited/restricted status', () => {
      const softwareResults = searchMccCatalog('software');
      expect(softwareResults.some((m) => m.code === '5734')).toBe(true);

      const prohibitedResults = searchMccCatalog('', 'PROHIBITED');
      expect(prohibitedResults.every((m) => m.isProhibited)).toBe(true);
      expect(prohibitedResults.some((m) => m.code === '5967')).toBe(true);

      const restrictedResults = searchMccCatalog('', 'RESTRICTED');
      expect(restrictedResults.every((m) => m.isRestricted)).toBe(true);
      expect(restrictedResults.some((m) => m.code === '4722')).toBe(true);
    });
  });

  describe('Step 093.4: Onboarding UI Component Verification', () => {
    it('verifies MccSelector combobox component exists at components/onboarding/MccSelector.tsx', () => {
      const compPath = path.join(process.cwd(), 'components/onboarding/MccSelector.tsx');
      expect(fs.existsSync(compPath)).toBe(true);

      const content = fs.readFileSync(compPath, 'utf8');
      expect(content).toContain('MccSelector');
      expect(content).toContain('ISO_18245_MCC_CATALOG');
      expect(content).toContain('classifyMccRisk');
    });
  });
});
