// path: app/(public)/legal/ubo-policy/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function UboPolicyPublicPage() {
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
          <span className="text-emerald-400 font-medium">UBO Identification Policy (≥ 25%)</span>
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
                  CDD Regulatory Policy
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                Ultimate Beneficial Ownership (UBO ≥ 25%) Policy
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
              <span className="text-slate-300 font-semibold block">Ownership Threshold</span>
              ≥ 25% Direct or Indirect Equity
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Regulatory Authority</span>
              FinCEN CDD Rule 31 CFR § 1010.230
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Biometric Mandate</span>
              Liveness Selfie + Government ID
            </div>
          </div>
        </div>

        {/* Policy Content Sections */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-xl space-y-8 text-slate-300 leading-relaxed text-sm sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              1. Regulatory Framework & Mandatory Scope
            </h2>
            <p>
              KD Solution IT enforces strict identification of Ultimate Beneficial Ownership across all corporate, LLC, partnership, and institutional sub-merchants. In full accordance with the United States Department of the Treasury Financial Crimes Enforcement Network (FinCEN) Customer Due Diligence rule and international Financial Action Task Force (FATF) standards, legal entity merchants must formally identify and verify all natural persons exercising significant economic ownership or executive control over the business entity.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              2. The 25% Ownership Prong
            </h2>
            <p>
              Any natural person who, directly or indirectly through contractual agreements, holding companies, trusts, or intermediate corporate vehicles, owns twenty-five percent (25%) or more of the equity, shares, capital, or profit interests of the merchant legal entity is classified as an Ultimate Beneficial Owner (UBO).
            </p>
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs sm:text-sm">
              <div className="font-semibold text-emerald-400">
                Mandatory Documentation for Every ≥ 25% Beneficial Owner:
              </div>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                <li>Full legal name, date of birth, residential street address, and nationality.</li>
                <li>Government-issued taxpayer identification number (e.g. SSN or National Tax ID).</li>
                <li>Unexpired government photo identification (Passport or National ID Card).</li>
                <li>Biometric selfie liveness challenge verified via automated anti-spoofing certification.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              3. The Executive Control Prong
            </h2>
            <p>
              In addition to all 25% or greater equity holders, every legal entity applicant must identify at least one (1) natural person who exercises significant executive control or managerial decision-making over the company (such as the Chief Executive Officer, Chief Operating Officer, Chief Financial Officer, Managing Member, or General Partner). The designated control person must execute the formal digital attestation certifying the accuracy and completeness of all declared beneficial ownership information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              4. Prohibited Nominee & Bearer Share Arrangements
            </h2>
            <p>
              Entities issuing or utilizing bearer shares, unregistered equity instruments, or blind voting trusts are strictly ineligible for onboarding or gateway activation. Nominee directors or non-beneficial straw owners deployed to obscure natural ownership are illegal and trigger immediate referral to regulatory authorities.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              5. Ongoing Sanctions Screening & Periodic Re-Certification
            </h2>
            <p>
              Every declared UBO and control person is submitted to automated daily screening against OFAC SDN, UN, EU, and UK sanctions lists, as well as global Politically Exposed Persons (PEP) registries. Merchants must re-certify their beneficial ownership structure annually or within thirty (30) days of any material equity transfer, ownership restructuring, or executive leadership change.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800/80 pt-6 text-center text-xs text-slate-500 space-y-2">
          <p>
            KD Solution IT Payment Processing Platform &middot; Fully Segregated Fiduciary Custody &middot; PCI-DSS Level 1 SAQ-A Certified
          </p>
          <p>
            For compliance inquiries, contact our designated Compliance Officer at{' '}
            <span className="text-slate-400 font-mono">compliance.officer@kdsolution.it</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
