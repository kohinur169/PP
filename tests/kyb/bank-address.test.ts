// path: tests/kyb/bank-address.test.ts

import { describe, it, expect } from 'vitest';
import {
  validateProofOfAddressDate,
  computeNameFuzzySimilarity,
  verifyPayoutBankAccount,
  evaluateAddressAndBankVerification,
  PROOF_OF_ADDRESS_MAX_AGE_DAYS,
} from '@/lib/kyb/bank-address';

describe('Step 097: Proof of Address & Payout Bank Verification Engine', () => {
  const referenceDate = new Date('2026-11-05T00:00:00.000Z');

  describe('Step 097.1: Proof of Address Issue Date Validator (90-Day Freshness Gate)', () => {
    it('accepts utility bill issued 30 days ago', () => {
      const issueDate = new Date(referenceDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      const result = validateProofOfAddressDate(issueDate, referenceDate);

      expect(result.valid).toBe(true);
      expect(result.ageDays).toBe(30);
      expect(result.maxAllowedDays).toBe(PROOF_OF_ADDRESS_MAX_AGE_DAYS);
      expect(result.reason).toBeUndefined();
    });

    it('accepts utility bill issued 89 days ago (right at boundary)', () => {
      const issueDate = new Date(referenceDate.getTime() - 89 * 24 * 60 * 60 * 1000);
      const result = validateProofOfAddressDate(issueDate, referenceDate);

      expect(result.valid).toBe(true);
      expect(result.ageDays).toBe(89);
    });

    it('rejects utility bill issued 120 days ago and requests fresh proof within 90 days', () => {
      const issueDate = new Date(referenceDate.getTime() - 120 * 24 * 60 * 60 * 1000);
      const result = validateProofOfAddressDate(issueDate, referenceDate);

      expect(result.valid).toBe(false);
      expect(result.ageDays).toBe(120);
      expect(result.reason).toContain('exceeding the regulatory 90-day freshness limit');
    });

    it('rejects utility bill with future timestamp', () => {
      const futureDate = new Date(referenceDate.getTime() + 5 * 24 * 60 * 60 * 1000);
      const result = validateProofOfAddressDate(futureDate, referenceDate);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('cannot be in the future');
    });

    it('rejects invalid or malformed date string', () => {
      const result = validateProofOfAddressDate('invalid-date', referenceDate);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid or unparseable');
    });
  });

  describe('Step 097.2: Legal Business Name & Payout Bank Fuzzy Matching', () => {
    it('computes exact 1.0 similarity for identical legal names', () => {
      const similarity = computeNameFuzzySimilarity(
        'Apex Cloud Systems LLC',
        'Apex Cloud Systems LLC'
      );
      expect(similarity).toBe(1.0);
    });

    it('normalizes corporate suffixes and matches high similarity', () => {
      const similarity = computeNameFuzzySimilarity(
        'Apex Cloud Systems Incorporated',
        'Apex Cloud Systems Inc'
      );
      expect(similarity).toBeGreaterThanOrEqual(0.9);
    });

    it('yields low similarity for completely unrelated corporate entities', () => {
      const similarity = computeNameFuzzySimilarity(
        'Apex Cloud Systems Inc',
        'Blue Horizon Logistics LLC'
      );
      expect(similarity).toBeLessThan(0.4);
    });
  });

  describe('Step 097.3: Payout Bank Account Verification & Personal Account Detection', () => {
    it('auto-approves bank account registered strictly under corporate legal business name', () => {
      const result = verifyPayoutBankAccount({
        legalBusinessName: 'Apex Cloud Systems LLC',
        entityType: 'llc',
        bankAccountHolderName: 'Apex Cloud Systems LLC',
        routingNumber: '021000021',
        accountNumber: '1234567890',
      });

      expect(result.decision).toBe('AUTO_APPROVED');
      expect(result.similarityScore).toBe(1.0);
      expect(result.isPersonalAccountSuspected).toBe(false);
    });

    it('rejects personal bank account for corporate merchant entity (e.g. John Doe instead of Apex Cloud Systems LLC)', () => {
      const result = verifyPayoutBankAccount({
        legalBusinessName: 'Apex Cloud Systems LLC',
        entityType: 'llc',
        bankAccountHolderName: 'John Michael Doe',
        routingNumber: '021000021',
        accountNumber: '1234567890',
      });

      expect(result.decision).toBe('REJECTED');
      expect(result.isPersonalAccountSuspected).toBe(true);
      expect(result.reasons[0]).toContain('Personal bank account detected for corporate entity');
    });

    it('routes partial corporate name match to compliance officer for manual visual review', () => {
      const result = verifyPayoutBankAccount({
        legalBusinessName: 'Apex Cloud Systems International LLC',
        entityType: 'llc',
        bankAccountHolderName: 'Apex Cloud Systems LLC', // Missing "International"
        routingNumber: '021000021',
        accountNumber: '1234567890',
      });

      expect(result.decision).toBe('MANUAL_REVIEW');
      expect(result.similarityScore).toBeGreaterThanOrEqual(0.7);
      expect(result.similarityScore).toBeLessThan(0.88);
      expect(result.reasons[0]).toContain('Routed to Compliance Officer for manual visual check');
    });

    it('permits individual bank account holder name for sole proprietorship matching DBA', () => {
      const result = verifyPayoutBankAccount({
        legalBusinessName: 'Jane Doe',
        dbaName: 'Jane Doe Consulting',
        entityType: 'sole_proprietorship',
        bankAccountHolderName: 'Jane Doe',
        routingNumber: '021000021',
        accountNumber: '1234567890',
      });

      expect(result.decision).toBe('AUTO_APPROVED');
      expect(result.isPersonalAccountSuspected).toBe(false);
    });
  });

  describe('Step 097.4: Combined Address and Bank Account Verification Gate', () => {
    it('grants full verification when utility bill is fresh (<= 90 days) and bank account matches', () => {
      const freshDate = new Date(referenceDate.getTime() - 45 * 24 * 60 * 60 * 1000); // 45 days old

      const report = evaluateAddressAndBankVerification({
        addressIssueDate: freshDate,
        legalBusinessName: 'Meridian Global Goods Inc',
        entityType: 'corporation',
        bankAccountHolderName: 'Meridian Global Goods Inc',
        routingNumber: '021000021',
        accountNumber: '9876543210',
        referenceDate,
      });

      expect(report.isFullyVerified).toBe(true);
      expect(report.requiresManualReview).toBe(false);
      expect(report.summary).toContain('successfully verified');
    });

    it('blocks verification and flags manual review when bank name is a partial match', () => {
      const freshDate = new Date(referenceDate.getTime() - 15 * 24 * 60 * 60 * 1000);

      const report = evaluateAddressAndBankVerification({
        addressIssueDate: freshDate,
        legalBusinessName: 'Meridian Global Logistics Enterprises Inc',
        entityType: 'corporation',
        bankAccountHolderName: 'Meridian Global Logistics Inc',
        routingNumber: '021000021',
        accountNumber: '9876543210',
        referenceDate,
      });

      expect(report.isFullyVerified).toBe(false);
      expect(report.requiresManualReview).toBe(true);
      expect(report.summary).toContain('Compliance Officer manual sign-off');
    });

    it('blocks verification when address proof is 120 days old even if bank matches perfectly', () => {
      const staleDate = new Date(referenceDate.getTime() - 120 * 24 * 60 * 60 * 1000);

      const report = evaluateAddressAndBankVerification({
        addressIssueDate: staleDate,
        legalBusinessName: 'Meridian Global Goods Inc',
        entityType: 'corporation',
        bankAccountHolderName: 'Meridian Global Goods Inc',
        routingNumber: '021000021',
        accountNumber: '9876543210',
        referenceDate,
      });

      expect(report.isFullyVerified).toBe(false);
      expect(report.requiresManualReview).toBe(false);
      expect(report.summary).toContain('exceeding the regulatory 90-day freshness limit');
    });
  });
});
