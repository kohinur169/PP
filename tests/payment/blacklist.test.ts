// path: tests/payment/blacklist.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isCardBlacklisted,
  assertCardNotBlacklisted,
  addCardToBlacklist,
  removeCardFromBlacklist,
  listBlacklistedCards,
  resetBlacklistStore,
  BlacklistedCardError,
} from '@/lib/payment/blacklist';

describe('Global Card Token & Provider Fingerprint Blacklist Filter (Step 137)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const superAdminUserId = '99999999-9999-4999-8999-999999999999';
  const superAdminEmail = 'admin@platform.com';
  const testCardFingerprint = 'card_fingerprint_stolen_visa_882910';

  beforeEach(() => {
    resetBlacklistStore();
  });

  describe('Adding Cards to Blacklist (Step 137.1 & 137.3)', () => {
    it('successfully adds card fingerprint to blacklist with mandatory justification notes', async () => {
      const record = await addCardToBlacklist({
        tenantId,
        cardFingerprint: testCardFingerprint,
        reason: 'Confirmed stolen card reported by issuing bank fraud department',
        category: 'stolen_card',
        addedByUserId: superAdminUserId,
        addedByEmail: superAdminEmail,
      });

      expect(record.id).toBeDefined();
      expect(record.cardFingerprint).toBe(testCardFingerprint.toLowerCase());
      expect(record.category).toBe('stolen_card');
      expect(record.isActive).toBe(true);

      const check = await isCardBlacklisted(testCardFingerprint);
      expect(check.isBlacklisted).toBe(true);
      expect(check.record?.reason).toContain('Confirmed stolen card');
    });

    it('rejects attempt to add card without adequate justification (minimum 5 characters)', async () => {
      await expect(
        addCardToBlacklist({
          tenantId,
          cardFingerprint: testCardFingerprint,
          reason: 'bad', // Too short
          addedByUserId: superAdminUserId,
        })
      ).rejects.toThrow(/minimum 5 characters/);
    });
  });

  describe('Pre-Charge Blacklist Guard (Step 137.2 & 137.4)', () => {
    it('instantly rejects transaction for blacklisted card with BlacklistedCardError (HTTP 403)', async () => {
      await addCardToBlacklist({
        tenantId,
        cardFingerprint: testCardFingerprint,
        reason: 'Excessive fraudulent chargebacks',
        category: 'excessive_chargebacks',
        addedByUserId: superAdminUserId,
      });

      await expect(assertCardNotBlacklisted(testCardFingerprint)).rejects.toThrow(
        BlacklistedCardError
      );

      try {
        await assertCardNotBlacklisted(testCardFingerprint);
      } catch (err) {
        expect(err).toBeInstanceOf(BlacklistedCardError);
        const blacklistErr = err as BlacklistedCardError;
        expect(blacklistErr.code).toBe('CARD_BLACKLISTED');
        expect(blacklistErr.httpStatus).toBe(403);
        expect(blacklistErr.category).toBe('excessive_chargebacks');
        expect(blacklistErr.cardFingerprint).toBe(testCardFingerprint);
      }
    });

    it('allows clean non-blacklisted cards to pass through without error', async () => {
      await expect(
        assertCardNotBlacklisted('clean_card_fingerprint_visa_1234')
      ).resolves.toBeUndefined();
    });

    it('handles null or empty fingerprint gracefully without error', async () => {
      const check = await isCardBlacklisted('');
      expect(check.isBlacklisted).toBe(false);
      await expect(assertCardNotBlacklisted(undefined)).resolves.toBeUndefined();
    });
  });

  describe('Super Admin Unblacklisting & Listing (Step 137.3)', () => {
    it('removes card from active blacklist with mandatory justification notes', async () => {
      await addCardToBlacklist({
        tenantId,
        cardFingerprint: testCardFingerprint,
        reason: 'Reported stolen by customer',
        category: 'stolen_card',
        addedByUserId: superAdminUserId,
      });

      // Confirm currently blacklisted
      expect((await isCardBlacklisted(testCardFingerprint)).isBlacklisted).toBe(true);

      // Unblacklist
      const unblocked = await removeCardFromBlacklist({
        tenantId,
        cardFingerprint: testCardFingerprint,
        removedByUserId: superAdminUserId,
        justification: 'False positive confirmed by bank review; card re-authorized',
      });

      expect(unblocked).toBe(true);

      // Check card is no longer blacklisted
      const checkAfter = await isCardBlacklisted(testCardFingerprint);
      expect(checkAfter.isBlacklisted).toBe(false);
      await expect(assertCardNotBlacklisted(testCardFingerprint)).resolves.toBeUndefined();
    });

    it('lists all active blacklisted cards filtering out unblocked ones', async () => {
      await addCardToBlacklist({
        tenantId,
        cardFingerprint: 'card_active_1',
        reason: 'Fraud botnet attack',
        category: 'fraud',
        addedByUserId: superAdminUserId,
      });

      await addCardToBlacklist({
        tenantId,
        cardFingerprint: 'card_active_2',
        reason: 'Sanction list match',
        category: 'compliance_sanction',
        addedByUserId: superAdminUserId,
      });

      const listBefore = await listBlacklistedCards();
      expect(listBefore.length).toBe(2);

      // Remove card_active_1
      await removeCardFromBlacklist({
        tenantId,
        cardFingerprint: 'card_active_1',
        removedByUserId: superAdminUserId,
        justification: 'Cardholder verified identity and cleared KYC',
      });

      const activeList = await listBlacklistedCards({ activeOnly: true });
      expect(activeList.length).toBe(1);
      expect(activeList[0]?.cardFingerprint).toBe('card_active_2');
    });
  });
});
