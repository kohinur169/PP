// path: app/(public)/legal/sanctions-pep-policy/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function SanctionsPepPolicyPublicPage() {
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
          <span className="text-emerald-400 font-medium">Sanctions & PEP Policy</span>
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
                  Global Sanctions Policy
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                Sanctions (OFAC / UN / EU / UK HMT) & PEP Screening Policy
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
              <span className="text-slate-300 font-semibold block">Screened Watchlists</span>
              OFAC SDN, UN, EU EEAS, UK OFSI
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Embargoed Jurisdictions</span>
              CU, IR, KP, SY, RU, UA (Occupied)
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">PEP Due Diligence</span>
              Mandatory SoW & SoF Executive Sign-off
            </div>
          </div>
        </div>

        {/* Policy Content Sections */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-xl space-y-8 text-slate-300 leading-relaxed text-sm sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              1. Global Sanctions Framework & Mandatory Scope
            </h2>
            <p>
              KD Solution IT enforces strict, comprehensive, and continuous compliance with international economic and trade sanctions. As a global payment facilitator, the platform is legally bound to prevent sanctioned natural persons, entities, vessels, and jurisdictions from accessing financial processing services.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-emerald-400 block">United States (OFAC)</span>
                Specially Designated Nationals (SDN) & Blocked Persons, Foreign Sanctions Evaders, and Sectoral Sanctions (31 CFR Parts 500-599).
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-emerald-400 block">United Nations (UNSC)</span>
                Consolidated Sanctions List enacted under Chapter VII of the United Nations Charter.
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-emerald-400 block">European Union (EEAS)</span>
                EU Consolidated Financial Sanctions List maintained by the European External Action Service.
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-emerald-400 block">United Kingdom (OFSI)</span>
                UK HM Treasury Office of Financial Sanctions Implementation Consolidated Asset Freeze List.
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              2. Daily Automated Screening & Continuous Monitoring
            </h2>
            <p>
              Watchlist cross-referencing is executed at three distinct operational junctures:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300 text-xs sm:text-sm">
              <li>
                <strong className="text-white">Onboarding Underwriting Gate:</strong> Every legal entity, registered DBA, director, executive control person, and UBO (≥ 25%) is checked prior to credential issuance.
              </li>
              <li>
                <strong className="text-white">Daily Automated Delta Re-Screening:</strong> Daily batch synchronization cross-references all active merchant rosters against newly published OFAC and international SDN modifications.
              </li>
              <li>
                <strong className="text-white">Real-Time Transaction Heuristics:</strong> Consumer cardholder billing names and payout recipient banking details undergo instant real-time watchlist screening.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              3. Politically Exposed Persons (PEP) & Enhanced Due Diligence (EDD)
            </h2>
            <p>
              In alignment with FATF Recommendation 12, KD Solution IT identifies Politically Exposed Persons across Tier 1 (Heads of State/Ministers), Tier 2 (Judicial/Military/SOE Chiefs), Tier 3 (International Organization leaders), and Relatives and Close Associates (RCAs).
            </p>
            <p>
              PEP involvement mandates Enhanced Due Diligence (EDD), independent verification of Source of Wealth (SoW) and Source of Funds (SoF), and joint sign-off by the Chief Compliance Officer and Chief Executive Officer.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              4. Confirmed Positive Match: Immediate Account Freeze & Fund Blocking
            </h2>
            <p>
              Upon verification of a true-positive match against an active asset freeze list:
            </p>
            <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-200 text-xs space-y-2">
              <div className="font-bold uppercase tracking-wider">
                Mandatory Asset Freeze Protocol (31 CFR § 501.201)
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">
                <li>Merchant processing gateway credentials and API keys are terminated immediately.</li>
                <li>All outgoing settlements, batch payouts, and refund attempts are blocked.</li>
                <li>All merchant balances are transferred to a segregated, blocked fiduciary holding account.</li>
                <li>Formal regulatory disclosure is transmitted to OFAC / national sanctions authorities within ten (10) business days.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              5. False Positive Disambiguation Protocol & Merchant Appeals
            </h2>
            <p>
              KD Solution IT maintains a dedicated appeal and disambiguation procedure for false positive hits arising from identical or similar naming conventions:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-300 text-xs sm:text-sm">
              <li>
                <strong className="text-white">Submission Dossier:</strong> Submit certified government passport, proof of address (&lt; 90 days), and official government tax ID showing date and place of birth.
              </li>
              <li>
                <strong className="text-white">Review SLA:</strong> The Compliance Department reviews identity disambiguation submissions within two (2) business days.
              </li>
              <li>
                <strong className="text-white">Audit Logging:</strong> Cleared false positives are immutably signed and recorded in the cryptographic audit trail.
              </li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800/80 pt-6 text-center text-xs text-slate-500 space-y-2">
          <p>
            KD Solution IT Payment Processing Platform &middot; Fully Segregated Fiduciary Custody &middot; PCI-DSS Level 1 SAQ-A Certified
          </p>
          <p>
            For sanctions screening inquiries or disambiguation appeals, contact our Compliance Department at{' '}
            <span className="text-slate-400 font-mono">compliance.officer@kdsolution.it</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
