// path: tests/compliance/sanctions-pep-policy.test.ts

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  screenSubjectAgainstWatchlist,
  recordSanctionsDisambiguation,
  SanctionsWatchlistEntry,
  SanctionsScreeningSubject,
} from '@/lib/compliance/sanctions';

describe('Step 086: Sanctions (OFAC/UN/EU/UK HMT) & PEP Screening Policy Implementation', () => {
  describe('Step 086.1: Seed File Verification & Global Policy Coverage', () => {
    it('verifies db/seeds/policies/sanctions-pep.md exists and covers all four major international sanctions lists', () => {
      const seedPath = path.join(process.cwd(), 'db/seeds/policies/sanctions-pep.md');
      expect(fs.existsSync(seedPath)).toBe(true);

      const content = fs.readFileSync(seedPath, 'utf8');

      expect(content).toContain('OFAC Specially Designated Nationals (SDN)');
      expect(content).toContain('United Nations Security Council Consolidated Sanctions List');
      expect(content).toContain('European Union Consolidated Financial Sanctions List');
      expect(content).toContain('UK HM Treasury Office of Financial Sanctions Implementation (OFSI)');
      expect(content).toContain('Cuba, Iran, North Korea, Syria, Russia');
      expect(content).toContain('Politically Exposed Persons (PEP)');
      expect(content).toContain('31 CFR § 501.201');
      expect(content).toContain('ten (10) business days');
      expect(content).toContain('False Positive Disambiguation Protocol');
    });
  });

  describe('Step 086.2: Automated Screening & Matching Engine', () => {
    const mockWatchlist: SanctionsWatchlistEntry[] = [
      {
        id: 'OFAC-SDN-1001',
        source: 'OFAC_SDN',
        fullName: 'Viktor Anatolyevich Petrov',
        aliases: ['Victor Petrov', 'V. A. Petrov'],
        dateOfBirth: '1974-06-15',
        nationality: 'RU',
        sanctionProgram: 'UKRAINE-EO13661',
      },
      {
        id: 'UN-CON-2002',
        source: 'UN_CONSOLIDATED',
        fullName: 'Tariq Mansoor Al-Hashemi',
        aliases: ['Tariq Al-Hashemi'],
        dateOfBirth: '1968-11-20',
        nationality: 'SY',
        sanctionProgram: 'UNSC-RES-1267',
      },
      {
        id: 'PEP-GLO-3003',
        source: 'PEP_GLOBAL',
        fullName: 'Gabriel Santiago Moreno',
        aliases: ['Gabriel Moreno'],
        dateOfBirth: '1981-03-04',
        nationality: 'CO',
        pepTier: 1, // Head of Ministry
      },
    ];

    it('clears compliant individual with zero watchlist hits', () => {
      const cleanSubject: SanctionsScreeningSubject = {
        entityId: 'user_cln_01',
        fullName: 'Hannah Elizabeth Scott',
        dateOfBirth: '1992-08-14',
        nationality: 'US',
        country: 'US',
      };

      const result = screenSubjectAgainstWatchlist(cleanSubject, mockWatchlist);
      expect(result.status).toBe('CLEARED_NO_MATCH');
      expect(result.action).toBe('ACTIVATE_ACCOUNT');
      expect(result.highestMatchScore).toBeLessThan(60);
      expect(result.requiresEdd).toBe(false);
    });

    it('flags true-positive match and triggers immediate asset freeze and block', () => {
      const sanctionedSubject: SanctionsScreeningSubject = {
        entityId: 'user_sdn_02',
        fullName: 'Viktor Anatolyevich Petrov',
        dateOfBirth: '1974-06-15', // Exact match
        nationality: 'RU',
      };

      const result = screenSubjectAgainstWatchlist(sanctionedSubject, mockWatchlist);
      expect(result.status).toBe('CONFIRMED_TRUE_POSITIVE');
      expect(result.action).toBe('FREEZE_AND_BLOCK_ASSETS');
      expect(result.highestMatchScore).toBeGreaterThanOrEqual(85);
      expect(result.hits[0].watchlistEntry.id).toBe('OFAC-SDN-1001');
    });

    it('places potential phonetic name similarity on manual review hold', () => {
      const ambiguousSubject: SanctionsScreeningSubject = {
        entityId: 'user_amb_03',
        fullName: 'Victor Petrov',
        dateOfBirth: '1985-01-01', // Different DOB
        nationality: 'BG', // Different nationality
      };

      const result = screenSubjectAgainstWatchlist(ambiguousSubject, mockWatchlist);
      expect(result.status).toBe('POTENTIAL_MATCH_HOLD');
      expect(result.action).toBe('HOLD_FOR_MANUAL_REVIEW');
    });

    it('identifies Politically Exposed Persons (PEP) and mandates Enhanced Due Diligence', () => {
      const pepSubject: SanctionsScreeningSubject = {
        entityId: 'user_pep_04',
        fullName: 'Gabriel Santiago Moreno',
        dateOfBirth: '1981-03-04',
        nationality: 'CO',
      };

      const result = screenSubjectAgainstWatchlist(pepSubject, mockWatchlist);
      expect(result.requiresEdd).toBe(true);
      expect(result.hits.some((h) => h.isPep)).toBe(true);
      expect(result.action).toBe('HOLD_FOR_MANUAL_REVIEW');
    });
  });

  describe('Step 086.3: False Positive Disambiguation Protocol', () => {
    it('records immutable compliance officer disambiguation decision with SHA-256 fingerprint', () => {
      const disambiguation = recordSanctionsDisambiguation({
        screeningId: 'scr_991823',
        decision: 'RESOLVED_FALSE_POSITIVE',
        rationale:
          'Applicant provided certified passport proving distinct date of birth (1985 vs 1974) and Bulgarian citizenship. Confirmed identity disambiguation against OFAC SDN 1001.',
        complianceOfficerId: 'officer_elena_rostova',
        evidenceDocumentIds: ['file_pass_881', 'file_util_992'],
        clientIp: '198.51.100.88',
      });

      expect(disambiguation.resolutionId).toBeDefined();
      expect(disambiguation.decision).toBe('RESOLVED_FALSE_POSITIVE');
      expect(disambiguation.digitalFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(disambiguation.evidenceDocumentIds).toHaveLength(2);
      expect(disambiguation.complianceOfficerId).toBe('officer_elena_rostova');
    });
  });

  describe('Step 086.4: Public Page Accessibility & Watchlist Source Disclosures', () => {
    it('verifies public policy page exists at app/(public)/legal/sanctions-pep-policy/page.tsx', () => {
      const pagePath = path.join(process.cwd(), 'app/(public)/legal/sanctions-pep-policy/page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);

      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('Sanctions (OFAC / UN / EU / UK HMT) & PEP Screening Policy');
      expect(content).toContain('compliance.officer@kdsolution.it');
      expect(content).toContain('OFAC SDN, UN, EU EEAS, UK OFSI');
      expect(content).toContain('31 CFR § 501.201');
      expect(content).toContain('two (2) business days');
    });
  });
});
