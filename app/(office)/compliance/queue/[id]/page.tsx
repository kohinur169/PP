// path: app/(office)/compliance/queue/[id]/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function ComplianceReviewDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const [activeReviewer, setActiveReviewer] = useState<'reviewer_1' | 'reviewer_2'>('reviewer_1');
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'info_requested'>('approved');
  const [notes, setNotes] = useState('');
  const [caseStatus, setCaseStatus] = useState<string>('pending_first_review');
  const [firstReviewerName, setFirstReviewerName] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const isFourEyeCase = params.id.includes('002') || params.id.includes('003');

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (notes.trim().length < 10) {
      setFeedback({
        type: 'error',
        message: 'Compliance review notes must be at least 10 characters long.',
      });
      return;
    }

    // Step 106.2: Enforce business logic rule: first_reviewer_id !== second_reviewer_id
    if (caseStatus === 'pending_second_review' && activeReviewer === 'reviewer_1') {
      setFeedback({
        type: 'error',
        message:
          'Four-Eye Compliance Rule Violation: The second reviewer must be a distinct compliance officer from the first reviewer (Elena Rostova).',
      });
      return;
    }

    if (caseStatus === 'pending_first_review') {
      if (decision === 'approved' && isFourEyeCase) {
        setCaseStatus('pending_second_review');
        setFirstReviewerName('Elena Rostova, CAMS (Reviewer #1)');
        setFeedback({
          type: 'success',
          message:
            'First compliance review approved. Case remains held in queue awaiting required Second Reviewer (Four-Eye) sign-off.',
        });
        setActiveReviewer('reviewer_2');
      } else if (decision === 'approved') {
        setCaseStatus('ready_for_ceo_approval');
        setFeedback({
          type: 'success',
          message:
            'Compliance review approved. Application cleared and advanced to CEO Final Executive Approval Queue.',
        });
      } else {
        setCaseStatus(decision);
        setFeedback({
          type: 'error',
          message: `Application marked as ${decision.replace('_', ' ')}.`,
        });
      }
    } else if (caseStatus === 'pending_second_review') {
      if (decision === 'approved') {
        setCaseStatus('ready_for_ceo_approval');
        setFeedback({
          type: 'success',
          message:
            'Second reviewer sign-off confirmed by Marcus Vance. Four-Eye gate complete! Advanced to CEO Final Executive Approval Queue.',
        });
      } else {
        setCaseStatus(decision);
        setFeedback({
          type: 'error',
          message: `Second reviewer marked application as ${decision.replace('_', ' ')}.`,
        });
      }
    }

    setNotes('');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center space-x-2 text-sm text-slate-400">
          <Link href="/compliance" className="hover:text-amber-400 transition">
            Compliance Office
          </Link>
          <span>/</span>
          <Link href="/compliance/queue" className="hover:text-amber-400 transition">
            Review Queue
          </Link>
          <span>/</span>
          <span className="text-slate-200">Application {params.id}</span>
        </div>

        {/* Header */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              Application Inspection & Review
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Inspection of KYB document packet, merchant website, and sanctions/PEP audit records.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                caseStatus === 'ready_for_ceo_approval'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : caseStatus === 'pending_second_review'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              Status: {caseStatus.replace(/_/g, ' ').toUpperCase()}
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

        {/* Inspection Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Packet Details (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* KYB Document Packet */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-xl space-y-4">
              <h2 className="text-lg font-semibold text-white border-b border-slate-700 pb-2 flex items-center gap-2">
                <span>📄</span> Verified KYB Document Packet
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-900/60 border border-slate-700/60 rounded-lg">
                  <div className="font-semibold text-slate-200">Articles of Incorporation</div>
                  <div className="text-slate-400 mt-1">Verified Delaware C-Corp &bull; File: articles_inc.pdf</div>
                  <div className="text-emerald-400 mt-1 font-medium">&#10003; Seal Authenticated</div>
                </div>
                <div className="p-3 bg-slate-900/60 border border-slate-700/60 rounded-lg">
                  <div className="font-semibold text-slate-200">Corporate Bank Statement</div>
                  <div className="text-slate-400 mt-1">JPMorgan Chase &bull; Account # ending in 8812</div>
                  <div className="text-emerald-400 mt-1 font-medium">&#10003; 98.4% Name Match</div>
                </div>
                <div className="p-3 bg-slate-900/60 border border-slate-700/60 rounded-lg">
                  <div className="font-semibold text-slate-200">UBO Government Photo ID</div>
                  <div className="text-slate-400 mt-1">State Passport &bull; IDV Liveness: PASSED (98%)</div>
                  <div className="text-emerald-400 mt-1 font-medium">&#10003; Biometric Match Verified</div>
                </div>
                <div className="p-3 bg-slate-900/60 border border-slate-700/60 rounded-lg">
                  <div className="font-semibold text-slate-200">Commercial Lease Agreement</div>
                  <div className="text-slate-400 mt-1">USPS Commercial Physical Address</div>
                  <div className="text-emerald-400 mt-1 font-medium">&#10003; CMRA Not Flagged</div>
                </div>
              </div>
            </div>

            {/* Merchant Website Inspection */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-xl space-y-4">
              <h2 className="text-lg font-semibold text-white border-b border-slate-700 pb-2 flex items-center gap-2">
                <span>🌐</span> Automated Website Inspection Results
              </h2>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-slate-700/60">
                  <span className="text-slate-300">HTTPS Transport Security (TLS v1.3)</span>
                  <span className="text-emerald-400 font-semibold">&#10003; Verified Active</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-slate-700/60">
                  <span className="text-slate-300">Prominent Terms & Conditions</span>
                  <span className="text-emerald-400 font-semibold">&#10003; Detected on Checkout</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-slate-700/60">
                  <span className="text-slate-300">Clear Refund & Cancellation Policy</span>
                  <span className="text-emerald-400 font-semibold">&#10003; 30-Day Policy Present</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-slate-700/60">
                  <span className="text-slate-300">Customer Support Phone & Physical Address</span>
                  <span className="text-emerald-400 font-semibold">&#10003; Matched Operating Office</span>
                </div>
              </div>
            </div>

            {/* Sanctions & PEP Check Results */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-xl space-y-4">
              <h2 className="text-lg font-semibold text-white border-b border-slate-700 pb-2 flex items-center gap-2">
                <span>🛡️</span> Sanctions & Watchlist Screening Summary
              </h2>
              <div className="p-3 bg-slate-900/60 border border-slate-700/60 rounded-lg text-xs space-y-1">
                <div className="text-slate-200 font-semibold">OFAC SDN, UN, EU FSF, UK HMT & PEP Registers:</div>
                <div className="text-emerald-400 font-medium">
                  &#10003; All principals cleared with 0 watchlist hits. Automated block is not active.
                </div>
              </div>
            </div>
          </div>

          {/* Compliance Officer Review Panel (1 col) */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-xl space-y-5">
            <h2 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
              Compliance Decision Panel
            </h2>

            {/* Reviewer Simulation Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Active Compliance Officer Identity
              </label>
              <select
                value={activeReviewer}
                onChange={(e) => setActiveReviewer(e.target.value as 'reviewer_1' | 'reviewer_2')}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="reviewer_1">Elena Rostova, CAMS (Reviewer #1)</option>
                <option value="reviewer_2">Marcus Vance, CAMS, CRCM (Reviewer #2)</option>
              </select>
            </div>

            {/* Audit Trail of Prior Sign-Offs */}
            {firstReviewerName && (
              <div className="p-3 bg-blue-950/40 border border-blue-500/40 rounded-lg text-xs text-blue-300">
                <span className="font-semibold">1st Review Sign-Off:</span> {firstReviewerName}
              </div>
            )}

            {caseStatus !== 'ready_for_ceo_approval' && (
              <form onSubmit={handleSubmitReview} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Review Decision
                  </label>
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value as 'approved' | 'rejected' | 'info_requested')}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="approved">Approve Application</option>
                    <option value="info_requested">Request Additional Information</option>
                    <option value="rejected">Reject Application</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Compliance Review Notes <span className="text-amber-400">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Document inspection findings, risk considerations, and regulatory justification..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
                >
                  {caseStatus === 'pending_first_review'
                    ? 'Submit 1st Compliance Review'
                    : 'Submit 2nd Review (Four-Eye Sign-Off)'}
                </button>
              </form>
            )}

            {caseStatus === 'ready_for_ceo_approval' && (
              <div className="p-4 bg-emerald-950/30 border border-emerald-500/40 rounded-lg text-xs text-emerald-300 space-y-2">
                <div className="font-bold flex items-center gap-1.5">
                  <span>✓</span> Compliance Review Cleared
                </div>
                <p>
                  All required compliance sign-offs have been recorded. Case is ready for executive sign-off.
                </p>
                <Link
                  href="/ceo/kyc-approvals"
                  className="inline-block mt-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold text-xs transition"
                >
                  View in CEO Queue &rarr;
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
