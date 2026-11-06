// path: tests/compliance/sanctions.test.ts

import { describe, it, expect } from 'vitest';
import {
  screenEntityAgainstSanctions,
  screenMerchantApplicationSanctions,
  matchNameAgainstSanctionEntry,
  OFFICIAL_SANCTIONED_ENTITIES,
} from '@/lib/compliance/sanctions';

describe('Step 103: Automated Daily Sanctions Screening Engine (OFAC, UN, EU, UK HMT)', () => {
  it('Step 103.1: flags exact match against OFAC SDN entity and blocks activation & payouts', () => {
    const result = screenEntityAgainstSanctions({
      entityName: 'Sberbank of Russia PJSC',
    });

    expect(result.isMatchFound).toBe(true);
    expect(result.highestSimilarity).toBeGreaterThanOrEqual(0.95);
    expect(result.decision).toBe('CONFIRMED_MATCH');
    expect(result.isActivationBlocked).toBe(true);
    expect(result.isPayoutBlocked).toBe(true);
    expect(result.bestMatch?.listSource).toBe('OFAC_SDN');
    expect(result.bestMatch?.sanctionProgram).toBe('UKRAINE-EO14024');
  });

  it('Step 103.2: detects sanctions alias matches (e.g. Victor But / Viktor Butt for Viktor Anatolyevich Bout)', () => {
    const sdnEntry = OFFICIAL_SANCTIONED_ENTITIES.find(
      (e) => e.primaryName === 'Viktor Anatolyevich Bout'
    )!;

    const matchRes = matchNameAgainstSanctionEntry('Victor But', sdnEntry);
    expect(matchRes.highestScore).toBeGreaterThanOrEqual(0.85);
    expect(matchRes.bestMatchedName).toBe('Victor But');

    const screenRes = screenEntityAgainstSanctions({
      entityName: 'Victor But',
    });

    expect(screenRes.isMatchFound).toBe(true);
    expect(screenRes.isActivationBlocked).toBe(true);
  });

  it('Step 103.3: clears legitimate non-sanctioned business entity with zero false positives', () => {
    const result = screenEntityAgainstSanctions({
      entityName: 'Meridian Global Goods LLC',
    });

    expect(result.isMatchFound).toBe(false);
    expect(result.decision).toBe('CLEARED');
    expect(result.isActivationBlocked).toBe(false);
    expect(result.isPayoutBlocked).toBe(false);
    expect(result.highestSimilarity).toBeLessThan(0.7);
  });

  it('Step 103.4: screens full merchant application and clears when all directors, UBOs, and company are clean', () => {
    const report = screenMerchantApplicationSanctions({
      legalBusinessName: 'Apex Cloud Systems Inc',
      dbaName: 'Apex Cloud',
      directors: ['Alexander Wright', 'Sophia Lin'],
      ubos: ['Alexander Wright', 'Sophia Lin'],
    });

    expect(report.overallDecision).toBe('CLEARED');
    expect(report.isActivationBlocked).toBe(false);
    expect(report.isPayoutBlocked).toBe(false);
    expect(report.flaggedHitsCount).toBe(0);
    expect(report.investigationCaseId).toBeUndefined();
  });

  it('Step 103.5: detects sanctioned individual listed as director or UBO and halts automated activation', () => {
    const report = screenMerchantApplicationSanctions({
      legalBusinessName: 'Global Cargo Logistics LLC',
      directors: ['John Doe', 'Viktor Anatolyevich Bout'], // SANCTIONED DIRECTOR
      ubos: ['John Doe'],
    });

    expect(report.overallDecision).toBe('CONFIRMED_MATCH');
    expect(report.isActivationBlocked).toBe(true);
    expect(report.isPayoutBlocked).toBe(true);
    expect(report.flaggedHitsCount).toBe(1);
    expect(report.investigationCaseId).toBeDefined();
    expect(report.investigationCaseId).toMatch(/^sanct_case_/);

    const hit = report.hits.find((h) => h.entityName === 'Viktor Anatolyevich Bout');
    expect(hit?.result.isMatchFound).toBe(true);
    expect(hit?.result.bestMatch?.listSource).toBe('OFAC_SDN');
  });

  it('Step 103.6: detects UN and EU designated terrorist / paramilitary organizations', () => {
    const unResult = screenEntityAgainstSanctions({
      entityName: 'Al-Qaida International',
    });
    expect(unResult.isMatchFound).toBe(true);
    expect(unResult.bestMatch?.listSource).toBe('UN_CONSOLIDATED');

    const euResult = screenEntityAgainstSanctions({
      entityName: 'PMC Wagner Group',
    });
    expect(euResult.isMatchFound).toBe(true);
    expect(euResult.bestMatch?.listSource).toBe('EU_FSF');
  });
});
