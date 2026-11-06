// path: app/(public)/legal/automated-decisions-appeal/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function AutomatedDecisionsAppealPublicPage() {
  const [hasDownloaded, setHasDownloaded] = useState(false);

  const handlePrintOrDownload = () => {
    setHasDownloaded(true);
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs text-slate-400 print:hidden">
          <Link href="/" className="hover:text-white transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/legal/terms-of-service" className="hover:text-white transition-colors">
            Legal & Compliance
          </Link>
          <span>/</span>
          <span className="text-emerald-400 font-medium">Automated Decision Appeals</span>
        </div>

        {/* Hero Header Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <div className="flex items-center space-x-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Version 1.0 (Active & Binding)
                </span>
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Human Administrative Review Rights
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                Automated Decision Review & Human Appeal Rights Policy
              </h1>
            </div>

            <div className="flex flex-col sm:items-end space-y-2">
              <div className="text-xs text-slate-400">
                <span className="block font-medium text-slate-300">Effective Date</span>
                <span className="font-mono text-emerald-400">November 1, 2026</span>
              </div>
              <button
                onClick={handlePrintOrDownload}
                className="print:hidden inline-flex items-center px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                <span>&#128438;</span>
                <span className="ml-1.5">Download / Print PDF</span>
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400">
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Regulatory Authority</span>
              GDPR Article 22 & CPRA Fair AI
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Appeal Deadline</span>
              14 Calendar Days from Notice
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Human Review SLA</span>
              5 Business Days Written Determination
            </div>
          </div>

          {/* Action CTA Box */}
          <div className="mt-6 p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
            <div>
              <div className="text-sm font-bold text-emerald-200">
                Received an Adverse Onboarding or Risk Decision?
              </div>
              <div className="text-xs text-slate-300">
                Submit an online appeal form within 14 calendar days for priority human re-examination.
              </div>
            </div>
            <Link
              href="/legal/appeal"
              className="inline-flex items-center justify-center px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-lg"
            >
              Submit Online Appeal Form &rarr;
            </Link>
          </div>
        </div>

        {/* Policy Content Sections */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-xl space-y-8 text-slate-300 leading-relaxed text-sm sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              1. Absolute Prohibition on Solely Automated Adverse Determinations
            </h2>
            <p>
              In strict accordance with European Union GDPR Article 22 and platform bylaws, KD Solution IT enforces an absolute prohibition against terminating or permanently denying merchant accounts based solely on automated profiling or algorithmic scoring.
            </p>
            <p>
              Every merchant has the legal right to request meaningful human intervention, to contest algorithmic conclusions, and to submit clarifying factual evidence.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              2. Step-by-Step Adverse Decision Appeal Workflow
            </h2>
            <p>
              To initiate a formal review of an automated underwriting rejection, risk tier increase, or transaction velocity hold:
            </p>
            <ol className="list-decimal pl-5 space-y-2 text-slate-300 text-xs sm:text-sm">
              <li>
                <strong className="text-white">Submit Within 14 Calendar Days:</strong> Access our public appeal form at <Link href="/legal/appeal" className="text-emerald-400 hover:underline">/legal/appeal</Link> within fourteen (14) days of receiving the adverse notification.
              </li>
              <li>
                <strong className="text-white">Provide Decision Reference:</strong> Quote the formal decision reference identifier and articulate the factual grounds explaining why the automated heuristic reached an inaccurate conclusion.
              </li>
              <li>
                <strong className="text-white">Attach Corroborating Evidence:</strong> Upload supporting identity documents, bank letters, commercial invoices, or proof of commercial nexus.
              </li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              3. Five-Day Compliance SLA & CEO Escalation Channel
            </h2>
            <p>
              Our Compliance Department, headed by the independent Compliance Officer, will re-examine the underwriting file de novo without algorithmic deference and issue a formal written determination within five (5) business days.
            </p>
            <p>
              If the merchant disputes the Compliance Officer determination, an executive appeal may be escalated to the Chief Executive Officer for final administrative determination.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800/80 pt-6 text-center text-xs text-slate-500 space-y-2">
          <p>
            KD Solution IT Payment Processing Platform &middot; Fully Segregated Fiduciary Custody &middot; PCI-DSS Level 1 SAQ-A Certified
          </p>
          <p>
            For appeal inquiries, contact our Compliance Department at{' '}
            <span className="text-slate-400 font-mono">compliance.officer@kdsolution.it</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
