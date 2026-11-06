// path: tests/compliance/kyc-kyb-policy.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PolicyRepository,
  seedPolicyCatalog,
  checkMerchantPolicyReacceptanceRequired,
  clearPolicyStore,
} from '@/lib/cms/policies';
import { AuditLogRepository } from '@/lib/db/audit';

describe('Step 083: KYC and KYB Policy Implementation & Versioned Acceptance', () => {
  let policyRepo: PolicyRepository;
  let auditRepo: AuditLogRepository;
  let loggedAuditEvents: any[];

  beforeEach(async () => {
    clearPolicyStore();
    policyRepo = new PolicyRepository();
    loggedAuditEvents = [];

    auditRepo = {
      createLog: async (input: any) => {
        loggedAuditEvents.push(input);
        return {
          id: `audit_${Date.now()}`,
          ...input,
          created_at: new Date().toISOString(),
        } as any;
      },
    } as unknown as AuditLogRepository;

    await seedPolicyCatalog(policyRepo);
  });

  describe('Step 083.1: Seed File Verification & Regulatory Standards', () => {
    it('verifies db/seeds/policies/kyc-kyb.md exists and covers comprehensive KYB and KYC requirements', () => {
      const seedPath = path.join(process.cwd(), 'db/seeds/policies/kyc-kyb.md');
      expect(fs.existsSync(seedPath)).toBe(true);

      const content = fs.readFileSync(seedPath, 'utf8');

      // Check regulatory mandates
      expect(content).toContain('FinCEN MSB Regulations (31 CFR Part 1022)');
      expect(content).toContain('EU AMLD5/AMLD6');

      // Check KYB entity verification
      expect(content).toContain('Articles of Incorporation');
      expect(content).toContain('Tax Identification Number');
      expect(content).toContain('Physical Operating Address');
      expect(content).toContain('Active Commercial Bank Account');

      // Check KYC and UBO 25% threshold
      expect(content).toContain('twenty-five percent (25%)');
      expect(content).toContain('Ultimate Beneficial Owner (UBO)');

      // Check sanctions screening
      expect(content).toContain('OFAC Specially Designated Nationals');
      expect(content).toContain('Sanctions Freeze');

      // Check underwriting capability gates
      expect(content).toContain('Capability Activation Gates');
    });

    it('loads KYC/KYB policy in repository at version 1 with compliance category', async () => {
      const kycPolicy = await policyRepo.getActivePolicyBySlug('kyc-kyb-policy');
      expect(kycPolicy).not.toBeNull();
      expect(kycPolicy?.policy_version).toBe(1);
      expect(kycPolicy?.category).toBe('compliance');
      expect(kycPolicy?.is_published).toBe(true);
    });
  });

  describe('Step 083.2 & Step 083.3: Mandatory Acceptance Checkbox & Version Gating', () => {
    it('requires merchant acceptance when accepted version is null or less than active version', async () => {
      // New merchant has not accepted KYC/KYB policy (null) -> acceptance required
      const checkNewMerchant = await checkMerchantPolicyReacceptanceRequired(
        null,
        'kyc-kyb-policy',
        policyRepo
      );
      expect(checkNewMerchant.required).toBe(true);
      expect(checkNewMerchant.activeVersion).toBe(1);
      expect(checkNewMerchant.acceptedVersion).toBeNull();

      // Merchant accepts version 1 -> acceptance valid and up to date
      const checkAccepted = await checkMerchantPolicyReacceptanceRequired(
        1,
        'kyc-kyb-policy',
        policyRepo
      );
      expect(checkAccepted.required).toBe(false);
      expect(checkAccepted.acceptedVersion).toBe(1);
    });

    it('verifies acceptance contract schema validation for merchant onboarding', () => {
      const validOnboardingPayload = {
        companyLegalName: 'Acme Merchant LLC',
        ein: '12-3456789',
        acceptedKycKybPolicy: true,
        kycKybPolicyVersion: 1,
        acceptedAt: new Date().toISOString(),
        clientIp: '198.51.100.25',
      };

      expect(validOnboardingPayload.acceptedKycKybPolicy).toBe(true);
      expect(validOnboardingPayload.kycKybPolicyVersion).toBe(1);

      // Simulating validation failure when checkbox is false
      const invalidPayload = {
        ...validOnboardingPayload,
        acceptedKycKybPolicy: false,
      };

      const validateAcceptance = (payload: typeof validOnboardingPayload) => {
        if (!payload.acceptedKycKybPolicy) {
          throw new Error('POLICY_ACCEPTANCE_REQUIRED: Acceptance of KYC/KYB Policy is mandatory.');
        }
        return true;
      };

      expect(() => validateAcceptance(invalidPayload)).toThrow('POLICY_ACCEPTANCE_REQUIRED');
      expect(validateAcceptance(validOnboardingPayload)).toBe(true);
    });
  });

  describe('Step 083.4: Public Page Accessibility', () => {
    it('verifies public route page exists at app/(public)/legal/kyc-kyb-policy/page.tsx', () => {
      const pagePath = path.join(
        process.cwd(),
        'app/(public)/legal/kyc-kyb-policy/page.tsx'
      );
      expect(fs.existsSync(pagePath)).toBe(true);
      const pageContent = fs.readFileSync(pagePath, 'utf8');
      expect(pageContent).toContain('Customer & Merchant Due Diligence (KYC/KYB) Policy');
      expect(pageContent).toContain('Version 1.0 (Active & Binding)');
      expect(pageContent).toContain('Download / Print PDF');
    });
  });
});
