// path: tests/cms/public-pages.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  savePublicCmsPage,
  generatePublicPageSeoMetadata,
  generateSitemapXml,
  submitLeadContactForm,
  getPublicCmsPage,
  resetPublicCmsStore,
  MANDATED_PARTNER_NAMES,
} from '@/lib/cms/public-pages';

describe('Public Website CMS, SEO Metadata, Sitemap & Partner Regulatory Naming (Step 155)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const bloggerUserId = '55555555-5555-4555-8555-555555555555';
  const superAdminId = '99999999-9999-4999-8999-999999999999';
  const merchantUserId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    resetPublicCmsStore();
  });

  describe('CMS Page Editing & RBAC (Step 155.1)', () => {
    it('allows blogger role to edit all core public pages', async () => {
      const page = await savePublicCmsPage({
        tenantId,
        pageSlug: 'product',
        title: 'Enterprise Payment Facilitator Platform',
        headline: 'Accept Cards & E-Wallets Across Asia and Worldwide',
        bodyMarkdown: 'Platform built for sub-merchants with robust multi-tenant security.',
        actorUserId: bloggerUserId,
        actorRole: 'blogger',
      });

      expect(page.id).toBeDefined();
      expect(page.pageSlug).toBe('product');
      expect(page.title).toContain('Payment Facilitator');

      const fetched = await getPublicCmsPage(tenantId, 'product');
      expect(fetched?.headline).toBe('Accept Cards & E-Wallets Across Asia and Worldwide');
    });

    it('rejects public CMS edits from merchant roles', async () => {
      await expect(
        savePublicCmsPage({
          tenantId,
          pageSlug: 'pricing',
          title: 'Pricing',
          headline: 'Rates',
          bodyMarkdown: 'Content',
          actorUserId: merchantUserId,
          actorRole: 'merchant_admin',
        })
      ).rejects.toThrow(/Only blogger or super_admin roles can edit public CMS pages/);
    });
  });

  describe('Mandated Partner Regulatory Display Naming (Step 155.2)', () => {
    it('automatically sanitizes non-compliant claims to mandated regulatory partner display names', async () => {
      const page = await savePublicCmsPage({
        tenantId,
        pageSlug: 'home',
        title: 'Global Payments Architecture',
        headline: 'Automated Mass Disbursements via Our Direct Payout Banks',
        bodyMarkdown: 'We deliver real-time Asian checkouts via Our Direct Asian Processing and Direct Local Payment Rails.',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      // Must be sanitized to Global Payout Partners and Local Payment Methods via Licensed Partners
      expect(page.headline).toContain(MANDATED_PARTNER_NAMES.payoutPartners);
      expect(page.headline).not.toContain('Our Direct Payout Banks');

      expect(page.bodyMarkdown).toContain(MANDATED_PARTNER_NAMES.localPaymentMethods);
      expect(page.bodyMarkdown).not.toContain('Our Direct Asian Processing');
    });
  });

  describe('SEO Metadata & XML Sitemap Generator (Step 155.3)', () => {
    it('generates rich OpenGraph SEO metadata for public pages', async () => {
      await savePublicCmsPage({
        tenantId,
        pageSlug: 'pricing',
        title: 'Transparent PayFac Pricing',
        headline: 'Predictable interchange-plus and volume tiers',
        bodyMarkdown: 'Simple pricing with zero hidden fees.',
        seoTitle: 'Pricing Plans & Volume Tiers | KD Solution PayFac',
        metaDescription: 'Inspect Asian PayFac pricing tiers with zero hidden markups.',
        canonicalUrl: 'https://payfac.kdsolution.com/pricing',
        actorUserId: bloggerUserId,
        actorRole: 'blogger',
      });

      const seo = await generatePublicPageSeoMetadata(tenantId, 'pricing');
      expect(seo.title).toBe('Pricing Plans & Volume Tiers | KD Solution PayFac');
      expect(seo.description).toContain('Inspect Asian PayFac pricing tiers');
      expect(seo.canonicalUrl).toBe('https://payfac.kdsolution.com/pricing');
      expect(seo.openGraph.type).toBe('website');
    });

    it('generates compliant XML sitemap covering all 8 public page routes', async () => {
      const xml = await generateSitemapXml(tenantId);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(xml).toContain('<loc>https://payfac.kdsolution.com/</loc>'); // Home
      expect(xml).toContain('<loc>https://payfac.kdsolution.com/product</loc>');
      expect(xml).toContain('<loc>https://payfac.kdsolution.com/pricing</loc>');
      expect(xml).toContain('<loc>https://payfac.kdsolution.com/company</loc>');
      expect(xml).toContain('<loc>https://payfac.kdsolution.com/legal</loc>');
      expect(xml).toContain('<loc>https://payfac.kdsolution.com/support</loc>');
      expect(xml).toContain('<loc>https://payfac.kdsolution.com/blog</loc>');
      expect(xml).toContain('<loc>https://payfac.kdsolution.com/contact</loc>');
    });
  });

  describe('Lead & Contact Form with Turnstile (Step 155.4)', () => {
    it('successfully processes lead form with valid Turnstile verification token', async () => {
      const lead = await submitLeadContactForm({
        tenantId,
        fullName: 'Alexander Wright',
        email: 'alex@fintechglobal.example.com',
        companyName: 'Fintech Global Pte Ltd',
        message: 'We are seeking sub-merchant acquiring for our Asian e-commerce stores.',
        turnstileToken: 'cf_turnstile_pass_token_9921',
      });

      expect(lead.id).toBeDefined();
      expect(lead.turnstileVerified).toBe(true);
      expect(lead.status).toBe('new');
      expect(lead.email).toBe('alex@fintechglobal.example.com');
    });

    it('blocks submission when Turnstile verification fails or is omitted', async () => {
      await expect(
        submitLeadContactForm({
          tenantId,
          fullName: 'Spam Bot',
          email: 'bot@spam.com',
          message: 'Buy cheap watches',
          turnstileToken: 'invalid_turnstile_token',
        })
      ).rejects.toThrow(/Cloudflare Turnstile bot verification failed/);
    });
  });
});
