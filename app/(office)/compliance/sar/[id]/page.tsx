// path: app/(office)/compliance/sar/[id]/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface MockSarDetails {
  id: string;
  caseNumber: string;
  companyName: string;
  suspectName: string;
  suspectRole: string;
  status: 'draft' | 'filed' | 'closed';
  fincenBsaIdentifier?: string;
  totalSuspiciousAmountUsd: string;
  activityCategories: string[];
  narrative: string;
  transactionsCount: number;
  ipAddresses: string[];
  deviceFingerprints: string[];
}

const MOCK_SAR_CASE: MockSarDetails = {
  id: 'sar_case_018f6c4c_001',
  caseNumber: 'SAR-2026-A81BC90D',
  companyName: 'Velocity Digital Trade FZE',
  suspectName: 'Victor Vance Sterling',
  suspectRole: 'Managing Director & 45% Beneficial Owner',
  status: 'draft',
  totalSuspiciousAmountUsd: '$48,250.00',
  activityCategories: ['structuring', 'card_testing_fraud', 'money_laundering'],
  narrative:
    'Between October 22 and October 29, 2026, the merchant executed 112 rapid transactions strictly calibrated between $480.00 and $495.00 from anonymous prepaid cards originating from Tor exit nodes. This pattern represents systematic structuring designed to evade the Tier 1 $500.00 single charge limit, followed by immediate cash withdrawal requests. Multiple cardholders subsequently disputed the charges as unauthorized fraudulent card testing.',
  transactionsCount: 112,
  ipAddresses: ['185.220.101.5', '185.220.101.8', '198.51.100.88'],
  deviceFingerprints: ['fp_tor_browser_09a1', 'fp_headless_chrome_21b4'],
};

export default function SarCaseWorkspacePage({
  params,
}: {
  params: { id: string };
}) {
  const [sarCase, setSarCase] = useState<MockSarDetails>(MOCK_SAR_CASE);
  const [bsaIdentifier, setBsaIdentifier] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const handleFileWithFinCEN = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (bsaIdentifier.trim().length < 8) {
      setFeedback({
        type: 'error',
        message: 'A valid FinCEN BSA Filing Tracking Identifier (minimum 8 characters) is mandatory.',
      });
      return;
    }

    setSarCase((prev) => ({
      ...prev,
      status: 'filed',
      fincenBsaIdentifier: bsaIdentifier.trim(),
    }));

    setFeedback({
      type: 'success',
      message: `SAR Case ${sarCase.caseNumber} formally filed with FinCEN BSA E-Filing System. BSA Tracking ID: ${bsaIdentifier.trim()}. Document sealed in compliance vault.`,
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-sm text-slate-400">
          <Link href="/compliance" className="hover:text-amber-400 transition">
            Compliance Office
          </Link>
          <span>/</span>
          <span className="text-slate-200">Suspicious Activity Report (SAR)</span>
        </div>

        {/* Confidentiality Warning Banner */}
        <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <span className="font-bold tracking-wide uppercase">
                STRICTLY CONFIDENTIAL — BSA / FinCEN ANTI-TIPPING-OFF PROTECTED
              </span>
              <p className="text-rose-300/80 mt-0.5">
                Pursuant to 31 U.S.C. § 5318(g)(2), unauthorized disclosure of this document to the subject merchant or any third party is a federal criminal violation. Strictly restricted to designated Compliance and Super Admin personnel.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-200 font-mono font-bold whitespace-nowrap">
            31 U.S.C. § 5318(g)(2)
          </span>
        </div>

        {/* Case Header */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono text-sm font-bold">
                {sarCase.caseNumber}
              </span>
              <h1 className="text-2xl font-bold text-white">Suspicious Activity Report Case</h1>
            </div>
            <p className="text-sm text-slate-400 mt-2">
              Entity: <span className="text-slate-200 font-medium">{sarCase.companyName}</span> &bull; Internal Case Ref: {params.id}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                sarCase.status === 'filed'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              Status: {sarCase.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-4 rounded-lg border text-sm font-medium ${
              feedback.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {/* Case Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Case Details & Narrative (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Suspect & Activity Summary */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-xl space-y-4">
              <h2 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                Suspect Information & Activity Classification
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-700/60">
                  <div className="text-slate-400">Primary Suspect Name</div>
                  <div className="text-sm font-bold text-slate-200 mt-1">{sarCase.suspectName}</div>
                  <div className="text-slate-400 mt-0.5">{sarCase.suspectRole}</div>
                </div>
                <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-700/60">
                  <div className="text-slate-400">Total Suspicious Amount</div>
                  <div className="text-sm font-bold text-rose-400 mt-1">{sarCase.totalSuspiciousAmountUsd}</div>
                  <div className="text-slate-400 mt-0.5">{sarCase.transactionsCount} structuring transactions</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-300 mb-1.5">
                  Suspicious Activity Classifications:
                </div>
                <div className="flex flex-wrap gap-2">
                  {sarCase.activityCategories.map((cat) => (
                    <span
                      key={cat}
                      className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold uppercase"
                    >
                      {cat.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Narrative */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-xl space-y-3">
              <h2 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                Factual Narrative (FinCEN Form 111 / BSA Compliance)
              </h2>
              <div className="p-4 bg-slate-900/80 rounded-lg border border-slate-700/60 text-xs text-slate-200 leading-relaxed font-mono whitespace-pre-wrap">
                {sarCase.narrative}
              </div>
            </div>

            {/* Automated Evidence Document Pack */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-xl space-y-3">
              <h2 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                Compiled Evidence Pack
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-700/60 space-y-1">
                  <div className="font-semibold text-slate-200">Originating IP Addresses</div>
                  <div className="text-slate-400 font-mono">{sarCase.ipAddresses.join(', ')}</div>
                  <div className="text-amber-400 text-[11px]">Tor Exit Nodes Detected</div>
                </div>
                <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-700/60 space-y-1">
                  <div className="font-semibold text-slate-200">Device Fingerprints</div>
                  <div className="text-slate-400 font-mono">{sarCase.deviceFingerprints.join(', ')}</div>
                  <div className="text-amber-400 text-[11px]">Headless Automation Detected</div>
                </div>
              </div>
            </div>
          </div>

          {/* Filing & Actions Panel (1 col) */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-xl space-y-5">
            <h2 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
              FinCEN BSA Filing Panel
            </h2>

            {sarCase.status === 'draft' ? (
              <form onSubmit={handleFileWithFinCEN} className="space-y-4">
                <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-lg text-xs text-amber-300">
                  Submit this case upon formal electronic filing via FinCEN BSA E-Filing System. Provide the electronic confirmation tracking number below.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    FinCEN BSA Filing Tracking ID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={bsaIdentifier}
                    onChange={(e) => setBsaIdentifier(e.target.value)}
                    placeholder="BSA-2026-99182371"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Record Official FinCEN Filing
                </button>
              </form>
            ) : (
              <div className="p-4 bg-emerald-950/30 border border-emerald-500/40 rounded-lg text-xs text-emerald-300 space-y-2">
                <div className="font-bold flex items-center gap-2">
                  <span>✓</span> Formally Filed with FinCEN
                </div>
                <div className="text-slate-300">
                  BSA Filing Identifier: <span className="font-mono font-bold text-emerald-400">{sarCase.fincenBsaIdentifier}</span>
                </div>
                <p className="text-slate-400 text-[11px] pt-1 border-t border-slate-700/60">
                  Record sealed in immutable tamper-evident compliance audit trail.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
