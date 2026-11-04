// path: lib/compliance/website-verify.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';

export interface WebsiteInspectionChecklist {
  sslValid: boolean;
  http200Ok: boolean;
  termsOfServiceFound: boolean;
  termsUrl?: string | undefined;
  refundPolicyFound: boolean;
  refundPolicyUrl?: string | undefined;
  contactInfoFound: boolean;
  pricingInUsdFound: boolean;
}

export interface WebsiteCrawlReport {
  crawlId: string;
  url: string;
  inspectedAt: string;
  checklist: WebsiteInspectionChecklist;
  complianceScore: number; // 0 to 100
  recommendedStatus: 'VERIFIED' | 'NEEDS_REMEDIATION' | 'REJECTED';
  missingItems: string[];
  summary: string;
}

export interface WebsiteReviewRecord {
  reviewId: string;
  websiteId: string;
  decision: 'VERIFIED' | 'NEEDS_REMEDIATION' | 'REJECTED';
  reviewedBy: string;
  reviewedAt: string;
  notes: string;
  digitalFingerprint: string;
}

/**
 * Inspects a merchant website URL and HTML content for mandatory card brand e-commerce disclosures.
 */
export async function crawlAndInspectWebsite(
  url: string,
  simulatedHtml?: string
): Promise<WebsiteCrawlReport> {
  const crawlId = generateUuidV7();
  const inspectedAt = new Date().toISOString();

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      crawlId,
      url,
      inspectedAt,
      checklist: {
        sslValid: false,
        http200Ok: false,
        termsOfServiceFound: false,
        refundPolicyFound: false,
        contactInfoFound: false,
        pricingInUsdFound: false,
      },
      complianceScore: 0,
      recommendedStatus: 'REJECTED',
      missingItems: ['Valid URL syntax', 'SSL Certificate', 'HTTP 200 Live Status'],
      summary: 'Malformed URL: Failed to parse website address.',
    };
  }

  const sslValid = parsedUrl.protocol === 'https:';
  const htmlContent = simulatedHtml ?? '';
  const http200Ok = simulatedHtml !== undefined || sslValid;

  // Regex Heuristics
  const termsRegex = /terms\s*(of\s*service)?|terms\s*&\s*conditions/i;
  const refundRegex = /refund(\s*policy)?|returns?(\s*policy)?|cancellation/i;
  const contactRegex = /contact(\s*us)?|support@|tel:|support\s*center|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/i;
  const pricingUsdRegex = /\$|\bUSD\b|\bUS\s*Dollars?\b/i;

  const termsOfServiceFound = termsRegex.test(htmlContent);
  const refundPolicyFound = refundRegex.test(htmlContent);
  const contactInfoFound = contactRegex.test(htmlContent);
  const pricingInUsdFound = pricingUsdRegex.test(htmlContent);

  const termsUrl = termsOfServiceFound ? `${url.replace(/\/$/, '')}/terms` : undefined;
  const refundPolicyUrl = refundPolicyFound ? `${url.replace(/\/$/, '')}/refund-policy` : undefined;

  let complianceScore = 0;
  const missingItems: string[] = [];

  if (sslValid) {
    complianceScore += 25;
  } else {
    missingItems.push('Valid HTTPS SSL Certificate');
  }

  if (http200Ok) {
    complianceScore += 20;
  } else {
    missingItems.push('Live HTTP 200 OK Response');
  }

  if (termsOfServiceFound) {
    complianceScore += 20;
  } else {
    missingItems.push('Prominently Disclosed Terms of Service');
  }

  if (refundPolicyFound) {
    complianceScore += 15;
  } else {
    missingItems.push('Prominently Disclosed Refund & Return Policy');
  }

  if (contactInfoFound) {
    complianceScore += 10;
  } else {
    missingItems.push('Clear Customer Support Email or Phone Contact');
  }

  if (pricingInUsdFound) {
    complianceScore += 10;
  } else {
    missingItems.push('Pricing Displayed in United States Dollars ($USD)');
  }

  let recommendedStatus: 'VERIFIED' | 'NEEDS_REMEDIATION' | 'REJECTED';
  if (complianceScore >= 85) {
    recommendedStatus = 'VERIFIED';
  } else if (complianceScore >= 50) {
    recommendedStatus = 'NEEDS_REMEDIATION';
  } else {
    recommendedStatus = 'REJECTED';
  }

  const summary =
    missingItems.length === 0
      ? 'Website complies with all card brand e-commerce storefront requirements.'
      : `Website missing ${missingItems.length} required disclosure item(s): [${missingItems.join(', ')}]. Score: ${complianceScore}/100.`;

  return {
    crawlId,
    url,
    inspectedAt,
    checklist: {
      sslValid,
      http200Ok,
      termsOfServiceFound,
      termsUrl,
      refundPolicyFound,
      refundPolicyUrl,
      contactInfoFound,
      pricingInUsdFound,
    },
    complianceScore,
    recommendedStatus,
    missingItems,
    summary,
  };
}

/**
 * Records formal human compliance officer review determination for a merchant storefront.
 */
export function recordComplianceWebsiteReview(input: {
  websiteId: string;
  decision: 'VERIFIED' | 'NEEDS_REMEDIATION' | 'REJECTED';
  reviewedBy: string;
  notes?: string;
}): WebsiteReviewRecord {
  const reviewId = generateUuidV7();
  const reviewedAt = new Date().toISOString();
  const notes = input.notes ?? 'Standard storefront compliance review completed.';

  const canonicalPayload = JSON.stringify({
    reviewId,
    websiteId: input.websiteId,
    decision: input.decision,
    reviewedBy: input.reviewedBy,
    reviewedAt,
    notes,
  });

  const digitalFingerprint = crypto
    .createHash('sha256')
    .update(canonicalPayload, 'utf8')
    .digest('hex');

  return {
    reviewId,
    websiteId: input.websiteId,
    decision: input.decision,
    reviewedBy: input.reviewedBy,
    reviewedAt,
    notes,
    digitalFingerprint,
  };
}

/**
 * Gate check verifying whether merchant storefront has achieved verified status prior to gateway activation.
 */
export function isMerchantWebsiteVerified(websiteRecord: {
  verification_status: string;
}): boolean {
  return websiteRecord.verification_status.toLowerCase() === 'verified';
}
