// path: tests/payment/three-ds.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/lib/money/money';
import {
  initiate3dsAuthentication,
  complete3dsChallenge,
  evaluateLiabilityShift,
  get3dsRecord,
  clear3dsRecords,
  type ThreeDsAuthRequest,
} from '@/lib/payment/three-ds';

describe('3D Secure 2.0 (3DS2) Authentication & Liability Shift Engine (Step 134)', () => {
  const defaultRequest: ThreeDsAuthRequest = {
    paymentId: 'pi_test_payment_99881122',
    amount: Money.from('85.0000'),
    currency: 'USD',
    provider: 'stripe_connect',
    cardBrand: 'visa',
    cardToken: 'tok_standard_frictionless_card',
    billingCountry: 'US',
    payerIp: '198.51.100.25',
    returnUrl: 'http://localhost:3000/checkout/3ds-return',
  };

  beforeEach(() => {
    clear3dsRecords();
  });

  describe('Frictionless Authentication & Liability Shift (Step 134.1 & 134.3)', () => {
    it('clears low-risk transactions through frictionless flow with ECI 05 and liability shift for Visa', async () => {
      const result = await initiate3dsAuthentication(defaultRequest);

      expect(result.status).toBe('frictionless_authenticated');
      expect(result.eci).toBe('05');
      expect(result.liabilityShifted).toBe(true);
      expect(result.cavv).toBeDefined();
      expect(result.xid).toBeDefined();
      expect(result.version).toBe('2.2.0');
    });

    it('assigns ECI 02 with liability shift for Mastercard frictionless transactions', async () => {
      const mcRequest: ThreeDsAuthRequest = {
        ...defaultRequest,
        cardBrand: 'mastercard',
      };

      const result = await initiate3dsAuthentication(mcRequest);

      expect(result.status).toBe('frictionless_authenticated');
      expect(result.eci).toBe('02');
      expect(result.liabilityShifted).toBe(true);
    });
  });

  describe('Step-Up Challenge Flow Triggering & Handling (Step 134.1 & 134.2)', () => {
    it('requires challenge modal when card token indicates 3DS challenge test card', async () => {
      const challengeRequest: ThreeDsAuthRequest = {
        ...defaultRequest,
        cardToken: 'tok_card_3063_challenge_required',
      };

      const result = await initiate3dsAuthentication(challengeRequest);

      expect(result.status).toBe('challenge_required');
      expect(result.liabilityShifted).toBe(false);
      expect(result.challengeUrl).toBeDefined();
      expect(result.challengeUrl).toContain('pi_test_payment_99881122');
    });

    it('requires challenge modal for high-ticket transactions over $1,000.00 USD', async () => {
      const highTicketRequest: ThreeDsAuthRequest = {
        ...defaultRequest,
        amount: Money.from('1250.0000'),
      };

      const result = await initiate3dsAuthentication(highTicketRequest);

      expect(result.status).toBe('challenge_required');
      expect(result.liabilityShifted).toBe(false);
      expect(result.challengeUrl).toBeDefined();
    });
  });

  describe('Challenge Completion & Issuer Liability Grant (Step 134.3)', () => {
    it('secures liability shift and generates CAVV when user completes challenge successfully', async () => {
      const completionResult = await complete3dsChallenge({
        paymentId: defaultRequest.paymentId,
        challengeResponseToken: '3ds_user_otp_cleared_auth_ok',
        provider: 'stripe_connect',
        cardBrand: 'visa',
      });

      expect(completionResult.status).toBe('challenge_authenticated');
      expect(completionResult.eci).toBe('05');
      expect(completionResult.liabilityShifted).toBe(true);
      expect(completionResult.cavv).toBeDefined();
      expect(completionResult.xid).toBeDefined();
    });

    it('denies liability shift and marks challenge_failed when challenge response fails', async () => {
      const failedResult = await complete3dsChallenge({
        paymentId: defaultRequest.paymentId,
        challengeResponseToken: 'INVALID_OTP',
        provider: 'stripe_connect',
        cardBrand: 'visa',
      });

      expect(failedResult.status).toBe('challenge_failed');
      expect(failedResult.eci).toBe('07');
      expect(failedResult.liabilityShifted).toBe(false);
    });
  });

  describe('Liability Shift Evaluation Matrix (Step 134.3)', () => {
    it('properly evaluates ECI codes across Visa and Mastercard', () => {
      // Visa: ECI 05 (Auth) -> true, ECI 06 (Attempted) -> true, ECI 07 (Failed) -> false
      expect(evaluateLiabilityShift('05', 'visa')).toBe(true);
      expect(evaluateLiabilityShift('06', 'visa')).toBe(true);
      expect(evaluateLiabilityShift('07', 'visa')).toBe(false);

      // Mastercard: ECI 02 (Auth) -> true, ECI 01 (Attempted) -> true, ECI 00 (Failed) -> false
      expect(evaluateLiabilityShift('02', 'mastercard')).toBe(true);
      expect(evaluateLiabilityShift('01', 'mastercard')).toBe(true);
      expect(evaluateLiabilityShift('00', 'mastercard')).toBe(false);
    });
  });

  describe('Dispute Evidence Record Storage (Step 134.4)', () => {
    it('persists CAVV, XID, and ECI records for chargeback defense', async () => {
      await initiate3dsAuthentication(defaultRequest);

      const record = get3dsRecord(defaultRequest.paymentId);
      expect(record).not.toBeNull();
      expect(record?.paymentId).toBe(defaultRequest.paymentId);
      expect(record?.eci).toBe('05');
      expect(record?.cavv).toBeDefined();
      expect(record?.xid).toBeDefined();
      expect(record?.liabilityShifted).toBe(true);
    });
  });
});
