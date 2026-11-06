// path: tests/compliance/dedup.test.ts

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeProfileSignalHashes,
  checkDuplicateSignals,
  MerchantProfileSignals,
  StoredSignalRecord,
  GENERIC_DUPLICATE_APPLICANT_MESSAGE,
} from '@/lib/compliance/dedup';

describe('Step 091: One Person, One Account Multi-Signal Duplicate Detection Engine', () => {
  const dummyKey = Buffer.from('test_dedup_secret_key_32_bytes_long!', 'utf8');

  const baseProfile: MerchantProfileSignals = {
    email: 'marcus.vance@example.com',
    phone: '+1 (555) 234-5678',
    idDocumentNumber: 'P123-456-789',
    taxId: '12-3456789',
    bankRoutingNumber: '021000021',
    bankAccountNumber: '123456789012',
    legalFullName: 'Marcus Aurelius Vance',
    dateOfBirth: '1980-05-12',
  };

  describe('Step 091.1: Multi-Signal Blind Index Generation Across 6 Vectors', () => {
    it('computes 6 deterministic HMAC-SHA256 blind index hashes for merchant profile', () => {
      const hashes = computeProfileSignalHashes(baseProfile, dummyKey);

      expect(hashes.email).toMatch(/^[a-f0-9]{64}$/);
      expect(hashes.phone).toMatch(/^[a-f0-9]{64}$/);
      expect(hashes.id_document).toMatch(/^[a-f0-9]{64}$/);
      expect(hashes.tax_id).toMatch(/^[a-f0-9]{64}$/);
      expect(hashes.bank_account_fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(hashes.name_dob).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces identical blind index for differently formatted identical inputs', () => {
      const formattedProfile: MerchantProfileSignals = {
        ...baseProfile,
        email: '  MARCUS.VANCE@EXAMPLE.COM  ',
        phone: '15552345678',
        idDocumentNumber: ' p123456789. ',
        taxId: ' 123456789 ',
      };

      const hashes1 = computeProfileSignalHashes(baseProfile, dummyKey);
      const hashes2 = computeProfileSignalHashes(formattedProfile, dummyKey);

      expect(hashes2.email).toBe(hashes1.email);
      expect(hashes2.id_document).toBe(hashes1.id_document);
      expect(hashes2.tax_id).toBe(hashes1.tax_id);
    });
  });

  describe('Step 091.2: Duplicate Signal Scanning & Automated Enforcement', () => {
    it('approves clean merchant profile with zero matching stored signals', () => {
      const emptyPool: StoredSignalRecord[] = [];
      const result = checkDuplicateSignals(baseProfile, emptyPool, dummyKey);

      expect(result.isDuplicate).toBe(false);
      expect(result.action).toBe('ALLOW_CREATION');
      expect(result.status).toBe('eligible');
      expect(result.matchedSignals).toHaveLength(0);
      expect(result.applicantFacingMessage).toBeUndefined();
    });

    it('blocks creation and flags for compliance review when national ID matches existing account', () => {
      const hashes = computeProfileSignalHashes(baseProfile, dummyKey);

      const existingSignals: StoredSignalRecord[] = [
        {
          id: 'sig_existing_01',
          tenantId: 'tenant_01',
          companyId: 'comp_prev_owner',
          userId: 'user_prev_owner',
          signalType: 'id_document',
          signalValueHash: hashes.id_document, // MATCH!
          status: 'active',
        },
      ];

      // New applicant with different email and phone, but same National ID/Passport
      const newApplicantWithSameId: MerchantProfileSignals = {
        ...baseProfile,
        email: 'alias.vance@othercompany.com',
        phone: '+1 (555) 999-8888',
      };

      const result = checkDuplicateSignals(newApplicantWithSameId, existingSignals, dummyKey);

      expect(result.isDuplicate).toBe(true);
      expect(result.action).toBe('BLOCK_AND_FLAG_REVIEW');
      expect(result.status).toBe('duplicate_review');
      expect(result.matchedSignals).toHaveLength(1);
      expect(result.matchedSignals[0].signalType).toBe('id_document');
      expect(result.applicantFacingMessage).toBe(GENERIC_DUPLICATE_APPLICANT_MESSAGE);
      expect(result.internalComplianceAlert).toContain('CRITICAL DEDUP ALERT');
    });

    it('blocks creation when bank account fingerprint (routing + account) matches existing business', () => {
      const hashes = computeProfileSignalHashes(baseProfile, dummyKey);

      const existingSignals: StoredSignalRecord[] = [
        {
          id: 'sig_bank_01',
          tenantId: 'tenant_01',
          companyId: 'comp_bank_owner',
          signalType: 'bank_account_fingerprint',
          signalValueHash: hashes.bank_account_fingerprint, // MATCH!
          status: 'active',
        },
      ];

      const result = checkDuplicateSignals(baseProfile, existingSignals, dummyKey);

      expect(result.isDuplicate).toBe(true);
      expect(result.action).toBe('BLOCK_AND_FLAG_REVIEW');
      expect(result.matchedSignals[0].signalType).toBe('bank_account_fingerprint');
    });

    it('blocks creation when tax ID matches existing legal entity', () => {
      const hashes = computeProfileSignalHashes(baseProfile, dummyKey);

      const existingSignals: StoredSignalRecord[] = [
        {
          id: 'sig_tax_01',
          tenantId: 'tenant_01',
          companyId: 'comp_tax_owner',
          signalType: 'tax_id',
          signalValueHash: hashes.tax_id, // MATCH!
          status: 'active',
        },
      ];

      const result = checkDuplicateSignals(baseProfile, existingSignals, dummyKey);

      expect(result.isDuplicate).toBe(true);
      expect(result.action).toBe('BLOCK_AND_FLAG_REVIEW');
      expect(result.matchedSignals[0].signalType).toBe('tax_id');
    });
  });

  describe('Step 091.3: SQL Migration Verification & RLS Enforcement', () => {
    it('verifies db/migrations/027_duplicate_signals.sql exists and enforces RLS', () => {
      const sqlPath = path.join(process.cwd(), 'db/migrations/027_duplicate_signals.sql');
      expect(fs.existsSync(sqlPath)).toBe(true);

      const content = fs.readFileSync(sqlPath, 'utf8');
      expect(content).toContain('CREATE TABLE IF NOT EXISTS public.duplicate_signals');
      expect(content).toContain('ALTER TABLE public.duplicate_signals ENABLE ROW LEVEL SECURITY');
      expect(content).toContain('ALTER TABLE public.duplicate_signals FORCE ROW LEVEL SECURITY');
      expect(content).toContain('duplicate_signals_tenant_isolation');
    });
  });
});
