// path: app/(office)/blogger/articles/[id]/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function ArticleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [article, setArticle] = useState({
    id: 'art_03',
    slug: 'multi-processor-fallback-routing-announcement',
    title: 'Introducing Intelligent Fallback Routing: NMI, Stripe Connect & Airwallex',
    category: 'product_updates',
    tags: ['routing', 'high-availability', 'gateways'],
    coverImageUrl: 'https://cdn.kdsolution.it/blog/routing-hero.webp',
    excerpt:
      'Learn how our autonomous routing engine dynamically transfers authorization attempts across NMI, Stripe Connect, and Airwallex to sustain 99.99% checkout conversion.',
    contentMarkdown: `# Intelligent Gateway Fallback Routing

Modern payment infrastructure must be resilient against processing network outages and regional card brand degradations.

## Autonomous Failover
When an upstream gateway encounters network timeouts or processor-level 500 errors, our transaction router engages in millisecond fallback.

\`\`\`typescript
const result = await router.routePayment({
  amountUsd: 120.00,
  riskTier: 1,
  primary: 'nmi',
  fallback: ['stripe_connect', 'airwallex'],
});
\`\`\`

### Benefits for Sub-Merchants:
1. **Zero Customer Drop-off:** Authorizations switch gateways transparently.
2. **SAQ-A Compliance:** Hosted Collect.js tokens safely re-routed.
3. **Unified Ledger:** Double-entry journal records settlements irrespective of gateway origin.
`,
    status: 'draft',
  });

  const [previewMode, setPreviewMode] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async (publish: boolean = false) => {
    try {
      const res = await fetch(`/api/office/blogger/articles/${article.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'blogger',
          'x-user-id': '018f6c4c-3500-7fa1-b1e2-500000000005',
        },
        body: JSON.stringify({
          action: publish ? 'publish' : 'update',
          title: article.title,
          contentMarkdown: article.contentMarkdown,
          excerpt: article.excerpt,
          coverImageUrl: article.coverImageUrl,
          tags: article.tags,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Save failed');
      }

      const data = await res.json();
      setArticle((prev) => ({
        ...prev,
        status: data.article.status,
      }));

      setNotice({
        type: 'success',
        text: publish
          ? 'Article successfully published to public blog feed!'
          : 'Draft changes saved successfully.',
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link
            href="/blogger"
            className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
          >
            <span>&larr;</span>
            <span>Articles</span>
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-xs font-mono text-slate-300">Editor ({article.status})</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setPreviewMode(!previewMode)}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium"
          >
            {previewMode ? 'Edit Markdown' : 'Preview HTML'}
          </button>
          <button
            type="button"
            onClick={() => handleSave(false)}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            className="px-4 py-1.5 text-xs bg-pink-600 hover:bg-pink-500 text-white rounded font-semibold"
          >
            Publish Article
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`p-3 rounded text-xs border ${
            notice.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800 text-rose-300'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="bg-slate-950 border border-slate-800 rounded-lg p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Article Title</label>
          <input
            type="text"
            value={article.title}
            onChange={(e) => setArticle({ ...article, title: e.target.value })}
            className="w-full bg-slate-900 border border-slate-800 rounded p-2.5 text-sm text-white font-semibold focus:outline-none focus:border-pink-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">URL Slug</label>
            <input
              type="text"
              value={article.slug}
              onChange={(e) => setArticle({ ...article, slug: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
            <select
              value={article.category}
              onChange={(e) => setArticle({ ...article, category: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white"
            >
              <option value="payfac_insights">PayFac Insights</option>
              <option value="compliance_guide">Compliance &amp; Risk Guide</option>
              <option value="developer_tutorials">Developer Tutorials</option>
              <option value="product_updates">Product Updates</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Cover Image URL
            </label>
            <input
              type="text"
              value={article.coverImageUrl}
              onChange={(e) => setArticle({ ...article, coverImageUrl: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">SEO Excerpt</label>
          <textarea
            rows={2}
            value={article.excerpt}
            onChange={(e) => setArticle({ ...article, excerpt: e.target.value })}
            className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-300"
          />
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
        <div className="flex justify-between items-center mb-3">
          <label className="text-xs font-semibold text-white">Markdown Article Body</label>
          <span className="text-[11px] text-slate-400 font-mono">
            {article.contentMarkdown.split(/\s+/).filter(Boolean).length} words
          </span>
        </div>

        {previewMode ? (
          <div className="p-4 bg-slate-900 rounded border border-slate-800 min-h-[400px] text-xs text-slate-200 space-y-3 font-sans leading-relaxed whitespace-pre-line">
            {article.contentMarkdown}
          </div>
        ) : (
          <textarea
            rows={18}
            value={article.contentMarkdown}
            onChange={(e) => setArticle({ ...article, contentMarkdown: e.target.value })}
            className="w-full bg-slate-900 border border-slate-800 rounded p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-pink-500 leading-relaxed"
          />
        )}
      </div>
    </div>
  );
}
