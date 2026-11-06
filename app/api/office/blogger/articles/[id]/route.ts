// path: app/api/office/blogger/articles/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@/lib/auth/roles';
import {
  getBlogArticleById,
  updateBlogArticle,
  publishBlogArticle,
} from '@/lib/office/blogger-engine';

const updateArticleSchema = z.object({
  action: z.enum(['update', 'publish']).default('update'),
  title: z.string().optional(),
  contentMarkdown: z.string().optional(),
  excerpt: z.string().optional(),
  coverImageUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorRole = roleHeader as Role;

    const article = await getBlogArticleById(id, actorRole);

    return NextResponse.json({
      article,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied')
      ? 403
      : error.message?.includes('not found')
      ? 404
      : 500;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/blogger-article',
        title: 'Article Error',
        status,
        detail: error.message || 'Failed to retrieve article',
      },
      { status }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorId = req.headers.get('x-user-id') || '018f6c4c-3500-7fa1-b1e2-500000000005';
    const actorRole = roleHeader as Role;

    const body = await req.json();
    const parsed = updateArticleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/validation',
          title: 'Invalid Update Payload',
          status: 400,
          detail: parsed.error.issues[0]?.message || 'Validation failed',
        },
        { status: 400 }
      );
    }

    if (parsed.data.action === 'publish') {
      const published = await publishBlogArticle({
        articleId: id,
        actorId,
        actorRole,
      });

      return NextResponse.json({
        success: true,
        article: published,
      });
    }

    const updated = await updateBlogArticle({
      articleId: id,
      title: parsed.data.title,
      contentMarkdown: parsed.data.contentMarkdown,
      excerpt: parsed.data.excerpt,
      coverImageUrl: parsed.data.coverImageUrl,
      tags: parsed.data.tags,
      actorId,
      actorRole,
    });

    return NextResponse.json({
      success: true,
      article: updated,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied') ? 403 : 400;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/blogger-article',
        title: 'Update Failed',
        status,
        detail: error.message || 'Failed to update article',
      },
      { status }
    );
  }
}
