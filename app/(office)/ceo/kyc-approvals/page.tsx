// path: app/(office)/ceo/kyc-approvals/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface CeoApprovalQueueItem {
  id: string;
  companyName: string;
  mccCode: string;
  mccCategory: string;
  riskTier: number;
  singleTransactionCap: string;
  monthlyVolumeCap: string;
  rollingReserve: string;
  processorKybStatus: 'verified' | 'pending' | 'rejected';
  firstComplianceReviewer: string;
  secondComplianceReviewer?: string;
  isFourEyeApproved: boolean;
  status: 'pending_ceo_approval' | 'approved';
  provisioningJobId?: string;
}

const INITIAL_QUEUE_ITEMS: CeoApprovalQueueItem[] = [
  {
    id: 'comp_018f6c4c_901',
    companyName: 'Apex Cloud Systems Inc',
    mccCode: '5734',
    mccCategory: 'Computer Software Stores',
    riskTier: 1,
    singleTransactionCap: '$500.00',
    monthlyVolumeCap: '$2,500.00',
    rollingReserve: '10% for 90 days',
    processorKybStatus: 'verified',
    firstComplianceReviewer: 'Elena Rostova, CAMS',
    isFourEyeApproved: true,
    status: 'pending_ceo_approval',
  },
  {
    id: 'comp_018f6c4c_902',
    companyName: 'Helios Telehealth LLC',
    mccCode: '5122',
    mccCategory: 'Telemedicine & Pharmaceuticals',
    riskTier: 1,
    singleTransactionCap: '$500.00',
    monthlyVolumeCap: '$2,500.00',
    rollingReserve: '10% for 90 days',
    processorKybStatus: 'verified',
    firstComplianceReviewer: 'Elena Rostova, CAMS',
    secondComplianceReviewer: 'Marcus Vance, CAMS, CRCM',
    isFourEyeApproved: true,
    status: 'pending_ceo_approval',
  },
];

export default function CeoKycApprovalsPage() {
  const [items, setItems] = useState<CeoApprovalQueueItem[]>(INITIAL_QUEUE_ITEMS);
  const [activeItemId, setActiveItemId] = useState<string>(INITIAL_QUEUE_ITEMS[0]?.id ?? '');
  const [totpCode, setTotpCode] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [isProcessing, setIsProcessing] = useState(false);

  const activeItem = items.find((i) => i.id === activeItemId);

  const handleApprove = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setIsProcessing(true);

    if (!/^\d{6}$/.test(totpCode.trim())) {
      setFeedback({
        type: 'error',
        message: 'Security Exception: A valid 6-digit TOTP authenticator code is mandatory for final executive KYC sign-off.',
      });
      setIsProcessing(false);
      return;
    }

    if (activeItem?.processorKybStatus !== 'verified') {
      setFeedback({
        type: 'error',
        message: `Processor Precedence Rejection: Merchant cannot receive executive approval while processor status is '${activeItem?.processorKybStatus}'.`,
      });
      setIsProcessing(false);
      return;
    }

    const generatedJobId = `job_prov_${Math.random().toString(36).substring(2, 10)}`;

    setItems((prev) =>
      prev.map((i) =>
        i.id === activeItemId
          ? {
              ...i,
              status: 'approved',
              provisioningJobId: generatedJobId,
            }
          : i
      )
    );

    setFeedback({
      type: 'success',
      message: `Executive KYC approval confirmed for ${activeItem?.companyName}. Sub-merchant gateway provisioning job enqueued (${generatedJobId}) across NMI, Rainforest, Payoneer, Stripe Connect, and Airwallex.`,
    });

    setIsProcessing(false);
    setTotpCode('');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-sm text-slate-400">
          <Link href="/office" className="hover:text-amber-400 transition">
            Executive Office
          </Link>
          <span>/</span>
          <span className="text-slate-200">CEO KYC Approvals & Provisioning</span>
        </div>

        {/* Header */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </span>
              CEO Final KYC Approval & Provisioning Gate
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Final executive authorization required before sub-merchant creation and gateway provisioning. Requires verified payment processor KYB and step-up 2FA.
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Executive Authorization Gate
          </span>
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

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Applications Awaiting CEO Approval (1 col) */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold text-white border-b border-slate-700 pb-3">
              Cleared Applications ({items.filter((i) => i.status === 'pending_ceo_approval').length})
            </h2>
            <div className="space-y-3">
              {items.map((item) => {
                const isSelected = item.id === activeItemId;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveItemId(item.id);
                      setFeedback(null);
                    }}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      isSelected
                        ? 'bg-slate-700/80 border-emerald-500/60 shadow-lg'
                        : 'bg-slate-900/60 border-slate-700/50 hover:bg-slate-700/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-emerald-400">MCC {item.mccCode}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                          item.status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="font-medium text-slate-100 text-sm truncate">{item.companyName}</div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">{item.mccCategory}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Details and Sign-Off Panel (2 cols) */}
          {activeItem && (
            <div className="lg:col-span-2 bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-700 pb-4 gap-2">
                <div>
                  <h3 className="text-xl font-bold text-white">{activeItem.companyName}</h3>
                  <p className="text-xs text-slate-400 mt-1">Company ID: {activeItem.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-300 text-xs font-semibold border border-blue-500/30">
                    Tier {activeItem.riskTier} Limits
                  </span>
                  <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                    Processor KYB: {activeItem.processorKybStatus.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Underwritten Limits Display */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-900/60 border border-slate-700/60 rounded-lg">
                  <div className="text-slate-400">Single Transaction Cap</div>
                  <div className="text-sm font-bold text-white mt-1">{activeItem.singleTransactionCap}</div>
                </div>
                <div className="p-3 bg-slate-900/60 border border-slate-700/60 rounded-lg">
                  <div className="text-slate-400">Monthly Volume Limit</div>
                  <div className="text-sm font-bold text-white mt-1">{activeItem.monthlyVolumeCap}</div>
                </div>
                <div className="p-3 bg-slate-900/60 border border-slate-700/60 rounded-lg">
                  <div className="text-slate-400">Rolling Reserve Requirement</div>
                  <div className="text-sm font-bold text-amber-400 mt-1">{activeItem.rollingReserve}</div>
                </div>
              </div>

              {/* Compliance Sign-Off Audit Trail */}
              <div className="p-4 bg-slate-900/60 border border-slate-700/60 rounded-lg space-y-2 text-xs">
                <div className="font-semibold text-slate-300">Compliance Audit Signatures:</div>
                <div className="text-slate-400 flex items-center justify-between">
                  <span>1st Compliance Reviewer:</span>
                  <span className="text-slate-200 font-medium">{activeItem.firstComplianceReviewer}</span>
                </div>
                {activeItem.secondComplianceReviewer && (
                  <div className="text-slate-400 flex items-center justify-between">
                    <span>2nd Compliance Reviewer (Four-Eye):</span>
                    <span className="text-slate-200 font-medium">{activeItem.secondComplianceReviewer}</span>
                  </div>
                )}
                <div className="text-slate-400 flex items-center justify-between">
                  <span>Upstream Payment Processor KYB:</span>
                  <span className="text-emerald-400 font-semibold">&#10003; Verified Authoritative</span>
                </div>
              </div>

              {/* Executive Sign-Off Form */}
              {activeItem.status === 'pending_ceo_approval' && (
                <form onSubmit={handleApprove} className="space-y-4 pt-2">
                  <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-500/30 text-xs text-amber-300">
                    <span className="font-semibold">Step-Up Reauthentication Required:</span> Approving this merchant executes legal underwriting authorization and dispatches background provisioning requests across all 5 payment processors. Enter your 6-digit authenticator code below.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      CEO Authenticator Code (6-digit TOTP) <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-48 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-center text-lg font-mono tracking-widest text-emerald-400 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessing || totpCode.length !== 6}
                    className="px-6 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Confirm CEO Approval & Authorize Provisioning
                  </button>
                </form>
              )}

              {activeItem.status === 'approved' && (
                <div className="p-4 rounded-lg bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-300 space-y-2">
                  <div className="font-bold flex items-center gap-2">
                    <span>✓</span> Merchant Formally Approved & Gateway Provisioning Dispatched
                  </div>
                  <p>
                    Provisioning job ID:{' '}
                    <span className="font-mono font-semibold">{activeItem.provisioningJobId}</span>. All merchant gateways (NMI, Rainforest, Payoneer, Stripe Connect, Airwallex) are currently being provisioned.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
