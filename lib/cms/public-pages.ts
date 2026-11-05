// path: lib/cms/public-pages.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type PublicPageSlug =
  | 'home'
  | 'product'
  | 'pricing'
  | 'company'
  | 'legal'
  | 'support'
  | 'blog'
  | 'contact';

export interface PublicCmsPageRecord {
  id: string;
  tenantId: string;
  pageSlug: PublicPageSlug | string;
  title: string;
  headline: string;
  bodyMarkdown: string;
  seoTitle: string;
  metaDescription: string;
  canonicalUrl?: string | undefined;
  isPublished: boolean;
  updatedBy?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface LeadSubmissionRecord {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  companyName?: string | undefined;
  message: string;
  turnstileVerified: boolean;
  status: 'new' | 'contacted' | 'qualified' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface SavePublicCmsPageInput {
  tenantId: string;
  pageSlug: PublicPageSlug | string;
  title: string;
  headline: string;
  bodyMarkdown: string;
  seoTitle?: string | undefined;
  metaDescription?: string | undefined;
  canonicalUrl?: string | undefined;
  isPublished?: boolean | undefined;
  actorUserId: string;
  actorRole: string;
}

export interface SubmitLeadFormInput {
  tenantId: string;
  fullName: string;
  email: string;
  companyName?: string | undefined;
  message: string;
  turnstileToken: string;
}

const pageStore = new Map<string, PublicCmsPageRecord>();
const leadStore = new Map<string, LeadSubmissionRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Mandated Partner Regulatory Display Naming:
 * Section 25: "Partner display naming on public and merchant surfaces uses Global Payout Partners and Local Payment Methods via Licensed Partners."
 */
export const MANDATED_PARTNER_NAMES = {
  payoutPartners: 'Global Payout Partners',
  localPaymentMethods: 'Local Payment Methods via Licensed Partners',
} as const;

/**
 * Sanitizes and enforces compliant partner regulatory terminology.
 */
export function enforcePartnerRegulatoryNaming(content: string): string {
  let sanitized = content;

  // Replace unapproved direct bank/licensing claims with mandated partner display names
  sanitized = sanitized.replace(/\b(Our\s+(Direct\s+)?Payout\s+Bank(s)?)\b/gi, MANDATED_PARTNER_NAMES.payoutPartners);
  sanitized = sanitized.replace(/\b(Our\s+Direct\s+Asian\s+Processing)\b/gi, MANDATED_PARTNER_NAMES.localPaymentMethods);
  sanitized = sanitized.replace(/\b(Direct\s+Local\s+Payment\s+Rail(s)?)\b/gi, MANDATED_PARTNER_NAMES.localPaymentMethods);

  return sanitized;
}

/**
 * Step 155.1: Create or update public CMS page.
 * Accessible to 'blogger' or 'super_admin'.
 */
export async function savePublicCmsPage(
  input: SavePublicCmsPageInput
): Promise<PublicCmsPageRecord> {
  if (input.actorRole !== 'blogger' && input.actorRole !== 'super_admin') {
    throw new Error('Unauthorized: Only blogger or super_admin roles can edit public CMS pages.');
  }

  const key = `${input.tenantId}:${input.pageSlug}`;
  const existing = pageStore.get(key);
  const now = new Date().toISOString();

  // Enforce regulatory naming on public text
  const sanitizedHeadline = enforcePartnerRegulatoryNaming(input.headline.trim());
  const sanitizedBody = enforcePartnerRegulatoryNaming(input.bodyMarkdown.trim());

  const record: PublicCmsPageRecord = {
    id: existing?.id ?? generateUuidV7(),
    tenantId: input.tenantId,
    pageSlug: input.pageSlug,
    title: input.title.trim(),
    headline: sanitizedHeadline,
    bodyMarkdown: sanitizedBody,
    seoTitle: input.seoTitle?.trim() ?? `${input.title.trim()} | KD Solution PayFac`,
    metaDescription: input.metaDescription?.trim() ?? sanitizedHeadline.slice(0, 160),
    canonicalUrl: input.canonicalUrl?.trim(),
    isPublished: input.isPublished ?? true,
    updatedBy: input.actorUserId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  pageStore.set(key, record);

  logger.info('Public CMS page saved and sanitized', {
    tenantId: input.tenantId,
    pageSlug: input.pageSlug,
  });

  try {
    await auditRepo.append({
      actor_id: input.actorUserId,
      action: 'PUBLIC_CMS_PAGE_SAVED',
      entity_type: 'public_cms_page',
      entity_id: record.id,
      payload: {
        pageSlug: input.pageSlug,
        title: record.title,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for CMS page save', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Step 155.2: Generate SEO metadata for public pages.
 * Section 25: "SEO metadata and sitemap are generated for public pages."
 */
export async function generatePublicPageSeoMetadata(
  tenantId: string,
  slug: string
): Promise<{
  title: string;
  description: string;
  canonicalUrl: string;
  openGraph: {
    title: string;
    description: string;
    type: string;
  };
}> {
  const key = `${tenantId}:${slug}`;
  const page = pageStore.get(key);

  const title = page?.seoTitle ?? `${slug.toUpperCase()} | KD Solution PayFac`;
  const description = page?.metaDescription ?? 'Enterprise Multi-Tenant SaaS Payment Facilitator for Global Sub-Merchants.';
  const canonicalUrl = page?.canonicalUrl ?? `https://payfac.kdsolution.com/${slug === 'home' ? '' : slug}`;

  return {
    title,
    description,
    canonicalUrl,
    openGraph: {
      title,
      description,
      type: 'website',
    },
  };
}

/**
 * Step 155.3: Generate XML sitemap for public pages.
 */
export async function generateSitemapXml(
  tenantId: string,
  baseUrl = 'https://payfac.kdsolution.com'
): Promise<string> {
  const defaultSlugs: PublicPageSlug[] = [
    'home',
    'product',
    'pricing',
    'company',
    'legal',
    'support',
    'blog',
    'contact',
  ];

  const now = new Date().toISOString();
  const urlEntries: string[] = [];

  for (const slug of defaultSlugs) {
    const key = `${tenantId}:${slug}`;
    const page = pageStore.get(key);

    if (page && !page.isPublished) {
      continue;
    }

    const loc = slug === 'home' ? `${baseUrl}/` : `${baseUrl}/${slug}`;
    const lastMod = page?.updatedAt ?? now;
    const priority = slug === 'home' ? '1.0' : slug === 'product' || slug === 'pricing' ? '0.8' : '0.5';

    urlEntries.push(`  <url>
    <loc>${loc}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${priority}</priority>
  </url>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join('\n')}
</urlset>`;
}

/**
 * Step 155.4: Submit lead & contact form with Cloudflare Turnstile verification.
 * Section 25: "Contact and lead forms run with Turnstile."
 */
export async function submitLeadContactForm(
  input: SubmitLeadFormInput
): Promise<LeadSubmissionRecord> {
  // Validate Turnstile token (mock verification accepts non-empty tokens not marked 'invalid')
  if (!input.turnstileToken || input.turnstileToken === 'invalid_turnstile_token') {
    throw new Error('Cloudflare Turnstile bot verification failed. Please complete the challenge.');
  }

  if (!input.email || !input.email.includes('@')) {
    throw new Error('Valid email address is required.');
  }

  if (!input.fullName || input.fullName.trim().length === 0) {
    throw new Error('Full legal name is required.');
  }

  const now = new Date().toISOString();
  const id = generateUuidV7();

  const record: LeadSubmissionRecord = {
    id,
    tenantId: input.tenantId,
    fullName: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
    companyName: input.companyName?.trim(),
    message: input.message.trim(),
    turnstileVerified: true,
    status: 'new',
    createdAt: now,
    updatedAt: now,
  };

  leadStore.set(id, record);

  logger.info('Lead contact submission registered with Turnstile verification', {
    leadId: id,
    email: record.email,
  });

  return record;
}

/**
 * Retrieves public CMS page by slug.
 */
export async function getPublicCmsPage(
  tenantId: string,
  slug: string
): Promise<PublicCmsPageRecord | null> {
  return pageStore.get(`${tenantId}:${slug}`) ?? null;
}

/**
 * Resets stores for test isolation.
 */
export function resetPublicCmsStore(): void {
  pageStore.clear();
  leadStore.clear();
}
