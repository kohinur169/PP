// path: app/(office)/compliance/pep/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { PepCaseStatus, PepTier, AdverseMediaCategory } from '@/lib/compliance/pep';

interface MockPepCaseDisplay {
  id: string;
  companyName: string;
  individualName: string;
  role: string;
  pepTier: PepTier;
  pepPosition: string;
  adverseMediaFlag: boolean;
  adverseMediaCategories: AdverseMediaCategory[];
  status: PepCaseStatus;
  sourceOfWealth?: string;
  sourceOfFunds?: string;
  complianceRationale?: string;
  complianceOfficerName?: string;
  ceoApproverName?: string;
}

const INITIAL_CASES: MockPepCaseDisplay[] = [
  {
    id: 'pep_case_018f6c4c_001',
    companyName: 'Andean Mineral Imports LLC',
    individualName: 'Gabriel Santiago Moreno',
    role: 'Principal UBO (35% Shareholder)',
    pepTier: 1,
    pepPosition: 'Minister of Mines and Energy (Colombia)',
    adverseMediaFlag: false,
    adverseMediaCategories: [],
    status: 'pending_edd',
  },
  {
    id: 'pep_case_018f6c4c_002',
    companyName: 'Indus Logistics FZE',
    individualName: 'Tariq Mansoor',
    role: 'Managing Director',
    pepTier: 2,
    pepPosition: 'Major General, Central Procurement Command',
    adverseMediaFlag: true,
    adverseMediaCategories: ['corruption'],
    status: 'compliance_recommended',
    sourceOfWealth: 'Verified 28-year military career pension and declared commercial real estate holdings.',
    sourceOfFunds: 'Initial equity deposit sourced from Habib Metropolitan Bank business account.',
    complianceRationale: 'Independent audit confirmed procurement allegations were dismissed in 2022. Recommend Tier 1 restrictive monitoring with 10% rolling reserve.',
    complianceOfficerName: 'Marcus Vance, CAMS, CRCM',
  },
];

export default function CompliancePepEddWorkspacePage() {
  const [cases, setCases] = useState<MockPepCaseDisplay[]>(INITIAL_CASES);
  const [activeCaseId, setActiveCaseId] = useState<string>(INITIAL_CASES[0]?.id ?? '');
  const [sourceOfWealth, setSourceOfWealth] = useState('');
  const [sourceOfFunds, setSourceOfFunds] = useState('');
  const [complianceRationale, setComplianceRationale] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const activeCase = cases.find((c) => c.id === activeCaseId);

  const handleComplianceRecommend = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (sourceOfWealth.trim().length < 15) {
      setFeedback({
        type: 'error',
        message: 'Source of Wealth must contain at least 15 characters of documented analysis.',
      });
      return;
    }

    if (sourceOfFunds.trim().length < 15) {
      setFeedback({
        type: 'error',
        message: 'Source of Funds must contain at least 15 characters of verified origin analysis.',
      });
      return;
    }

    if (complianceRationale.trim().length < 20) {
      setFeedback({
        type: 'error',
        message: 'Compliance Rationale requires at least 20 characters of documented risk reasoning.',
      });
      return;
    }

    setCases((prev) =>
      prev.map((c) =>
        c.id === activeCaseId
          ? {
              ...c,
              status: 'compliance_recommended',
              sourceOfWealth: sourceOfWealth.trim(),
              sourceOfFunds: sourceOfFunds.trim(),
              complianceRationale: complianceRationale.trim(),
              complianceOfficerName: 'Elena Rostova, CAMS (Compliance Officer)',
            }
          : c
      )
    );

    setFeedback({
      type: 'success',
      message: 'Enhanced Due Diligence (EDD) submitted. Case transitioned to Compliance Recommended. Awaiting mandatory CEO Executive Sign-Off.',
    });
  };

  const handleCeoApprove = () => {
    setFeedback(null);
    if (!activeCase || activeCase.status !== 'compliance_recommended') {
      setFeedback({
        type: 'error',
        message: 'CEO approval requires prior Compliance Officer recommendation and documented EDD.',
      });
      return;
    }

    setCases((prev) =>
      prev.map((c) =>
        c.id === activeCaseId
          ? {
              ...c,
              status: 'ceo_approved',
              ceoApproverName: 'Alex Mercer (Chief Executive Officer)',
            }
          : c
      )
    );

    setFeedback({
      type: 'success',
      message: 'Executive Sign-Off confirmed by CEO. PEP dual-approval complete; automated merchant onboarding gate cleared.',
    });
  };

  const handleReject = () => {
    setFeedback(null);
    setCases((prev) =>
      prev.map((c) =>
        c.id === activeCaseId
          ? {
              ...c,
              status: 'rejected',
            }
          : c
      )
    );

    setFeedback({
      type: 'error',
      message: 'Case rejected due to unacceptable financial crime / PEP risk. Merchant activation is permanently blocked.',
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
          <span className="text-slate-200">PEP & Adverse Media EDD Workspace</span>
        </div>

        {/* Header */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </span>
                Enhanced Due Diligence (EDD) Workspace
              </h1>
              <p className="text-sm text-slate-400 mt-2">
                Mandatory dual sign-off protocol for Politically Exposed Persons (PEP) and Adverse Media hits. Requires documented Source of Wealth, Source of Funds, Compliance recommendation, and executive CEO sign-off.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Dual Sign-Off Gate Enforced
              </span>
            </div>
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

        {/* Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Open Cases Queue */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold text-white border-b border-slate-700 pb-3">
              PEP & Adverse Media Cases
            </h2>
            <div className="space-y-3">
              {cases.map((c) => {
                const isSelected = c.id === activeCaseId;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveCaseId(c.id);
                      setFeedback(null);
                      setSourceOfWealth(c.sourceOfWealth ?? '');
                      setSourceOfFunds(c.sourceOfFunds ?? '');
                      setComplianceRationale(c.complianceRationale ?? '');
                    }}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      isSelected
                        ? 'bg-slate-700/80 border-amber-500/60 shadow-lg'
                        : 'bg-slate-900/60 border-slate-700/50 hover:bg-slate-700/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-amber-400">Tier {c.pepTier} PEP</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                          c.status === 'ceo_approved'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : c.status === 'compliance_recommended'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : c.status === 'rejected'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="font-medium text-slate-100 text-sm truncate">
                      {c.individualName}
                    </div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">{c.companyName}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: EDD Document and Approval Panel */}
          {activeCase && (
            <div className="lg:col-span-2 bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 space-y-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-700 pb-4 gap-2">
                <div>
                  <h3 className="text-xl font-bold text-white">{activeCase.individualName}</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {activeCase.role} &bull; {activeCase.companyName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30">
                    Tier {activeCase.pepTier} PEP Hit
                  </span>
                  {activeCase.adverseMediaFlag && (
                    <span className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/30">
                      Adverse Media Flagged
                    </span>
                  )}
                </div>
              </div>

              {/* Public Office / Adverse Media Information */}
              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-700/50 space-y-2">
                <div className="text-xs font-medium text-slate-400">Designated Public Office / Role</div>
                <div className="text-sm font-semibold text-slate-200">{activeCase.pepPosition}</div>
                {activeCase.adverseMediaCategories.length > 0 && (
                  <div className="pt-2 text-xs text-rose-300">
                    Adverse Media categories: {activeCase.adverseMediaCategories.join(', ')}
                  </div>
                )}
              </div>

              {/* Form / Documentation */}
              <form onSubmit={handleComplianceRecommend} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Source of Wealth (SoW) Documentation <span className="text-amber-400">*</span>
                  </label>
                  <textarea
                    rows={3}
                    disabled={activeCase.status !== 'pending_edd'}
                    value={
                      activeCase.status === 'pending_edd'
                        ? sourceOfWealth
                        : activeCase.sourceOfWealth ?? ''
                    }
                    onChange={(e) => setSourceOfWealth(e.target.value)}
                    placeholder="Document verified origin of total net worth (inheritance, business exit, executive compensation, real estate)..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-75"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Source of Funds (SoF) Documentation <span className="text-amber-400">*</span>
                  </label>
                  <textarea
                    rows={3}
                    disabled={activeCase.status !== 'pending_edd'}
                    value={
                      activeCase.status === 'pending_edd'
                        ? sourceOfFunds
                        : activeCase.sourceOfFunds ?? ''
                    }
                    onChange={(e) => setSourceOfFunds(e.target.value)}
                    placeholder="Document origin of commercial transaction funds and operating equity deposited into merchant account..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-75"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Compliance Officer EDD Rationale <span className="text-amber-400">*</span>
                  </label>
                  <textarea
                    rows={3}
                    disabled={activeCase.status !== 'pending_edd'}
                    value={
                      activeCase.status === 'pending_edd'
                        ? complianceRationale
                        : activeCase.complianceRationale ?? ''
                    }
                    onChange={(e) => setComplianceRationale(e.target.value)}
                    placeholder="Document analytical justification and recommended risk controls for onboarding this PEP entity..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-75"
                  />
                </div>

                {/* Sign-off Audit Trails */}
                {activeCase.complianceOfficerName && (
                  <div className="p-3 bg-blue-950/30 border border-blue-500/30 rounded-lg text-xs text-blue-300">
                    <span className="font-semibold">Compliance Recommendation by:</span>{' '}
                    {activeCase.complianceOfficerName}
                  </div>
                )}

                {activeCase.ceoApproverName && (
                  <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-xs text-emerald-300">
                    <span className="font-semibold">Executive Dual Approval confirmed by:</span>{' '}
                    {activeCase.ceoApproverName}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-700">
                  {activeCase.status === 'pending_edd' && (
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
                    >
                      Submit Compliance EDD Recommendation
                    </button>
                  )}

                  {activeCase.status === 'compliance_recommended' && (
                    <button
                      type="button"
                      onClick={handleCeoApprove}
                      className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      CEO Executive Sign-Off (Approve Onboarding)
                    </button>
                  )}

                  {activeCase.status !== 'ceo_approved' && activeCase.status !== 'rejected' && (
                    <button
                      type="button"
                      onClick={handleReject}
                      className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-rose-600/80 hover:bg-rose-600 text-white transition"
                    >
                      Reject PEP Onboarding
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
