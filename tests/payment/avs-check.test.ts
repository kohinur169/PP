// path: tests/payment/avs-check.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  verifyNon3dsRiskFallback,
  resolvePayerCountryFromIp,
  registerGeoIpMapping,
  clearGeoIpMappings,
  clearComplianceAlerts,
  getDispatchedComplianceAlerts,
  type AvsResult,
  type InvoiceRiskContext,
} from '@/lib/payment/avs-check';

describe('Non-3DS AVS & Payer IP Country Match Verification Fallback (Step 135)', () => {
  const validInvoice: InvoiceRiskContext = {
    invoiceId: 'inv_test_20261105_001',
    paymentId: 'pi_test_card_non3ds_99',
    billingPostalCode: '90210',
    billingCountry: 'US',
    amountUsd: '250.0000',
  };

  beforeEach(() => {
    clearGeoIpMappings();
    clearComplianceAlerts();
  });

  describe('Payer IP Country Resolution (Step 135.3)', () => {
    it('resolves localhost and test IP ranges to designated countries', () => {
      expect(resolvePayerCountryFromIp('127.0.0.1')).toBe('US');
      expect(resolvePayerCountryFromIp('198.51.100.15')).toBe('US');
      expect(resolvePayerCountryFromIp('82.165.197.1')).toBe('GB');
      expect(resolvePayerCountryFromIp('103.253.40.1')).toBe('SG');
    });

    it('honors custom GeoIP lookup mapping', () => {
      registerGeoIpMapping('185.220.101.5', 'DE');
      expect(resolvePayerCountryFromIp('185.220.101.5')).toBe('DE');
    });

    it('returns UNKNOWN for unrecognized IP addresses', () => {
      expect(resolvePayerCountryFromIp('1.2.3.4')).toBe('UNKNOWN');
      expect(resolvePayerCountryFromIp('')).toBe('UNKNOWN');
    });
  });

  describe('Approved Non-3DS Payment Clear Path', () => {
    it('approves capture when AVS postal code matches (Y) and IP country matches billing country', async () => {
      const validAvs: AvsResult = {
        code: 'Y',
        postalCode: '90210',
      };

      const result = await verifyNon3dsRiskFallback(validAvs, '198.51.100.22', validInvoice);

      expect(result.canCapture).toBe(true);
      expect(result.status).toBe('approved');
      expect(result.avsPostalMatched).toBe(true);
      expect(result.ipCountryMatched).toBe(true);
      expect(result.alertDispatched).toBe(false);
      expect(result.reasons.length).toBe(0);

      const alerts = getDispatchedComplianceAlerts();
      expect(alerts.length).toBe(0);
    });

    it('approves international card with code D or F when IP matches international country', async () => {
      const ukInvoice: InvoiceRiskContext = {
        invoiceId: 'inv_uk_001',
        billingPostalCode: 'SW1A 1AA',
        billingCountry: 'GB',
      };

      const ukAvs: AvsResult = {
        code: 'F', // UK postal match
        postalCode: 'SW1A 1AA',
      };

      const result = await verifyNon3dsRiskFallback(ukAvs, '82.165.1.1', ukInvoice);

      expect(result.canCapture).toBe(true);
      expect(result.status).toBe('approved');
      expect(result.avsPostalMatched).toBe(true);
      expect(result.ipCountryMatched).toBe(true);
    });
  });

  describe('Risk Fallback: Mismatched Payer IP Country (Step 135.3 & 135.4)', () => {
    it('blocks immediate capture and sets status to in_review when IP country mismatches invoice country', async () => {
      // US billing invoice, but payer IP originates from Singapore (SG)
      const validAvs: AvsResult = { code: 'Y' };
      const sgIp = '103.253.40.10'; // Resolves to SG

      const result = await verifyNon3dsRiskFallback(validAvs, sgIp, validInvoice);

      expect(result.canCapture).toBe(false);
      expect(result.status).toBe('in_review');
      expect(result.avsPostalMatched).toBe(true);
      expect(result.ipCountryMatched).toBe(false);
      expect(result.payerCountry).toBe('SG');
      expect(result.billingCountry).toBe('US');
      expect(result.reviewCaseId).toBeDefined();
      expect(result.alertDispatched).toBe(true);

      expect(result.reasons.some((r) => r.includes('does not match invoice billing country'))).toBe(true);

      // Verify compliance team alert was dispatched
      const alerts = getDispatchedComplianceAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0]?.recipientRole).toBe('COMPLIANCE_KYC');
      expect(alerts[0]?.invoiceId).toBe(validInvoice.invoiceId);
    });
  });

  describe('Risk Fallback: Mismatched AVS Postal Code (Step 135.2 & 135.4)', () => {
    it('blocks capture and holds for review when AVS reports no postal match (code N)', async () => {
      const failedAvs: AvsResult = { code: 'N' };
      const usIp = '198.51.100.22'; // US IP matches US billing

      const result = await verifyNon3dsRiskFallback(failedAvs, usIp, validInvoice);

      expect(result.canCapture).toBe(false);
      expect(result.status).toBe('in_review');
      expect(result.avsPostalMatched).toBe(false);
      expect(result.ipCountryMatched).toBe(true);
      expect(result.reasons.some((r) => r.includes('AVS postal verification failed'))).toBe(true);

      const alerts = getDispatchedComplianceAlerts();
      expect(alerts.length).toBe(1);
    });

    it('blocks capture when explicit returned postal code conflicts with invoice postal code', async () => {
      const conflictingPostalAvs: AvsResult = {
        code: 'Y',
        postalCode: '10001', // Different ZIP from 90210
      };

      const result = await verifyNon3dsRiskFallback(conflictingPostalAvs, '198.51.100.22', validInvoice);

      expect(result.canCapture).toBe(false);
      expect(result.status).toBe('in_review');
      expect(result.avsPostalMatched).toBe(false);
      expect(result.reasons.some((r) => r.includes('AVS Postal Code mismatch'))).toBe(true);
    });
  });

  describe('Compound Mismatch Handling', () => {
    it('records both postal and IP country mismatch reasons when both fail', async () => {
      const failedAvs: AvsResult = { code: 'N' };
      registerGeoIpMapping('192.0.2.1', 'FR'); // France

      const result = await verifyNon3dsRiskFallback(failedAvs, '192.0.2.1', validInvoice);

      expect(result.canCapture).toBe(false);
      expect(result.status).toBe('in_review');
      expect(result.avsPostalMatched).toBe(false);
      expect(result.ipCountryMatched).toBe(false);
      expect(result.reasons.length).toBe(2);
    });
  });
});
