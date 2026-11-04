// path: app/api/office/blogger/articles/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@/lib/auth/roles';
import { listBlogArticles, createBlogArticle } from '@/lib/office/blogger-engine';

const createArticleSchema = z.object({
  title: z.string().min(3),
  slug: z.string().min(3),
  contentMarkdown: z.string().min(10),
  excerpt: z.string().min(5),
  category: z.enum([
    'payfac_insights',
    'compliance_guide',
    'developer_tutorials',
    'product_updates',
  ]),
  tags: z.array(z.string()).default([]),
  coverImageUrl: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorRole = roleHeader as Role;

    const articles = await listBlogArticles(actorRole);

    return NextResponse.json({
      articles,
      totalCount: articles.length,
      publishedCount: articles.filter((a) => a.status === 'published').length,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied') ? 403 : 500;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/blogger-articles',
        title: 'Articles Retrieval Error',
        status,
        detail: error.message || 'Failed to list blog articles',
      },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorId = req.headers.get('x-user-id') || '018f6c4c-3500-7fa1-b1e2-500000000005';
    const authorName = req.headers.get('x-user-name') || 'Staff Content Writer';
    const actorRole = roleHeader as Role;

    const body = await req.json();
    const parsed = createArticleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/validation',
          title: 'Invalid Article Payload',
          status: 400,
          detail: parsed.error.issues[0]?.message || 'Validation failed',
        },
        { status: 400 }
      );
    }

    const created = await createBlogArticle({
      title: parsed.data.title,
      slug: parsed.data.slug,
      contentMarkdown: parsed.data.contentMarkdown,
      excerpt: parsed.data.excerpt,
      category: parsed.data.category,
      tags: parsed.data.tags,
      coverImageUrl: parsed.data.coverImageUrl,
      actorId,
      authorName,
      actorRole,
    });

    return NextResponse.json({
      success: true,
      article: created,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied') ? 403 : 400;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/blogger-articles',
        title: 'Article Creation Error',
        status,
        detail: error.message || 'Failed to create blog article',
      },
      { status }
    );
  }
}
