// path: app/(office)/super-admin/policies/page.tsx

'use client';

import React, { useState, useEffect } from 'react';

interface PolicyItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  content_md: string;
  policy_version: number;
  effective_date: string;
  change_summary: string | null;
}

export default function SuperAdminPoliciesPage() {
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('terms-of-service');
  const [activePolicy, setActivePolicy] = useState<PolicyItem | null>(null);
  const [history, setHistory] = useState<PolicyItem[]>([]);

  // Editor states
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('legal');
  const [editContent, setEditContent] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'history'>('editor');

  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchPolicies = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/office/cms/policies', {
        headers: { 'x-user-role': 'super_admin' },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.policies) {
          setPolicies(json.policies);
        }
      }
    } catch {
      // Keep state if fetch fails
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPolicyDetails = async (slug: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/office/cms/policies?slug=${encodeURIComponent(slug)}`, {
        headers: { 'x-user-role': 'super_admin' },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setActivePolicy(json.activePolicy);
          setHistory(json.history || []);
          setEditTitle(json.activePolicy.title);
          setEditCategory(json.activePolicy.category);
          setEditContent(json.activePolicy.content_md);
          setChangeSummary('');
        }
      }
    } catch {
      // Keep state if fetch fails
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchPolicies();
  }, []);

  useEffect(() => {
    if (selectedSlug) {
      void fetchPolicyDetails(selectedSlug);
    }
  }, [selectedSlug]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/office/cms/policies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'super_admin',
          'x-user-id': '018f6c4c-3500-7fa1-b1e2-000000000001',
        },
        body: JSON.stringify({
          action: 'publish',
          slug: selectedSlug,
          title: editTitle,
          category: editCategory,
          contentMd: editContent,
          changeSummary: changeSummary || `Updated ${editTitle} by Super Admin.`,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({
          type: 'success',
          message: `Published version ${json.newVersion} (${json.diff.diffSummary}). Re-acceptance required for all merchants.`,
        });
        await fetchPolicyDetails(selectedSlug);
        await fetchPolicies();
      } else {
        setFeedback({ type: 'error', message: json.detail || 'Publication failed' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error publishing policy revision' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Legal Policy CMS & Versioned Re-Acceptance Engine
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Super Admin authoring command. Incrementing version numbers triggers automated merchant re-acceptance barriers.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {activePolicy && (
            <a
              href={`/legal/${activePolicy.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              View Public Page &rarr;
            </a>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-lg text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/80 border-rose-800 text-rose-300'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Policy Selection Pills */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1">
        {policies.map((p) => (
          <button
            key={p.slug}
            onClick={() => setSelectedSlug(p.slug)}
            className={`px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors border ${
              selectedSlug === p.slug
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950'
                : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800'
            }`}
          >
            <span>{p.title}</span>{' '}
            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-slate-950 text-slate-300">
              v{p.policy_version}
            </span>
          </button>
        ))}
      </div>

      {/* Editor & Preview Workspace */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        {/* Workspace Toolbar */}
        <div className="bg-slate-900/80 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              /{selectedSlug}
            </span>
            {activePolicy && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                Current Version: v{activePolicy.policy_version}.0
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg ${
                activeTab === 'editor'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Markdown Editor
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg ${
                activeTab === 'preview'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Live Preview
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg ${
                activeTab === 'history'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Revision History ({history.length})
            </button>
          </div>
        </div>

        {/* Tab 1: Editor Form */}
        {activeTab === 'editor' && (
          <form onSubmit={handlePublish} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Policy Category
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                >
                  <option value="legal">Legal (Terms & Privacy)</option>
                  <option value="compliance">Compliance (KYC/KYB/AML)</option>
                  <option value="security">Security & Risk</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Markdown Policy Content
              </label>
              <textarea
                rows={16}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono text-xs leading-relaxed"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Version Change Summary (Audit Log & Merchant Notification)
              </label>
              <input
                type="text"
                placeholder="e.g. Revised arbitration clauses, updated rolling reserve rules for Tier 3..."
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs placeholder:text-slate-500"
                required
              />
            </div>

            <div className="bg-amber-950/20 border border-amber-900/60 rounded-lg p-3 text-xs text-amber-300 flex items-center space-x-2">
              <span className="font-bold uppercase tracking-wider text-amber-400">Notice:</span>
              <span>
                Publishing will increment this policy to version{' '}
                <strong>v{(activePolicy?.policy_version ?? 0) + 1}.0</strong>. Active merchants will be prompted for mandatory digital re-acceptance on their next dashboard visit.
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-colors"
              >
                {isLoading ? 'Publishing...' : `Publish Version v${(activePolicy?.policy_version ?? 0) + 1}.0`}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Live Preview */}
        {activeTab === 'preview' && (
          <div className="p-8 prose prose-invert max-w-none text-slate-300 leading-relaxed text-sm">
            {editContent.split('\n\n').map((para, idx) => {
              if (para.startsWith('# ')) {
                return (
                  <h1 key={idx} className="text-2xl font-bold text-white pt-2 pb-2 border-b border-slate-800">
                    {para.replace('# ', '')}
                  </h1>
                );
              }
              if (para.startsWith('## ')) {
                return (
                  <h2 key={idx} className="text-xl font-bold text-slate-100 pt-3 pb-1">
                    {para.replace('## ', '')}
                  </h2>
                );
              }
              return <p key={idx}>{para}</p>;
            })}
          </div>
        )}

        {/* Tab 3: History Timeline */}
        {activeTab === 'history' && (
          <div className="p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">Version Archive for {activePolicy?.title}</h3>
            <div className="divide-y divide-slate-800">
              {history.map((rev) => (
                <div key={rev.id} className="py-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                        v{rev.policy_version}.0
                      </span>
                      <span className="text-sm font-semibold text-white">{rev.title}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{rev.change_summary}</p>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Effective: {new Date(rev.effective_date).toISOString()}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setEditContent(rev.content_md);
                      setEditTitle(rev.title);
                      setActiveTab('editor');
                    }}
                    className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    Restore Into Editor
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
