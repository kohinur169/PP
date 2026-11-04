// path: tests/compliance/website-verify.test.ts

import { describe, it, expect } from 'vitest';
import {
  crawlAndInspectWebsite,
  recordComplianceWebsiteReview,
  isMerchantWebsiteVerified,
} from '@/lib/compliance/website-verify';

describe('Step 094: Merchant Website & Storefront Authenticity Verification Engine', () => {
  it('Step 094.1: successfully passes a fully compliant e-commerce website with 100/100 score', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Apex Superstore</title></head>
        <body>
          <h1>Welcome to our store</h1>
          <p>Product price: $49.99 USD</p>
          <footer>
            <a href="/terms">Terms of Service</a>
            <a href="/refund">Refund Policy & Returns</a>
            <p>Contact us: support@apexstore.example.com or tel: 1-800-555-0199</p>
          </footer>
        </body>
      </html>
    `;

    const report = await crawlAndInspectWebsite('https://apexstore.example.com', mockHtml);

    expect(report.checklist.sslValid).toBe(true);
    expect(report.checklist.http200Ok).toBe(true);
    expect(report.checklist.termsOfServiceFound).toBe(true);
    expect(report.checklist.refundPolicyFound).toBe(true);
    expect(report.checklist.contactInfoFound).toBe(true);
    expect(report.checklist.pricingInUsdFound).toBe(true);
    expect(report.complianceScore).toBe(100);
    expect(report.recommendedStatus).toBe('VERIFIED');
    expect(report.missingItems).toHaveLength(0);
    expect(report.checklist.termsUrl).toBe('https://apexstore.example.com/terms');
    expect(report.checklist.refundPolicyUrl).toBe('https://apexstore.example.com/refund-policy');
  });

  it('Step 094.2: detects insecure HTTP protocol and flags lack of SSL', async () => {
    const mockHtml = `
      <div>Product catalog. Contact us at support@example.com</div>
    `;

    const report = await crawlAndInspectWebsite('http://insecure-store.example.com', mockHtml);

    expect(report.checklist.sslValid).toBe(false);
    expect(report.missingItems).toContain('Valid HTTPS SSL Certificate');
    expect(report.complianceScore).toBeLessThan(85);
  });

  it('Step 094.3: recommends NEEDS_REMEDIATION when legal disclosures are partially missing', async () => {
    const mockHtml = `
      <div>
        <p>Products starting at $15 USD</p>
        <a href="/terms">Terms of Service</a>
      </div>
    `;

    const report = await crawlAndInspectWebsite('https://partial-store.example.com', mockHtml);

    expect(report.checklist.sslValid).toBe(true);
    expect(report.checklist.termsOfServiceFound).toBe(true);
    expect(report.checklist.refundPolicyFound).toBe(false);
    expect(report.checklist.contactInfoFound).toBe(false);
    expect(report.recommendedStatus).toBe('NEEDS_REMEDIATION');
    expect(report.missingItems).toContain('Prominently Disclosed Refund & Return Policy');
    expect(report.missingItems).toContain('Clear Customer Support Email or Phone Contact');
  });

  it('Step 094.4: rejects malformed or invalid URLs', async () => {
    const report = await crawlAndInspectWebsite('not-a-valid-url');

    expect(report.recommendedStatus).toBe('REJECTED');
    expect(report.complianceScore).toBe(0);
    expect(report.missingItems).toContain('Valid URL syntax');
  });

  it('Step 094.5: records formal compliance officer review with digital SHA-256 fingerprint', () => {
    const review = recordComplianceWebsiteReview({
      websiteId: 'web_uuid_99',
      decision: 'VERIFIED',
      reviewedBy: 'user_officer_01',
      notes: 'Manually verified business physical address and terms of service.',
    });

    expect(review.reviewId).toBeDefined();
    expect(review.decision).toBe('VERIFIED');
    expect(review.reviewedBy).toBe('user_officer_01');
    expect(review.digitalFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('Step 094.6: gates merchant gateway activation until website is verified', () => {
    expect(isMerchantWebsiteVerified({ verification_status: 'pending' })).toBe(false);
    expect(isMerchantWebsiteVerified({ verification_status: 'needs_remediation' })).toBe(false);
    expect(isMerchantWebsiteVerified({ verification_status: 'rejected' })).toBe(false);
    expect(isMerchantWebsiteVerified({ verification_status: 'verified' })).toBe(true);
    expect(isMerchantWebsiteVerified({ verification_status: 'VERIFIED' })).toBe(true);
  });
});
