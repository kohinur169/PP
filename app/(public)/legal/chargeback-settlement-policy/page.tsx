// path: app/(public)/legal/chargeback-settlement-policy/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function ChargebackSettlementPolicyPublicPage() {
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
          <span className="text-emerald-400 font-medium">Chargeback & Settlement Policy</span>
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
                  Dispute & Settlement Terms
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                Chargeback, Dispute, Refund & Settlement Policy
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
              <span className="text-slate-300 font-semibold block">Evidence Submission SLA</span>
              24h Merchant / 48h Gateway Filing
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Risk Reserves</span>
              Tier 1 (10% 90d) / Tier 2 (5% 60d)
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Network Warning Gates</span>
              Early Warning &gt; 0.30% / Critical &gt; 0.90%
            </div>
          </div>
        </div>

        {/* Policy Content Sections */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-xl space-y-8 text-slate-300 leading-relaxed text-sm sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              1. Settlement Horizons, Rolling Reserves & Fiduciary Custody
            </h2>
            <p>
              KD Solution IT maintains fiduciary segregation for all customer and merchant custodial balances. Settlement payouts are calibrated to platform risk tiers:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-rose-400 block">Tier 1 (High Risk)</span>
                <p className="text-slate-300">
                  Mandatory 10% rolling reserve held for ninety (90) calendar days from capture.
                </p>
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-amber-400 block">Tier 2 (Medium Risk)</span>
                <p className="text-slate-300">
                  Mandatory 5% rolling reserve held for sixty (60) calendar days from capture.
                </p>
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-emerald-400 block">Tier 3 (Low Risk)</span>
                <p className="text-slate-300">
                  Standard zero base reserve with rolling T+2 business day settlement payouts.
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              New merchant accounts are subject to an initial seven (7) day settlement seasoning hold before their first scheduled payout.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              2. Dispute Evidence Submission SLAs & Response Mandates
            </h2>
            <p>
              Card brand network rules impose strict, non-negotiable representment timelines:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300 text-xs sm:text-sm">
              <li>
                <strong className="text-white">24-Hour Merchant Evidence Upload:</strong> Merchants must upload complete proof of delivery, signed tracking documentation, and customer interaction logs within twenty-four (24) hours of dispute notice.
              </li>
              <li>
                <strong className="text-white">48-Hour Gateway Representment Transmission:</strong> KD Solution IT transmits the compiled representment package to acquiring networks within forty-eight (48) hours. Failure to submit evidence within 24 hours results in automated concession of the dispute.
              </li>
              <li>
                <strong className="text-white">Visa Compelling Evidence 3.0:</strong> Submissions must meet Visa CE 3.0 and Mastercard pre-dispute collaboration standards.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              3. Dispute Assessment Fees, Non-Refundability & Negative Balance Sweep
            </h2>
            <p>
              Dispute administration is governed by the following financial terms:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300 text-xs sm:text-sm">
              <li>
                <strong className="text-white">Dispute Assessment Fee:</strong> A non-refundable fee of $25.00 USD is assessed per chargeback, irrespective of whether the merchant wins representment.
              </li>
              <li>
                <strong className="text-white">Non-Refundability of Platform Fees:</strong> Interchange, card brand assessments, and platform gateway fees are non-refundable upon customer refund or chargeback.
              </li>
              <li>
                <strong className="text-white">Automated ACH Debit Sweep:</strong> Unfunded negative merchant balances trigger automated ACH debit recovery against the merchant linked settlement account.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              4. Card Network Chargeback Monitoring Programs (&gt;0.30% Early Warning)
            </h2>
            <p>
              KD Solution IT enforces strict chargeback ratio monitoring against total monthly sales count:
            </p>
            <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl text-amber-200 text-xs space-y-2">
              <div className="font-bold uppercase tracking-wider">
                Card Brand Monitoring Threshold Warning (&gt; 0.30%)
              </div>
              <p>
                When a merchant chargeback-to-sales ratio exceeds 0.30%, an Early Warning Notice is triggered requiring a mandatory mitigation plan within ten (10) business days. Exceeding 0.90% triggers critical Visa VDMP and Mastercard ECP status, potential $50/dispute brand fines, and immediate account termination.
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800/80 pt-6 text-center text-xs text-slate-500 space-y-2">
          <p>
            KD Solution IT Payment Processing Platform &middot; Fully Segregated Fiduciary Custody &middot; PCI-DSS Level 1 SAQ-A Certified
          </p>
          <p>
            For dispute evidence submissions or settlement inquiries, contact our Dispute Department at{' '}
            <span className="text-slate-400 font-mono">compliance.officer@kdsolution.it</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
