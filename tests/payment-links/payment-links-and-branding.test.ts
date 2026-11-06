// path: tests/payment-links/payment-links-and-branding.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPaymentLink,
  resolvePaymentLinkForCheckout,
  setPaymentLinkActiveStatus,
  resetPaymentLinksStore,
  MissingPlanEntitlementError,
  DeactivatedPaymentLinkError,
} from '@/lib/payment-links/index';
import {
  updateMerchantBranding,
  resolveMerchantBranding,
  resetBrandingStore,
  PLATFORM_DEFAULT_BRANDING,
} from '@/lib/branding/index';
import {
  importClientsFromCsv,
  importProductsFromCsv,
} from '@/lib/import/csv';

describe('Payment Links, Custom Branding & Bulk CSV Import (Phase 13 - Steps 198-200)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const companyId = '22222222-3333-4444-8555-666666666666';

  beforeEach(() => {
    resetPaymentLinksStore();
    resetBrandingStore();
  });

  describe('Step 198: General Reusable Payment Links & Plan-Gated Hosted Checkout', () => {
    it('blocks payment link creation if merchant active plan lacks entitlement', async () => {
      await expect(
        createPaymentLink({
          tenantId,
          companyId,
          companyEntitlements: ['invoicing'], // missing 'payment_links'
          title: 'Quick Retainer Payment',
          amountUsd: '250.00',
        })
      ).rejects.toThrow(MissingPlanEntitlementError);
    });

    it('creates reusable payment link and resolves active checkout slug', async () => {
      const link = await createPaymentLink({
        tenantId,
        companyId,
        companyEntitlements: ['invoicing', 'payment_links'],
        title: 'Strategy Consultation',
        slug: 'strategy-session-1hr',
        amountUsd: '350.00',
      });

      expect(link.slug).toBe('strategy-session-1hr');
      expect(link.amountUsd).toBe('350.0000');
      expect(link.isActive).toBe(true);

      const resolved = resolvePaymentLinkForCheckout('strategy-session-1hr');
      expect(resolved.id).toBe(link.id);
      expect(resolved.title).toBe('Strategy Consultation');
    });

    it('rejects checkout attempts when payment link is deactivated', async () => {
      await createPaymentLink({
        tenantId,
        companyId,
        companyEntitlements: ['payment_links'],
        title: 'Archived Workshop',
        slug: 'archived-workshop',
        amountUsd: '100.00',
      });

      setPaymentLinkActiveStatus('archived-workshop', false);

      expect(() => resolvePaymentLinkForCheckout('archived-workshop')).toThrow(
        DeactivatedPaymentLinkError
      );
    });
  });

  describe('Step 199: Sub-Merchant Invoice Branding & Custom Logo Engine', () => {
    it('saves custom branding for entitled merchant plan', async () => {
      const branding = await updateMerchantBranding({
        tenantId,
        companyId,
        companyEntitlements: ['custom_branding'],
        logoUrl: 'https://cdn.example.com/merchant-logo.png',
        primaryColor: '#4f46e5',
        accentColor: '#3730a3',
        footerNote: 'Thank you for partnering with TechCorp.',
      });

      expect(branding.primaryColor).toBe('#4f46e5');
      expect(branding.logoUrl).toBe('https://cdn.example.com/merchant-logo.png');

      const resolved = resolveMerchantBranding(companyId, ['custom_branding']);
      expect(resolved.primaryColor).toBe('#4f46e5');
      expect(resolved.footerNote).toContain('TechCorp');
    });

    it('falls back to default platform branding when plan excludes custom branding', async () => {
      const fallback = resolveMerchantBranding(companyId, ['starter_plan']);
      expect(fallback.primaryColor).toBe(PLATFORM_DEFAULT_BRANDING.primaryColor);
      expect(fallback.logoUrl).toBe(PLATFORM_DEFAULT_BRANDING.logoUrl);
      expect(fallback.footerNote).toContain('Powered by KD Solution IT');
    });
  });

  describe('Step 200: Bulk Client & Product Catalog CSV Import Tool', () => {
    it('imports valid client rows and provides detailed error reporting on failed rows', () => {
      const csvContent = [
        'name,email,phone,country',
        'Alice Smith,alice@example.com,+1234567890,US', // Row 2: Valid
        'Bob Jones,bob-invalid-email,+1987654321,CA',   // Row 3: Invalid email
        'Charlie Brown,charlie@example.com,,GB',        // Row 4: Valid
        ',missing-name@example.com,,US',                 // Row 5: Missing name
        'Dave Miller,dave@example.com,,XYZ',            // Row 6: Invalid country (3 chars)
      ].join('\n');

      const result = importClientsFromCsv(csvContent);

      expect(result.totalRows).toBe(5);
      expect(result.successfulCount).toBe(2);
      expect(result.failedCount).toBe(3);
      expect(result.validRecords).toHaveLength(2);

      // Check failed rows reporting
      expect(result.failedRows[0].rowNumber).toBe(3);
      expect(result.failedRows[0].errors).toContain('Valid email address is required');

      expect(result.failedRows[1].rowNumber).toBe(5);
      expect(result.failedRows[1].errors).toContain('Name is required (minimum 2 characters)');

      expect(result.failedRows[2].rowNumber).toBe(6);
      expect(result.failedRows[2].errors).toContain('Valid 2-letter ISO country code is required');

      expect(result.errorReportCsv).toContain('row_number,name,email,phone,country,error_reasons');
      expect(result.errorReportCsv).toContain('Valid email address is required');
    });

    it('imports valid product rows and rejects invalid price or missing SKU', () => {
      const csvContent = [
        'title,description,price_usd,sku',
        'Pro Widget,High precision widget,49.99,WID-001', // Row 2: Valid
        'Defective SKU,No sku provided,19.99,',            // Row 3: Missing SKU
        'Bad Price Widget,Negative price,-10.00,WID-002',   // Row 4: Negative price
      ].join('\n');

      const result = importProductsFromCsv(csvContent);

      expect(result.totalRows).toBe(3);
      expect(result.successfulCount).toBe(1);
      expect(result.failedCount).toBe(2);
      expect(result.validRecords[0].title).toBe('Pro Widget');
      expect(result.validRecords[0].priceUsd).toBe('49.9900');
    });
  });
});
