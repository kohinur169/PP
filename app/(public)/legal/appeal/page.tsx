// path: app/(public)/legal/appeal/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  submitAdverseDecisionAppeal,
  AdverseDecisionType,
  AppealSubmissionResult,
} from '@/lib/compliance/appeals';

export default function AdverseDecisionAppealFormPage() {
  const [companyLegalName, setCompanyLegalName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [decisionReferenceId, setDecisionReferenceId] = useState('');
  const [decisionType, setDecisionType] = useState<AdverseDecisionType>('ONBOARDING_REJECTION');
  const [adverseDecisionDate, setAdverseDecisionDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [groundsForAppeal, setGroundsForAppeal] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<AppealSubmissionResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!companyLegalName.trim()) {
      setFormError('Company Legal Name is required.');
      return;
    }
    if (!contactEmail.trim() || !contactEmail.includes('@')) {
      setFormError('A valid contact email address is required.');
      return;
    }
    if (!decisionReferenceId.trim()) {
      setFormError('Decision Reference ID is required.');
      return;
    }
    if (!groundsForAppeal.trim() || groundsForAppeal.length < 20) {
      setFormError('Please provide detailed factual grounds for appeal (minimum 20 characters).');
      return;
    }

    setIsSubmitting(true);

    try {
      const urls = evidenceUrls
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean);

      const result = submitAdverseDecisionAppeal({
        companyId: 'comp_client_input',
        merchantLegalName: companyLegalName.trim(),
        contactEmail: contactEmail.trim(),
        decisionReferenceId: decisionReferenceId.trim(),
        decisionType,
        adverseDecisionDate,
        groundsForAppeal: groundsForAppeal.trim(),
        supplementalEvidenceUrls: urls,
        clientIp: 'client_browser',
      });

      setSubmissionResult(result);
    } catch (err: any) {
      setFormError(err.message ?? 'An unexpected error occurred during submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Link href="/" className="hover:text-white transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/legal/automated-decisions-appeal" className="hover:text-white transition-colors">
            Appeal Rights Policy
          </Link>
          <span>/</span>
          <span className="text-emerald-400 font-medium">Appeal Submission Form</span>
        </div>

        {/* Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
            GDPR Article 22 Human Review Channel
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Adverse Algorithmic Decision Appeal Portal
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Submit your appeal within fourteen (14) calendar days of notification. Our Compliance Department will review your dossier de novo and issue a written determination within five (5) business days.
          </p>
        </div>

        {/* Confirmation Screen */}
        {submissionResult ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
            {submissionResult.status === 'SUBMITTED_PENDING_REVIEW' ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg">
                    &#10003;
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Appeal Registered Successfully</h2>
                    <p className="text-xs text-slate-400">
                      Case assigned to Compliance Officer for human re-examination.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Appeal Tracking ID:</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      {submissionResult.appealId}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Decision Reference ID:</span>
                    <span className="font-mono text-white">
                      {submissionResult.decisionReferenceId}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">5-Business-Day SLA Deadline:</span>
                    <span className="font-mono text-amber-300 font-semibold">
                      {new Date(submissionResult.slaDeterminationDeadline).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="pt-1">
                    <span className="text-slate-500 block">Cryptographic Fingerprint (SHA-256):</span>
                    <span className="font-mono text-[10px] text-slate-400 break-all block">
                      {submissionResult.digitalFingerprint}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  A formal written determination will be transmitted to{' '}
                  <span className="text-white font-medium">{contactEmail}</span>. If you require further assistance, contact{' '}
                  <span className="font-mono text-emerald-400">compliance.officer@kdsolution.it</span>.
                </p>

                <div className="pt-2">
                  <button
                    onClick={() => setSubmissionResult(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition-colors"
                  >
                    Submit Another Appeal
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs space-y-2">
                  <div className="font-bold text-rose-300">Appeal Rejected: Window Expired</div>
                  <p className="text-slate-300">{submissionResult.rejectionReason}</p>
                </div>
                <button
                  onClick={() => setSubmissionResult(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition-colors"
                >
                  Edit Submission Date
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Form Screen */
          <form
            onSubmit={handleSubmit}
            className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5 shadow-2xl text-xs sm:text-sm"
          >
            {formError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-200 text-xs">
                {formError}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-slate-300 font-medium">Merchant Company Legal Name *</label>
              <input
                type="text"
                required
                value={companyLegalName}
                onChange={(e) => setCompanyLegalName(e.target.value)}
                placeholder="e.g. Apex Meridian Systems LLC"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-slate-300 font-medium">Contact Email Address *</label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="legal@company.com"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300 font-medium">Decision Reference ID *</label>
                <input
                  type="text"
                  required
                  value={decisionReferenceId}
                  onChange={(e) => setDecisionReferenceId(e.target.value)}
                  placeholder="e.g. DEC-2026-99120"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-slate-300 font-medium">Adverse Decision Category *</label>
                <select
                  value={decisionType}
                  onChange={(e) => setDecisionType(e.target.value as AdverseDecisionType)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="ONBOARDING_REJECTION">Onboarding Underwriting Rejection</option>
                  <option value="RISK_TIER_OVERRIDE">Risk Tier Elevation / Reserve Hold</option>
                  <option value="GATEWAY_VELOCITY_HOLD">Gateway Velocity Surge Hold</option>
                  <option value="ACCOUNT_SUSPENSION">Temporary Account Suspension</option>
                  <option value="CHARGEBACK_DISPUTE_LIMIT">Chargeback Threshold Limitation</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300 font-medium">Notice Date (Max 14 Days Ago) *</label>
                <input
                  type="date"
                  required
                  value={adverseDecisionDate}
                  onChange={(e) => setAdverseDecisionDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-300 font-medium">
                Detailed Grounds for Appeal (Facts & Regulatory Context) *
              </label>
              <textarea
                rows={4}
                required
                value={groundsForAppeal}
                onChange={(e) => setGroundsForAppeal(e.target.value)}
                placeholder="Explain why the automated algorithmic heuristic arrived at an inaccurate determination, detailing commercial nexus, verified fulfillment capabilities, and corrected records..."
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-300 font-medium">
                Supplemental Evidence Document URLs (One per line, optional)
              </label>
              <textarea
                rows={2}
                value={evidenceUrls}
                onChange={(e) => setEvidenceUrls(e.target.value)}
                placeholder="https://secure.storage/evidence-bank-letter.pdf"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono text-xs"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors shadow-lg"
              >
                {isSubmitting ? 'Registering Appeal...' : 'Submit Appeal for Human Compliance Review'}
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-500">
          <Link href="/legal/automated-decisions-appeal" className="text-slate-400 hover:underline">
            &larr; Return to Automated Decisions & Appeal Rights Policy
          </Link>
        </div>
      </div>
    </div>
  );
}
