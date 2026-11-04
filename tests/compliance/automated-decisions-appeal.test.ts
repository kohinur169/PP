// path: tests/compliance/automated-decisions-appeal.test.ts

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  submitAdverseDecisionAppeal,
  addBusinessDays,
} from '@/lib/compliance/appeals';

describe('Step 090: Automated Decision Review & Human Appeal Rights Policy Implementation', () => {
  describe('Step 090.1: Seed File Verification & Regulatory Rights Coverage', () => {
    it('verifies db/seeds/policies/automated-decisions.md exists and covers GDPR Art 22 and appeal procedures', () => {
      const seedPath = path.join(process.cwd(), 'db/seeds/policies/automated-decisions.md');
      expect(fs.existsSync(seedPath)).toBe(true);

      const content = fs.readFileSync(seedPath, 'utf8');

      expect(content).toContain('GDPR Article 22');
      expect(content).toContain('no merchant account is permanently terminated, barred, or placed on indefinite hold solely by automated algorithms');
      expect(content).toContain('Fourteen (14) Day Appeal Window');
      expect(content).toContain('Five (5) Business Day Determination SLA');
      expect(content).toContain('Chief Executive Officer Escalation');
      expect(content).toContain('/legal/appeal');
    });
  });

  describe('Step 090.2: Appeal Registration Engine & 14-Day Gating', () => {
    it('approves timely appeal submitted within 14 calendar days and computes 5-business-day SLA', () => {
      const now = new Date('2026-11-04T12:00:00.000Z');
      const decisionDate = '2026-11-01'; // 3 days ago

      const result = submitAdverseDecisionAppeal(
        {
          companyId: 'comp_1120',
          merchantLegalName: 'Aero Dynamics Logistics Inc',
          contactEmail: 'legal@aerodynamics.com',
          decisionReferenceId: 'DEC-2026-4401',
          decisionType: 'ONBOARDING_REJECTION',
          adverseDecisionDate: decisionDate,
          groundsForAppeal:
            'Automated identity verification flagged a false positive middle name variation against incorporation filings.',
          supplementalEvidenceUrls: ['https://storage.kdsolution.it/files/incorp-cert.pdf'],
          clientIp: '198.51.100.33',
        },
        now
      );

      expect(result.status).toBe('SUBMITTED_PENDING_REVIEW');
      expect(result.appealId).toBeDefined();
      expect(result.digitalFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(result.rejectionReason).toBeUndefined();

      // Wednesday Nov 4 + 5 business days -> Wednesday Nov 11
      const deadline = new Date(result.slaDeterminationDeadline);
      expect(deadline.getDay()).not.toBe(0); // Not Sunday
      expect(deadline.getDay()).not.toBe(6); // Not Saturday
    });

    it('rejects appeal submitted past the 14-day appeal window', () => {
      const now = new Date('2026-11-20T12:00:00.000Z');
      const decisionDate = '2026-11-01'; // 19 days ago (> 14 days)

      const result = submitAdverseDecisionAppeal(
        {
          companyId: 'comp_1120',
          merchantLegalName: 'Late Submissions Corp',
          contactEmail: 'contact@late.com',
          decisionReferenceId: 'DEC-2026-1100',
          decisionType: 'GATEWAY_VELOCITY_HOLD',
          adverseDecisionDate: decisionDate,
          groundsForAppeal: 'We forgot to appeal on time due to executive travel.',
          clientIp: '198.51.100.33',
        },
        now
      );

      expect(result.status).toBe('REJECTED_EXPIRED_WINDOW');
      expect(result.rejectionReason).toContain('fourteen (14) calendar days');
    });
  });

  describe('Step 090.3: Business Days Calculation Utility', () => {
    it('correctly skips weekends when adding 5 business days', () => {
      // Friday Nov 6, 2026
      const friday = new Date('2026-11-06T10:00:00.000Z');
      const plus5 = addBusinessDays(friday, 5);

      // +1 Mon Nov 9, +2 Tue Nov 10, +3 Wed Nov 11, +4 Thu Nov 12, +5 Fri Nov 13
      expect(plus5.toISOString().split('T')[0]).toBe('2026-11-13');
    });
  });

  describe('Step 090.4: Public Routes Verification', () => {
    it('verifies public policy page exists at app/(public)/legal/automated-decisions-appeal/page.tsx', () => {
      const pagePath = path.join(process.cwd(), 'app/(public)/legal/automated-decisions-appeal/page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);

      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('Automated Decision Review & Human Appeal Rights Policy');
      expect(content).toContain('GDPR Article 22');
      expect(content).toContain('14 Calendar Days');
      expect(content).toContain('5 Business Days');
      expect(content).toContain('/legal/appeal');
    });

    it('verifies public appeal submission form exists at app/(public)/legal/appeal/page.tsx', () => {
      const pagePath = path.join(process.cwd(), 'app/(public)/legal/appeal/page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);

      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('Adverse Algorithmic Decision Appeal Portal');
      expect(content).toContain('Merchant Company Legal Name');
      expect(content).toContain('Decision Reference ID');
      expect(content).toContain('Detailed Grounds for Appeal');
    });
  });
});
