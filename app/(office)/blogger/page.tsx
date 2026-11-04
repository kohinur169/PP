// path: app/(office)/blogger/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: 'draft' | 'published' | 'archived';
  authorName: string;
  updatedAt: string;
}

export default function BloggerOverviewPage() {
  const [articles, setArticles] = useState<ArticleSummary[]>([
    {
      id: 'art_01',
      slug: 'understanding-payfac-underwriting-tiers',
      title: 'Understanding PayFac Underwriting: Risk Tiers 1 Through 3 Explained',
      category: 'compliance_guide',
      status: 'published',
      authorName: 'Alex Thorne (Content Writer)',
      updatedAt: '2026-11-03T16:00:00.000Z',
    },
    {
      id: 'art_02',
      slug: 'collectjs-embedded-tokenization-guide',
      title: 'Integrating NMI Collect.js for SAQ-A PCI Compliance in Next.js',
      category: 'developer_tutorials',
      status: 'published',
      authorName: 'Alex Thorne (Content Writer)',
      updatedAt: '2026-11-04T10:30:00.000Z',
    },
    {
      id: 'art_03',
      slug: 'multi-processor-fallback-routing-announcement',
      title: 'Introducing Intelligent Fallback Routing: NMI, Stripe Connect & Airwallex',
      category: 'product_updates',
      status: 'draft',
      authorName: 'Alex Thorne (Content Writer)',
      updatedAt: '2026-11-04T15:20:00.000Z',
    },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white">Public Blog Content &amp; CMS Workspace</h2>
          <p className="text-sm text-slate-400">
            Publish educational content, API integration guides, and platform release notes to the public PayFac website.
          </p>
        </div>
        <Link
          href="/blogger/articles/new"
          className="px-3.5 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded text-xs font-semibold transition-colors"
        >
          + New Article Draft
        </Link>
      </div>

      <div className="p-4 bg-pink-950/20 border border-pink-800/40 rounded-lg flex items-start space-x-3 text-xs text-pink-300">
        <span className="text-base font-bold">&#128274;</span>
        <div>
          <strong className="font-semibold">Blogger Role Scope:</strong> Bloggers have write permissions for marketing articles and public documentation only. RLS enforces zero access to merchant tenant companies, bank details, transactions, KYC documents, or ledger accounts.
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          <span className="text-sm font-semibold text-white">Articles &amp; Posts</span>
          <span className="text-xs text-slate-400 font-mono">
            {articles.filter((a) => a.status === 'published').length} Published /{' '}
            {articles.filter((a) => a.status === 'draft').length} Drafts
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Article Title / Slug</th>
                <th className="py-3 px-4 font-semibold text-center">Category</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold">Author</th>
                <th className="py-3 px-4 font-semibold">Last Modified</th>
                <th className="py-3 px-4 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {articles.map((a) => (
                <tr key={a.id} className="hover:bg-slate-900/30">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{a.title}</div>
                    <div className="text-[10px] text-slate-400 font-mono">/{a.slug}</div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-[11px] text-slate-300 font-mono">
                      {a.category.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                        a.status === 'published'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">{a.authorName}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {new Date(a.updatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Link
                      href={`/blogger/articles/${a.id}`}
                      className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium transition-colors"
                    >
                      Edit Markdown
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
