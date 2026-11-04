// path: tests/compliance/ubo-policy.test.ts

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateUboDeclaration,
  generateUboDeclarationCertificate,
  UboOwnerInput,
} from '@/lib/compliance/ubo';

describe('Step 084: Ultimate Beneficial Ownership (UBO >= 25%) Policy Implementation & Attestation', () => {
  describe('Step 084.1: Seed File Verification & Regulatory Policy Coverage', () => {
    it('verifies db/seeds/policies/ubo.md exists and covers FinCEN CDD 25% ownership and control prongs', () => {
      const seedPath = path.join(process.cwd(), 'db/seeds/policies/ubo.md');
      expect(fs.existsSync(seedPath)).toBe(true);

      const content = fs.readFileSync(seedPath, 'utf8');

      expect(content).toContain('FinCEN Customer Due Diligence (CDD) Final Rule (31 CFR § 1010.230)');
      expect(content).toContain('The 25% Ownership Prong');
      expect(content).toContain('twenty-five percent (25%)');
      expect(content).toContain('The Executive Control Prong');
      expect(content).toContain('Prohibited Nominee & Bearer Share Arrangements');
      expect(content).toContain('Ongoing Sanctions Screening');
    });
  });

  describe('Step 084.2: Onboarding Validation Rules for Beneficial Ownership', () => {
    it('approves compliant UBO declaration with verified >= 25% owners and designated control person', () => {
      const compliantOwners: UboOwnerInput[] = [
        {
          fullName: 'Alice Johnson',
          equityPercentage: 51,
          dateOfBirth: '1982-04-12',
          nationality: 'US',
          taxId: '***-**-1234',
          isControlPerson: true,
          hasPhotoId: true,
          hasLivenessVerified: true,
        },
        {
          fullName: 'Robert Vance',
          equityPercentage: 30,
          dateOfBirth: '1978-09-23',
          nationality: 'GB',
          hasPhotoId: true,
          hasLivenessVerified: true,
        },
        {
          fullName: 'Minority Employee Pool',
          equityPercentage: 19,
          dateOfBirth: '2000-01-01',
          nationality: 'US',
          // < 25% does not require individual UBO biometric gate
          hasPhotoId: false,
          hasLivenessVerified: false,
        },
      ];

      const result = validateUboDeclaration(compliantOwners);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.uboCount).toBe(2);
      expect(result.controlPersonDeclared).toBe(true);
      expect(result.totalUboEquity).toBe(81);
    });

    it('blocks submission if any >= 25% owner lacks government photo ID', () => {
      const missingIdOwners: UboOwnerInput[] = [
        {
          fullName: 'Carlos Mendez',
          equityPercentage: 40,
          dateOfBirth: '1985-02-15',
          nationality: 'ES',
          isControlPerson: true,
          hasPhotoId: false, // VIOLATION
          hasLivenessVerified: true,
        },
      ];

      const result = validateUboDeclaration(missingIdOwners);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Government photo ID verification is mandatory'))).toBe(true);
    });

    it('blocks submission if any >= 25% owner lacks biometric selfie liveness verification', () => {
      const missingLivenessOwners: UboOwnerInput[] = [
        {
          fullName: 'Elena Rostova',
          equityPercentage: 50,
          dateOfBirth: '1990-11-08',
          nationality: 'DE',
          isControlPerson: true,
          hasPhotoId: true,
          hasLivenessVerified: false, // VIOLATION
        },
      ];

      const result = validateUboDeclaration(missingLivenessOwners);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Biometric selfie liveness challenge verification is mandatory'))).toBe(true);
    });

    it('blocks submission if no executive control person is declared', () => {
      const noControlOwners: UboOwnerInput[] = [
        {
          fullName: 'Investor Trust Alpha',
          equityPercentage: 60,
          dateOfBirth: '1970-01-01',
          nationality: 'US',
          isControlPerson: false, // No control person
          hasPhotoId: true,
          hasLivenessVerified: true,
        },
      ];

      const result = validateUboDeclaration(noControlOwners);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Control Prong'))).toBe(true);
    });

    it('blocks submission if total declared equity exceeds 100%', () => {
      const overAllocatedOwners: UboOwnerInput[] = [
        {
          fullName: 'Owner A',
          equityPercentage: 60,
          dateOfBirth: '1980-01-01',
          nationality: 'US',
          isControlPerson: true,
          hasPhotoId: true,
          hasLivenessVerified: true,
        },
        {
          fullName: 'Owner B',
          equityPercentage: 50, // 60 + 50 = 110%
          dateOfBirth: '1981-01-01',
          nationality: 'US',
          hasPhotoId: true,
          hasLivenessVerified: true,
        },
      ];

      const result = validateUboDeclaration(overAllocatedOwners);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exceeds the 100% maximum threshold'))).toBe(true);
    });
  });

  describe('Step 084.3: Cryptographic UBO Declaration Certificate Generation', () => {
    it('generates an immutable signed UBO declaration certificate with SHA-256 fingerprint', () => {
      const owners: UboOwnerInput[] = [
        {
          fullName: 'Dr. Evelyn Reed',
          equityPercentage: 75,
          dateOfBirth: '1979-05-18',
          nationality: 'US',
          isControlPerson: true,
          hasPhotoId: true,
          hasLivenessVerified: true,
        },
      ];

      const cert = generateUboDeclarationCertificate({
        companyLegalName: 'Reed Medical Instruments Inc.',
        companyTaxId: '84-9128371',
        owners,
        signedBy: 'Dr. Evelyn Reed',
        signerTitle: 'Chief Executive Officer',
        clientIp: '198.51.100.88',
      });

      expect(cert.certificateId).toBeDefined();
      expect(cert.digitalFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(cert.companyLegalName).toBe('Reed Medical Instruments Inc.');
      expect(cert.totalUboEquity).toBe(75);
      expect(cert.legalAttestation).toContain('FinCEN CDD Rule (31 CFR § 1010.230)');
      expect(cert.legalAttestation).toContain('penalty of perjury');
    });
  });

  describe('Step 084.4: Public Page Accessibility', () => {
    it('verifies public policy page exists at app/(public)/legal/ubo-policy/page.tsx', () => {
      const pagePath = path.join(process.cwd(), 'app/(public)/legal/ubo-policy/page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);

      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('Ultimate Beneficial Ownership (UBO ≥ 25%) Policy');
      expect(content).toContain('FinCEN CDD Rule 31 CFR § 1010.230');
      expect(content).toContain('The 25% Ownership Prong');
      expect(content).toContain('The Executive Control Prong');
    });
  });
});
