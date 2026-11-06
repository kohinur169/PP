// path: app/(public)/legal/kyc-kyb-policy/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function KycKybPolicyPublicPage() {
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
          <span className="text-emerald-400 font-medium">KYC & KYB Due Diligence Policy</span>
        </div>

        {/* Hero Header */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <div className="flex items-center space-x-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Version 1.0 (Active & Binding)
                </span>
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Compliance Policy
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                Customer & Merchant Due Diligence (KYC/KYB) Policy
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
              <span className="text-slate-300 font-semibold block">Regulatory Mandate</span>
              FinCEN 31 CFR Part 1022 & EU AMLD6
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Underwriting Standard</span>
              Tier 1 Card Brand Gating (Visa/MC)
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Standard Review Time</span>
              1 - 2 Business Days
            </div>
          </div>
        </div>

        {/* Policy Content Sections */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-xl space-y-8 text-slate-300 leading-relaxed text-sm sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              1. Regulatory Purpose and Objective
            </h2>
            <p>
              KD Solution IT operates as a secure multi-processor payment orchestration and merchant aggregation platform. In compliance with the Bank Secrecy Act (BSA), USA PATRIOT Act, FinCEN Customer Due Diligence (CDD) final rule, EU 5th and 6th Anti-Money Laundering Directives, and payment card brand (Visa, Mastercard, American Express) operating regulations, KD Solution IT enforces rigorous Know Your Customer (KYC) and Know Your Business (KYB) procedures before any merchant account may process charges or receive settlement payouts.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              2. Know Your Business (KYB) Entity Requirements
            </h2>
            <p>
              Every corporate applicant, LLC, partnership, or registered sole proprietorship must provide authoritative proof of legal existence:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-300 text-sm">
              <li>
                <strong>Government Business Registration:</strong> Articles of Incorporation, Certificate of Organization, or government registry extract issued within the preceding 12 months.
              </li>
              <li>
                <strong>Tax Identification Number:</strong> Official IRS Letter 147C, Form CP 575 (for US entities), or registered national VAT/GST document (for European and international entities).
              </li>
              <li>
                <strong>Physical Operating Address Verification:</strong> Active commercial lease agreement or utility invoice (telecom, electric, water) dated within 90 days. Virtual PO Boxes or mail-forwarding drop services are strictly prohibited without physical operating nexus.
              </li>
              <li>
                <strong>Active Commercial Bank Account:</strong> Voided company check or formal bank verification letter confirming business account ownership matching the legal entity name exactly.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              3. Know Your Customer (KYC) & Ultimate Beneficial Owner (UBO) Identification
            </h2>
            <p>
              In accordance with FinCEN CDD 31 CFR &sect; 1010.230:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-300 text-sm">
              <li>
                <strong>Ownership Prongs (&ge; 25% Equity):</strong> Every individual who owns, directly or indirectly, twenty-five percent (25%) or more of the equity interests of the legal entity merchant must be fully identified.
              </li>
              <li>
                <strong>Control Prong:</strong> At least one natural person with significant responsibility to control, manage, or direct the legal entity (e.g., Chief Executive Officer, Chief Financial Officer, Managing Partner).
              </li>
              <li>
                <strong>Mandatory Identity Documentation:</strong> Unexpired government-issued photo ID (Passport, National ID, or Driver&apos;s License), biometric selfie liveness challenge verified through automated anti-spoofing algorithms, and residential proof of address within 90 days.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              4. Sanctions & Politically Exposed Persons (PEP) Screening
            </h2>
            <p>
              Every merchant entity, director, and UBO is screened prior to onboarding and continuously re-screened on a 24-hour cycle against OFAC Specially Designated Nationals (SDN), UN Consolidated Sanctions, and EU Consolidated Sanctions. Any confirmed match to an active sanctions program triggers an immediate, unalterable block on account capability activation, payout disbursement, and payment acceptance.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              5. Review Timelines and Underwriting Gating
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg">
                <span className="text-xs font-bold text-amber-400 block">Stage 1: Pending</span>
                <p className="text-xs text-slate-400 mt-1">
                  Portal access enabled; API credentials restricted to Sandbox Mode only.
                </p>
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg">
                <span className="text-xs font-bold text-emerald-400 block">Stage 2: Approved</span>
                <p className="text-xs text-slate-400 mt-1">
                  Live gateway processing activated; daily settlement schedule initiated.
                </p>
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg">
                <span className="text-xs font-bold text-indigo-400 block">Stage 3: High Risk Gated</span>
                <p className="text-xs text-slate-400 mt-1">
                  Tier 3 merchants activated subject to 10% 180-day rolling reserve.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              6. Digital Record Retention & Audit Immutability
            </h2>
            <p>
              All collected KYC/KYB identity files and proof of address records are stored encrypted at rest using AES-256-GCM envelope encryption. Audit logs tracking every verification decision, approval, and rejection are cryptographically sealed in Ed25519 hash-chained append-only ledgers and retained for a minimum of five (5) years following merchant account termination.
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
