// path: lib/office/blogger-engine.ts

import crypto from 'node:crypto';
import { Role, Permission, assertPermission, hasPermission, MERCHANT_ACCESS_PERMISSIONS } from '@/lib/auth/roles';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

export interface BlogArticle {
  readonly id: string;
  slug: string;
  title: string;
  contentMarkdown: string;
  excerpt: string;
  coverImageUrl?: string | undefined;
  category: 'payfac_insights' | 'compliance_guide' | 'developer_tutorials' | 'product_updates';
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  readonly authorId: string;
  readonly authorName: string;
  publishedAt?: string | undefined;
  readonly createdAt: string;
  updatedAt: string;
}

const articleRegistry = new Map<string, BlogArticle>();

/**
 * Resets store for test isolation.
 */
export function resetBloggerDataForTest(): void {
  articleRegistry.clear();
}

/**
 * Seeds an article into the store.
 */
export function seedBlogArticleForTest(article: BlogArticle): void {
  articleRegistry.set(article.id, {
    ...article,
    tags: [...article.tags],
  });
}

/**
 * Step 071.1: Lists blog articles for blogger content operators.
 */
export async function listBlogArticles(actorRole: Role): Promise<BlogArticle[]> {
  assertPermission(actorRole, Permission.VIEW_BLOG);
  return Array.from(articleRegistry.values());
}

/**
 * Step 071.2: Retrieves an article by ID for editing.
 */
export async function getBlogArticleById(
  articleId: string,
  actorRole: Role
): Promise<BlogArticle> {
  assertPermission(actorRole, Permission.VIEW_BLOG);
  const article = articleRegistry.get(articleId);
  if (!article) {
    throw new Error(`Blog article "${articleId}" not found.`);
  }
  return {
    ...article,
    tags: [...article.tags],
  };
}

/**
 * Step 071.2: Creates a new draft blog article.
 */
export async function createBlogArticle(params: {
  readonly title: string;
  readonly slug: string;
  readonly contentMarkdown: string;
  readonly excerpt: string;
  readonly category: 'payfac_insights' | 'compliance_guide' | 'developer_tutorials' | 'product_updates';
  readonly tags: string[];
  readonly coverImageUrl?: string | undefined;
  readonly actorId: string;
  readonly authorName: string;
  readonly actorRole: Role;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<BlogArticle> {
  const {
    title,
    slug,
    contentMarkdown,
    excerpt,
    category,
    tags,
    coverImageUrl,
    actorId,
    authorName,
    actorRole,
    auditRepo,
  } = params;

  assertPermission(actorRole, Permission.CREATE_BLOG_POSTS);

  const id = `art_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const article: BlogArticle = {
    id,
    slug,
    title,
    contentMarkdown,
    excerpt,
    category,
    tags,
    coverImageUrl,
    status: 'draft',
    authorId: actorId,
    authorName,
    createdAt: now,
    updatedAt: now,
  };

  articleRegistry.set(id, article);

  logger.info('Blog article draft created by blogger operator', {
    articleId: id,
    title,
    slug,
    authorId: actorId,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: '00000000-0000-7000-8000-000000000000',
      actor_id: actorId,
      action: 'PLATFORM_SETTING_UPDATED',
      entity_type: 'blog_article',
      entity_id: id,
      payload: {
        title,
        slug,
        category,
        action: 'CREATE_DRAFT',
      },
    });
  }

  return { ...article, tags: [...article.tags] };
}

/**
 * Step 071.2: Updates an existing article's title, markdown content, or metadata.
 */
export async function updateBlogArticle(params: {
  readonly articleId: string;
  readonly title?: string | undefined;
  readonly contentMarkdown?: string | undefined;
  readonly excerpt?: string | undefined;
  readonly coverImageUrl?: string | undefined;
  readonly tags?: string[] | undefined;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<BlogArticle> {
  const {
    articleId,
    title,
    contentMarkdown,
    excerpt,
    coverImageUrl,
    tags,
    actorId,
    actorRole,
    auditRepo,
  } = params;

  assertPermission(actorRole, Permission.EDIT_BLOG_POSTS);

  const article = articleRegistry.get(articleId);
  if (!article) {
    throw new Error(`Blog article "${articleId}" not found.`);
  }

  if (title !== undefined) article.title = title;
  if (contentMarkdown !== undefined) article.contentMarkdown = contentMarkdown;
  if (excerpt !== undefined) article.excerpt = excerpt;
  if (coverImageUrl !== undefined) article.coverImageUrl = coverImageUrl;
  if (tags !== undefined) article.tags = tags;
  article.updatedAt = new Date().toISOString();

  articleRegistry.set(articleId, article);

  logger.info('Blog article updated', { articleId, actorId });

  return { ...article, tags: [...article.tags] };
}

/**
 * Step 071.2: Publishes a draft article to the public website.
 */
export async function publishBlogArticle(params: {
  readonly articleId: string;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<BlogArticle> {
  const { articleId, actorId, actorRole, auditRepo } = params;

  assertPermission(actorRole, Permission.PUBLISH_BLOG_POSTS);

  const article = articleRegistry.get(articleId);
  if (!article) {
    throw new Error(`Blog article "${articleId}" not found.`);
  }

  const now = new Date().toISOString();
  article.status = 'published';
  article.publishedAt = now;
  article.updatedAt = now;

  articleRegistry.set(articleId, article);

  logger.info('Blog article published to public CMS', {
    articleId,
    title: article.title,
    actorId,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: '00000000-0000-7000-8000-000000000000',
      actor_id: actorId,
      action: 'PLATFORM_SETTING_UPDATED',
      entity_type: 'blog_article',
      entity_id: articleId,
      payload: {
        title: article.title,
        status: 'published',
        publishedAt: now,
      },
    });
  }

  return { ...article, tags: [...article.tags] };
}

/**
 * Step 071.3: Architectural isolation assertion against merchant and financial data.
 * Throws an explicit Access Denied error if any blogger operator attempts to query merchant companies,
 * charges, payment ledgers, refunds, or disputes.
 */
export function assertBloggerZeroAccessToMerchantData(
  actorRole: Role,
  resourceName: string = 'merchant_data'
): void {
  if (actorRole === Role.BLOGGER) {
    logger.warn('Unauthorized merchant data query attempted by blogger role', {
      role: actorRole,
      resource: resourceName,
      violation: 'ZERO_ACCESS_MERCHANT_RECORDS',
    });
    throw new Error(
      `Access Denied: Blogger role is strictly prohibited from accessing merchant companies, payment transactions, ledger entries, or customer records [${resourceName}].`
    );
  }
}

/**
 * Step 071.3: Architectural isolation assertion against financial settlement and payout data.
 */
export function assertBloggerZeroAccessToFinancials(actorRole: Role): void {
  if (actorRole === Role.BLOGGER) {
    logger.warn('Unauthorized financial data query attempted by blogger role', {
      role: actorRole,
      violation: 'ZERO_ACCESS_FINANCIALS',
    });
    throw new Error(
      'Access Denied: Blogger role is strictly prohibited from viewing financial reports, settlement batches, or payout data.'
    );
  }
}
