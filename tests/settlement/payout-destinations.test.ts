// path: tests/settlement/payout-destinations.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateAbaRoutingNumber,
  validateIbanMod97,
  validateSwiftBic,
  registerAchDestination,
  registerSepaDestination,
  registerWireDestination,
  registerPayoneerDestination,
  registerCardOctDestination,
  decryptDestinationDetails,
  resetPayoutDestinationsStore,
} from '@/lib/settlement/payout-destinations';

describe('Payout Destination Validation Engine (Step 175)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    resetPayoutDestinationsStore();
  });

  describe('Routing & Checksum Algorithms', () => {
    it('validates ABA routing transit numbers using Federal Reserve checksum', () => {
      expect(validateAbaRoutingNumber('121000358')).toBe(true); // Bank of America CA
      expect(validateAbaRoutingNumber('021000021')).toBe(true); // JPMorgan Chase NY
      expect(validateAbaRoutingNumber('111000026')).toBe(false); // Bad checksum
      expect(validateAbaRoutingNumber('12345')).toBe(false); // Incorrect length
    });

    it('validates IBAN strings using ISO 7064 Mod-97 checksum', () => {
      // Valid German IBAN
      expect(validateIbanMod97('DE89370400440532013000')).toBe(true);
      // Altered checksum digit -> invalid
      expect(validateIbanMod97('DE88370400440532013000')).toBe(false);
      // Malformed format
      expect(validateIbanMod97('INVALID_IBAN_123')).toBe(false);
    });

    it('validates ISO 9362 SWIFT/BIC codes', () => {
      expect(validateSwiftBic('CHASUS33')).toBe(true);
      expect(validateSwiftBic('DEUTDEDDFXX')).toBe(true);
      expect(validateSwiftBic('INVALID_SWIFT_TOO_LONG_12345')).toBe(false);
    });
  });

  describe('ACH Destination Registration & Domain Key Encryption', () => {
    it('validates, encrypts and masks valid ACH account', async () => {
      const rec = await registerAchDestination({
        tenantId,
        companyId,
        ach: {
          routingNumber: '121000358',
          accountNumber: '9876543210',
          accountType: 'checking',
          beneficiaryName: 'Acme Corp LLC',
        },
      });

      expect(rec.destinationType).toBe('ach');
      expect(rec.maskedAccountIdentifier).toBe('••••3210');
      expect(rec.isVerified).toBe(true);
      expect(rec.validationStatus).toBe('valid');

      // Verify domain key decryption
      const decrypted = decryptDestinationDetails(rec.encryptedDetails);
      expect(decrypted['routingNumber']).toBe('121000358');
      expect(decrypted['accountNumber']).toBe('9876543210');
    });

    it('throws error when ABA routing checksum fails', async () => {
      await expect(
        registerAchDestination({
          tenantId,
          companyId,
          ach: {
            routingNumber: '123456789', // Invalid checksum
            accountNumber: '9876543210',
            accountType: 'checking',
            beneficiaryName: 'Acme Corp LLC',
          },
        })
      ).rejects.toThrow(/Invalid ABA routing transit number checksum/);
    });
  });

  describe('SEPA & Wire Destination Registration', () => {
    it('registers valid SEPA IBAN in SEPA payment zone', async () => {
      const rec = await registerSepaDestination({
        tenantId,
        companyId,
        sepa: {
          iban: 'DE89 3704 0044 0532 0130 00',
          beneficiaryName: 'Acme GmbH',
          swiftBic: 'DEUTDEDDFXX',
        },
      });

      expect(rec.destinationType).toBe('sepa');
      expect(rec.countryCode).toBe('DE');
      expect(rec.currency).toBe('EUR');
      expect(rec.maskedAccountIdentifier).toContain('DE••••••••3000');
    });

    it('registers international Wire destination with SWIFT and currency', async () => {
      const rec = await registerWireDestination({
        tenantId,
        companyId,
        wire: {
          swiftBic: 'CHASUS33',
          accountNumber: 'US89370400440532',
          bankName: 'JPMorgan Chase NY',
          beneficiaryName: 'Global Holdings Inc',
          countryCode: 'US',
          currency: 'USD',
        },
      });

      expect(rec.destinationType).toBe('wire');
      expect(rec.maskedAccountIdentifier).toBe('WIRE-••••0532');
    });
  });

  describe('Payoneer & Card OCT Registration', () => {
    it('registers Payoneer payee identifier', async () => {
      const rec = await registerPayoneerDestination({
        tenantId,
        companyId,
        payoneer: {
          payeeIdOrEmail: 'payouts@acmemerchant.com',
          beneficiaryName: 'Acme Merchant Global',
        },
      });

      expect(rec.destinationType).toBe('payoneer');
      expect(rec.maskedAccountIdentifier).toContain('pa••••@acmemerchant.com');
    });

    it('registers Visa Push-to-Card OCT destination', async () => {
      const rec = await registerCardOctDestination({
        tenantId,
        companyId,
        card: {
          cardToken: 'tok_visa_oct_9823472',
          last4: '4242',
          brand: 'visa',
          beneficiaryName: 'John Doe Sole Prop',
        },
      });

      expect(rec.destinationType).toBe('card');
      expect(rec.maskedAccountIdentifier).toBe('VISA ••••4242');
    });

    it('rejects push-to-card registration for ineligible brand', async () => {
      await expect(
        registerCardOctDestination({
          tenantId,
          companyId,
          card: {
            cardToken: 'tok_amex_9823472',
            last4: '1005',
            brand: 'amex' as any,
            beneficiaryName: 'John Doe',
          },
        })
      ).rejects.toThrow(/not eligible for push-to-card OCT/);
    });
  });
});
