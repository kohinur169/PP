// path: tests/compliance/privacy-pci-policy.test.ts

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  submitDataSubjectRequest,
  evaluateDataRetentionExemption,
} from '@/lib/compliance/privacy';

describe('Step 089: Data Privacy (GDPR, CCPA) & PCI-DSS Compliance Policy Implementation', () => {
  describe('Step 089.1: Seed File Verification & Policy Standards', () => {
    it('verifies db/seeds/policies/privacy-pci.md exists and covers SAQ A, AES-256-GCM, and 7-year retention', () => {
      const seedPath = path.join(process.cwd(), 'db/seeds/policies/privacy-pci.md');
      expect(fs.existsSync(seedPath)).toBe(true);

      const content = fs.readFileSync(seedPath, 'utf8');

      expect(content).toContain('SAQ A');
      expect(content).toContain('Provider-Hosted Fields Isolation');
      expect(content).toContain('AES-256-GCM');
      expect(content).toContain('96-bit');
      expect(content).toContain('128-bit');
      expect(content).toContain('seven (7) year statutory retention');
      expect(content).toContain('GDPR Article 17(3)(b)');
      expect(content).toContain('privacy.officer@kdsolution.it');
    });
  });

  describe('Step 089.2: Data Subject Request (DSR) Registration Engine', () => {
    it('registers valid GDPR erasure request with 30-day response deadline and SHA-256 fingerprint', () => {
      const dsr = submitDataSubjectRequest({
        requesterEmail: 'clara.oswald@example.eu',
        requesterFullName: 'Clara Oswald',
        requestType: 'ERASURE',
        jurisdiction: 'GDPR_EU',
        clientIp: '198.51.100.22',
        requestDetails: 'Please purge all marketing and ancillary tracking data.',
      });

      expect(dsr.requestId).toBeDefined();
      expect(dsr.digitalFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(dsr.responseDeadline).toBeDefined();

      const submitted = new Date(dsr.submittedAt);
      const deadline = new Date(dsr.responseDeadline);
      const diffDays = Math.round((deadline.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(30);
    });
  });

  describe('Step 089.3: Statutory Financial Retention Exemption Evaluator', () => {
    it('blocks immediate erasure for merchants with financial transactions due to 7-year statutory obligation', () => {
      const result = evaluateDataRetentionExemption({
        requestType: 'ERASURE',
        hasFinancialTransactions: true,
      });

      expect(result.canEraseImmediately).toBe(false);
      expect(result.statutoryRetentionYears).toBe(7);
      expect(result.legalBasisExemption).toContain('GDPR Article 17(3)(b)');
      expect(result.policyConclusion).toContain('mandatory seven (7) year statutory retention');
    });

    it('approves immediate erasure for non-transactional leads or newsletter subscribers', () => {
      const result = evaluateDataRetentionExemption({
        requestType: 'ERASURE',
        hasFinancialTransactions: false,
      });

      expect(result.canEraseImmediately).toBe(true);
      expect(result.statutoryRetentionYears).toBe(0);
      expect(result.legalBasisExemption).toBe('N/A');
    });
  });

  describe('Step 089.4: Public Page Accessibility & Privacy Officer Contact', () => {
    it('verifies public policy page exists at app/(public)/legal/privacy-pci-policy/page.tsx', () => {
      const pagePath = path.join(process.cwd(), 'app/(public)/legal/privacy-pci-policy/page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);

      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('Data Privacy (GDPR, CCPA) & PCI-DSS Compliance Policy');
      expect(content).toContain('privacy.officer@kdsolution.it');
      expect(content).toContain('SAQ A (Zero Card Data Storage)');
      expect(content).toContain('Pre-Upload AES-256-GCM Envelope Encryption');
      expect(content).toContain('7-Year Statutory Financial & Tax Archive');
    });
  });
});
