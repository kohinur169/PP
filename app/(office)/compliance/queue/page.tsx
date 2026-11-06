// path: app/(office)/compliance/queue/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface QueueItemDisplay {
  id: string;
  companyName: string;
  mccCode: string;
  mccCategory: string;
  riskLevel: 'standard' | 'high_risk' | 'elevated_volume';
  requiresFourEyes: boolean;
  overallStatus: 'pending_first_review' | 'pending_second_review' | 'ready_for_ceo_approval';
  submittedAt: string;
  firstReviewerName?: string;
}

const MOCK_QUEUE_ITEMS: QueueItemDisplay[] = [
  {
    id: 'kyc_rev_001',
    companyName: 'Apex Cloud Systems Inc',
    mccCode: '5734',
    mccCategory: 'Computer Software Stores',
    riskLevel: 'standard',
    requiresFourEyes: false,
    overallStatus: 'pending_first_review',
    submittedAt: '2026-11-04T10:15:00Z',
  },
  {
    id: 'kyc_rev_002',
    companyName: 'Helios Telehealth LLC',
    mccCode: '5122',
    mccCategory: 'Telemedicine & Pharmaceuticals',
    riskLevel: 'high_risk',
    requiresFourEyes: true,
    overallStatus: 'pending_second_review',
    submittedAt: '2026-11-03T14:30:00Z',
    firstReviewerName: 'Elena Rostova, CAMS',
  },
  {
    id: 'kyc_rev_003',
    companyName: 'Meridian Global Cargo FZE',
    mccCode: '4722',
    mccCategory: 'Travel & Tour Operators',
    riskLevel: 'elevated_volume',
    requiresFourEyes: true,
    overallStatus: 'pending_first_review',
    submittedAt: '2026-11-04T08:45:00Z',
  },
];

export default function ComplianceReviewQueuePage() {
  const [filter, setFilter] = useState<'all' | 'pending_first' | 'pending_second'>('all');

  const filteredItems = MOCK_QUEUE_ITEMS.filter((item) => {
    if (filter === 'pending_first') return item.overallStatus === 'pending_first_review';
    if (filter === 'pending_second') return item.overallStatus === 'pending_second_review';
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-sm text-slate-400">
          <Link href="/compliance" className="hover:text-amber-400 transition">
            Compliance Office
          </Link>
          <span>/</span>
          <span className="text-slate-200">Merchant Review Queue</span>
        </div>

        {/* Header */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </span>
              Four-Eye Compliance Review Queue
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Merchant onboarding queue enforcing single review for standard sellers and mandatory dual (Four-Eye) review for high-risk MCCs and elevated volume requests.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                filter === 'all'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              All ({MOCK_QUEUE_ITEMS.length})
            </button>
            <button
              onClick={() => setFilter('pending_first')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                filter === 'pending_first'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              1st Review
            </button>
            <button
              onClick={() => setFilter('pending_second')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                filter === 'pending_second'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              2nd Review (Four-Eye)
            </button>
          </div>
        </div>

        {/* Table of Queue Items */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-sm text-slate-200">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700">
              <tr>
                <th className="p-4">Merchant Company</th>
                <th className="p-4">MCC Category</th>
                <th className="p-4">Risk Classification</th>
                <th className="p-4">Four-Eye Policy</th>
                <th className="p-4">Queue Status</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-700/30 transition">
                  <td className="p-4 font-semibold text-white">
                    {item.companyName}
                    <div className="text-xs text-slate-400 font-normal">ID: {item.id}</div>
                  </td>
                  <td className="p-4">
                    <span className="font-mono text-xs text-slate-300">MCC {item.mccCode}</span>
                    <div className="text-xs text-slate-400">{item.mccCategory}</div>
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                        item.riskLevel === 'high_risk'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : item.riskLevel === 'elevated_volume'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      }`}
                    >
                      {item.riskLevel.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4">
                    {item.requiresFourEyes ? (
                      <span className="inline-flex items-center text-xs text-amber-400 font-medium">
                        Dual Sign-Off (4-Eyes)
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Single Review</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        item.overallStatus === 'pending_first_review'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-indigo-500/20 text-indigo-300'
                      }`}
                    >
                      {item.overallStatus === 'pending_first_review'
                        ? 'Awaiting 1st Review'
                        : 'Awaiting 2nd Review (Four-Eye)'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/compliance/queue/${item.id}`}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition inline-block"
                    >
                      Inspect Packet &rarr;
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
