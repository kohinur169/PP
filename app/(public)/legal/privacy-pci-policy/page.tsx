// path: app/(public)/legal/privacy-pci-policy/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function PrivacyPciPolicyPublicPage() {
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
          <span className="text-emerald-400 font-medium">Privacy & PCI-DSS Policy</span>
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
                  PCI-DSS SAQ A & Privacy Standard
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                Data Privacy (GDPR, CCPA) & PCI-DSS Compliance Policy
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
              <span className="text-slate-300 font-semibold block">PCI-DSS Scope</span>
              SAQ A (Zero Card Data Storage)
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Cryptographic Control</span>
              Pre-Upload AES-256-GCM Envelope Encryption
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Retention Standard</span>
              7-Year Statutory Financial & Tax Archive
            </div>
          </div>
        </div>

        {/* Policy Content Sections */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-xl space-y-8 text-slate-300 leading-relaxed text-sm sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              1. Absolute PCI-DSS SAQ A Scope & Zero Cardholder Data Retention
            </h2>
            <p>
              KD Solution IT enforces strict physical and architectural isolation of payment cardholder data. Under PCI-DSS v4.0, our infrastructure validates under Self-Assessment Questionnaire A (SAQ A):
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300 text-xs sm:text-sm">
              <li>
                <strong className="text-white">Provider-Hosted Fields Isolation:</strong> Primary account numbers (PAN), expiration dates, and CVV codes are entered exclusively by customers into processor-hosted iframes (NMI Collect.js, Stripe Elements, Rainforest Secure Fields).
              </li>
              <li>
                <strong className="text-white">Zero Server Ingestion:</strong> Sensitive card numbers never touch, traverse, or reside on KD Solution IT web servers, memory buffers, log streams, or databases.
              </li>
              <li>
                <strong className="text-white">Surrogate Tokenization:</strong> Only non-sensitive processor surrogate tokens, masked card numbers (e.g. **** 1234), and card brands are stored for order reconciliation.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              2. Cryptographic Security & Pre-Upload File Encryption (AES-256-GCM)
            </h2>
            <p>
              All non-card sensitive merchant verification files (government passports, UBO identity documents, certified bank statements) are encrypted on the client or API boundary using AES-256-GCM authenticated encryption prior to persistence in object storage:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-300 text-xs sm:text-sm">
              <li>Unique 96-bit Initialization Vector (IV) generated per file payload.</li>
              <li>128-bit authentication tag verification ensuring post-storage tamper resistance.</li>
              <li>Cryptographic domain separation keys managed via secure key derivation routines.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              3. Global Privacy Regimes & 7-Year Statutory Financial Retention
            </h2>
            <p>
              In full compliance with the EU GDPR, UK GDPR, and California CCPA/CPRA, data subjects may exercise rights of access, rectification, portability, and processing restriction.
            </p>
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="font-semibold text-emerald-400">
                Statutory Financial Retention Exemption (GDPR Article 17(3)(b)):
              </div>
              <p className="text-slate-300">
                Federal Bank Secrecy Act rules, tax laws, and anti-money laundering regulations mandate that all financial ledger entries, transaction histories, tax statements, and KYC/KYB dossiers be immutably preserved for seven (7) years post-termination. Right-to-erasure requests cannot extinguish these compulsory financial compliance records.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              4. Data Subject Request (DSR) Protocol
            </h2>
            <p>
              To submit a formal privacy or DSR inquiry, contact our Data Protection Officer at{' '}
              <span className="font-mono text-emerald-400">privacy.officer@kdsolution.it</span>. Identity verification is enforced prior to fulfilling requests, with a binding response SLA of thirty (30) calendar days.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800/80 pt-6 text-center text-xs text-slate-500 space-y-2">
          <p>
            KD Solution IT Payment Processing Platform &middot; Fully Segregated Fiduciary Custody &middot; PCI-DSS Level 1 SAQ-A Certified
          </p>
          <p>
            For privacy inquiries or Data Subject Requests, contact our Data Protection Officer at{' '}
            <span className="text-slate-400 font-mono">privacy.officer@kdsolution.it</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
