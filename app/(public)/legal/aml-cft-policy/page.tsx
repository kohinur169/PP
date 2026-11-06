// path: app/(public)/legal/aml-cft-policy/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function AmlCftPolicyPublicPage() {
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
          <span className="text-emerald-400 font-medium">AML & CFT Policy</span>
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
                  AML/CFT Compliance Standard
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                Anti-Money Laundering (AML) & Counter-Terrorist Financing (CFT) Policy
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
              <span className="text-slate-300 font-semibold block">Statutory Basis</span>
              FinCEN BSA 31 CFR Chapter X & AMLD6
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Automated Monitoring</span>
              Real-time Heuristic & Velocity Spike Gates
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Regulatory Disclosures</span>
              SAR Filing within 30 Days (Anti-Tipping-Off)
            </div>
          </div>
        </div>

        {/* Policy Content Sections */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-xl space-y-8 text-slate-300 leading-relaxed text-sm sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              1. Policy Statement, Governance & Independent Compliance Officer
            </h2>
            <p>
              KD Solution IT maintains a strict zero-tolerance compliance posture regarding money laundering, terrorist financing, proliferation financing, commercial fraud, and illicit capital movement. The platform appoints an independent Anti-Money Laundering Compliance Officer (AMLCO) holding accredited credentials (CAMS, CRCM) who reports directly to the Chief Executive Officer and the Board of Directors with independent authority to freeze accounts and execute regulatory disclosures.
            </p>
            <p>
              The platform AML program undergoes annual independent external audit and continuous enterprise risk calibrations across merchant risk tiers (Tier 1, Tier 2, Tier 3).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              2. Automated Real-Time Transaction Monitoring & Velocity Limits
            </h2>
            <p>
              Every transaction traversing the gateway is evaluated in real time against velocity, geolocation, and card testing heuristics:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-300 text-xs sm:text-sm">
              <li>
                <strong className="text-white">Volume Surges:</strong> Processing spikes exceeding 300% of declared underwriting monthly volume trigger automated settlement holds.
              </li>
              <li>
                <strong className="text-white">Card Testing & Bot Attack Gates:</strong> Rapid authorization frequency (&gt; 5 attempts in 60 seconds from identical IP or device fingerprints) results in automated rate-limiting.
              </li>
              <li>
                <strong className="text-white">Geographic Mismatches:</strong> Routing checks flag discrepancies between customer card issuing country, device IP geolocation, and merchant fulfillment origin.
              </li>
              <li>
                <strong className="text-white">Dormancy Reactivation:</strong> Accounts dormant for sixty (60) or more days that suddenly process high-ticket volumes are placed on temporary verification hold.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              3. Comprehensive Red Flag Behavior Catalog
            </h2>
            <p>
              Merchants are strictly prohibited from conducting, aiding, or abetting any of the following prohibited transaction typologies:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <div className="font-semibold text-rose-400">Structuring & Smurfing</div>
                <p className="text-slate-400">
                  Splitting sales into sub-$10,000 or sub-$3,000 amounts specifically designed to circumvent Bank Secrecy Act reporting thresholds.
                </p>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <div className="font-semibold text-rose-400">Round-Tripping & Self-Dealing</div>
                <p className="text-slate-400">
                  Processing payments on cards owned by the merchant, its owners, or directors to simulate organic business revenue or extract credit lines.
                </p>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <div className="font-semibold text-rose-400">Unlicensed Money Transmission</div>
                <p className="text-slate-400">
                  Operating e-commerce flows as surrogate remittance conduits, check cashers, or cryptocurrency loading rails without state/federal MSB licenses.
                </p>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <div className="font-semibold text-rose-400">Refund Rail Arbitrage</div>
                <p className="text-slate-400">
                  Accepting card payments followed by requests to issue refunds to alternative financial rails or cryptocurrency addresses.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              4. Suspicious Activity Reporting (SAR) & Anti-Tipping-Off Protocol
            </h2>
            <p>
              In full compliance with 31 U.S.C. § 5318(g), KD Solution IT files FinCEN Suspicious Activity Reports (Form 111) within thirty (30) calendar days of detecting illicit patterns.
            </p>
            <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl text-amber-200 text-xs space-y-1.5">
              <div className="font-bold uppercase tracking-wider">
                Strict Federal Criminal Prohibition: Anti-Tipping-Off Mandate
              </div>
              <p>
                Under 31 U.S.C. § 5318(g)(2), KD Solution IT and its personnel are strictly prohibited under federal criminal penalties from disclosing to any merchant, account holder, or third party that a SAR has been filed or that an account is subject to law enforcement inquiry.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              5. Record Retention, Merchant Attestation & Sanctions
            </h2>
            <p>
              All customer identity dossiers, transaction logs, dispute records, and communications are archived for a mandatory minimum period of five (5) years post-termination. Every onboarded merchant executes an immutable digital attestation to this policy during underwriting. Breaches trigger immediate gateway termination, MATCH/TMF listing, and referral to law enforcement.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800/80 pt-6 text-center text-xs text-slate-500 space-y-2">
          <p>
            KD Solution IT Payment Processing Platform &middot; Fully Segregated Fiduciary Custody &middot; PCI-DSS Level 1 SAQ-A Certified
          </p>
          <p>
            For AML and compliance inquiries, contact our designated Compliance Officer at{' '}
            <span className="text-slate-400 font-mono">compliance.officer@kdsolution.it</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
