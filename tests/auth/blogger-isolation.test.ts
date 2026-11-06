// path: tests/auth/blogger-isolation.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role, Permission, hasPermission, MERCHANT_ACCESS_PERMISSIONS } from '@/lib/auth/roles';
import {
  resetBloggerDataForTest,
  seedBlogArticleForTest,
  listBlogArticles,
  getBlogArticleById,
  createBlogArticle,
  updateBlogArticle,
  publishBlogArticle,
  assertBloggerZeroAccessToMerchantData,
  assertBloggerZeroAccessToFinancials,
  BlogArticle,
} from '@/lib/office/blogger-engine';
import { AuditLogRepository } from '@/lib/db/audit';
import {
  GET as getArticles,
  POST as createArticle,
} from '@/app/api/office/blogger/articles/route';
import {
  GET as getArticleById,
  PUT as putArticleAction,
} from '@/app/api/office/blogger/articles/[id]/route';
import { GET as probeMerchantData } from '@/app/api/office/blogger/merchant-data-probe/route';

describe('Step 071: Blogger Public Content Management Portal & Isolation', () => {
  const bloggerId = '018f6c4c-3500-7fa1-b1e2-500000000005';
  let mockAuditRepo: AuditLogRepository;
  let auditLogsRecorded: any[];

  beforeEach(() => {
    resetBloggerDataForTest();
    auditLogsRecorded = [];

    mockAuditRepo = {
      createLog: async (input: any) => {
        auditLogsRecorded.push(input);
        return {} as any;
      },
    } as unknown as AuditLogRepository;
  });

  describe('Step 071.1 & Step 071.2: Blogger CMS Operations', () => {
    it('allows BLOGGER role to draft, edit, and publish public articles', async () => {
      // Create article draft
      const created = await createBlogArticle({
        title: 'PCI SAQ-A Compliance Guide',
        slug: 'pci-saq-a-guide',
        contentMarkdown: '# SAQ-A Compliance\nTokenize cards with Collect.js.',
        excerpt: 'Complete guide for SAQ-A tokenization.',
        category: 'compliance_guide',
        tags: ['pci', 'compliance'],
        actorId: bloggerId,
        authorName: 'Staff Writer',
        actorRole: Role.BLOGGER,
        auditRepo: mockAuditRepo,
      });

      expect(created.status).toBe('draft');
      expect(created.slug).toBe('pci-saq-a-guide');
      expect(auditLogsRecorded).toHaveLength(1);

      // List articles
      const articles = await listBlogArticles(Role.BLOGGER);
      expect(articles).toHaveLength(1);

      // Fetch article
      const fetched = await getBlogArticleById(created.id, Role.BLOGGER);
      expect(fetched.title).toBe('PCI SAQ-A Compliance Guide');

      // Update article content
      const updated = await updateBlogArticle({
        articleId: created.id,
        title: 'PCI SAQ-A Compliance Guide for Next.js',
        actorId: bloggerId,
        actorRole: Role.BLOGGER,
      });
      expect(updated.title).toBe('PCI SAQ-A Compliance Guide for Next.js');

      // Publish article
      const published = await publishBlogArticle({
        articleId: created.id,
        actorId: bloggerId,
        actorRole: Role.BLOGGER,
        auditRepo: mockAuditRepo,
      });
      expect(published.status).toBe('published');
      expect(published.publishedAt).toBeDefined();
      expect(auditLogsRecorded).toHaveLength(2);
    });
  });

  describe('Step 071.3 & Step 071.4: Strict Zero-Access Merchant & Financial Data Isolation', () => {
    it('verifies BLOGGER role has zero permissions in MERCHANT_ACCESS_PERMISSIONS', () => {
      for (const permission of MERCHANT_ACCESS_PERMISSIONS) {
        const permitted = hasPermission(Role.BLOGGER, permission);
        expect(permitted).toBe(false);
      }
    });

    it('asserts BLOGGER cannot access merchant company or payment records', () => {
      expect(() => assertBloggerZeroAccessToMerchantData(Role.BLOGGER, 'companies')).toThrow(
        /strictly prohibited from accessing merchant companies/i
      );

      expect(() => assertBloggerZeroAccessToMerchantData(Role.BLOGGER, 'charges')).toThrow(
        /strictly prohibited from accessing merchant companies/i
      );

      expect(() => assertBloggerZeroAccessToFinancials(Role.BLOGGER)).toThrow(
        /strictly prohibited from viewing financial reports/i
      );
    });

    it('returns HTTP 403 Forbidden when BLOGGER role probes merchant data endpoint', async () => {
      const probeReq = new NextRequest(
        'http://localhost/api/office/blogger/merchant-data-probe?resource=companies',
        {
          headers: { 'x-user-role': Role.BLOGGER },
        }
      );
      const res = await probeMerchantData(probeReq);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.detail).toMatch(/strictly prohibited from accessing merchant companies/i);

      // Financial probe
      const finReq = new NextRequest(
        'http://localhost/api/office/blogger/merchant-data-probe?resource=financials',
        {
          headers: { 'x-user-role': Role.BLOGGER },
        }
      );
      const finRes = await probeMerchantData(finReq);
      expect(finRes.status).toBe(403);
    });
  });

  describe('HTTP API Endpoints Integration', () => {
    it('handles GET, POST, and PUT for /api/office/blogger/articles', async () => {
      // POST new article
      const postReq = new NextRequest('http://localhost/api/office/blogger/articles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.BLOGGER,
          'x-user-id': bloggerId,
          'x-user-name': 'Content Writer',
        },
        body: JSON.stringify({
          title: 'Understanding Multi-Tenant RLS',
          slug: 'multi-tenant-rls',
          contentMarkdown: 'Explaining Row Level Security in Postgres.',
          excerpt: 'RLS ensures zero tenant leakage.',
          category: 'developer_tutorials',
          tags: ['security', 'postgres'],
        }),
      });

      const postRes = await createArticle(postReq);
      expect(postRes.status).toBe(200);
      const postData = await postRes.json();
      expect(postData.success).toBe(true);
      const articleId = postData.article.id;

      // GET list
      const listReq = new NextRequest('http://localhost/api/office/blogger/articles', {
        headers: { 'x-user-role': Role.BLOGGER },
      });
      const listRes = await getArticles(listReq);
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData.totalCount).toBe(1);

      // GET by ID
      const getReq = new NextRequest(`http://localhost/api/office/blogger/articles/${articleId}`, {
        headers: { 'x-user-role': Role.BLOGGER },
      });
      const getRes = await getArticleById(getReq, {
        params: Promise.resolve({ id: articleId }),
      });
      expect(getRes.status).toBe(200);

      // PUT publish
      const putReq = new NextRequest(`http://localhost/api/office/blogger/articles/${articleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.BLOGGER,
          'x-user-id': bloggerId,
        },
        body: JSON.stringify({
          action: 'publish',
        }),
      });
      const putRes = await putArticleAction(putReq, {
        params: Promise.resolve({ id: articleId }),
      });
      expect(putRes.status).toBe(200);
      const putData = await putRes.json();
      expect(putData.article.status).toBe('published');
    });
  });
});
