// path: app/(public)/legal/prohibited-businesses/page.tsx

'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { PROHIBITED_MCC_CATALOG, RESTRICTED_MCC_CATALOG } from '@/lib/compliance/mcc';

export default function ProhibitedBusinessesPublicPage() {
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PROHIBITED' | 'RESTRICTED'>('ALL');

  const handlePrintOrDownload = () => {
    setHasDownloaded(true);
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const filteredProhibited = useMemo(() => {
    if (filterType === 'RESTRICTED') return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return PROHIBITED_MCC_CATALOG;
    return PROHIBITED_MCC_CATALOG.filter(
      (item) =>
        item.mcc.includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [searchQuery, filterType]);

  const filteredRestricted = useMemo(() => {
    if (filterType === 'PROHIBITED') return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return RESTRICTED_MCC_CATALOG;
    return RESTRICTED_MCC_CATALOG.filter(
      (item) =>
        item.mcc.includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [searchQuery, filterType]);

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
          <span className="text-emerald-400 font-medium">Prohibited & Restricted Businesses</span>
        </div>

        {/* Hero Header Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <div className="flex items-center space-x-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-950 text-rose-300 border border-rose-800">
                  Version 1.0 (Active & Binding)
                </span>
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Merchant Acceptance Standard
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                Underwriting & Prohibited/Restricted Businesses Policy
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
              <span className="text-slate-300 font-semibold block">Governing Standards</span>
              Visa Core Rules & Mastercard BRAM
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Automated Gating</span>
              MCC Interception at Underwriting Submission
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Misclassification Penalty</span>
              Instant Termination + MATCH/TMF Blacklist
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between print:hidden">
          <div className="w-full sm:w-1/2">
            <input
              type="text"
              placeholder="Search by MCC (e.g. 5967, 7995) or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center space-x-1 text-xs">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                filterType === 'ALL'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              All Categories
            </button>
            <button
              onClick={() => setFilterType('PROHIBITED')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                filterType === 'PROHIBITED'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Strictly Prohibited
            </button>
            <button
              onClick={() => setFilterType('RESTRICTED')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                filterType === 'RESTRICTED'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Restricted (High-Risk)
            </button>
          </div>
        </div>

        {/* Policy Content Sections */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-xl space-y-8 text-slate-300 leading-relaxed text-sm sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              1. Merchant Acceptance Standard & Industry Classification
            </h2>
            <p>
              KD Solution IT enforces strict underwriting standards to prevent illegal activities, minimize card brand disputes, and adhere to acquiring bank sponsor rules. Every merchant legal entity must select their genuine commercial Merchant Category Code (MCC).
            </p>
          </section>

          {/* Prohibited Catalog Table */}
          {filteredProhibited.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <h3 className="text-lg font-bold text-rose-300">
                  Strictly Prohibited Merchant Categories (Zero-Tolerance)
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Merchants engaged in the following sectors are strictly barred from opening accounts or utilizing platform payment processing gateways.
              </p>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-3">MCC</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Scope & Prohibited Typologies</th>
                      <th className="p-3">Governing Brand Rule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {filteredProhibited.map((item) => (
                      <tr key={item.mcc} className="hover:bg-slate-800/30">
                        <td className="p-3 font-mono font-bold text-rose-400">{item.mcc}</td>
                        <td className="p-3 font-semibold text-white">{item.category}</td>
                        <td className="p-3 text-slate-300">{item.description}</td>
                        <td className="p-3 text-slate-400 font-mono text-[11px]">
                          {item.ruleReference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Restricted Catalog Table */}
          {filteredRestricted.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <h3 className="text-lg font-bold text-amber-300">
                  Restricted Business Categories (Enhanced Underwriting & Reserves)
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Applicants in these categories require specialized licensing verification, executive committee underwriting sign-off, and mandatory rolling reserves.
              </p>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-3">MCC</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Mandatory Reserve Term</th>
                      <th className="p-3">Mandatory Documentation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {filteredRestricted.map((item) => (
                      <tr key={item.mcc} className="hover:bg-slate-800/30">
                        <td className="p-3 font-mono font-bold text-amber-400">{item.mcc}</td>
                        <td className="p-3 font-semibold text-white">{item.category}</td>
                        <td className="p-3 text-amber-300 font-semibold">
                          {item.mandatoryReservePercent}% Rolling / {item.mandatoryReserveDays} Days
                        </td>
                        <td className="p-3 text-slate-300">
                          <ul className="list-disc pl-4 space-y-0.5">
                            {item.requiredLicenses.map((lic, idx) => (
                              <li key={idx}>{lic}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
              2. Misclassification Penalties & Fraud Enforcement
            </h2>
            <p>
              Merchants that intentionally obscure or falsify their business activity to bypass MCC restrictions commit bank fraud (18 U.S.C. § 1344). KD Solution IT enforces immediate account termination, asset freezing, and mandatory listing on the Mastercard MATCH / Visa TMF database.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800/80 pt-6 text-center text-xs text-slate-500 space-y-2">
          <p>
            KD Solution IT Payment Processing Platform &middot; Fully Segregated Fiduciary Custody &middot; PCI-DSS Level 1 SAQ-A Certified
          </p>
          <p>
            For underwriting appeals or restricted business inquiries, contact our Underwriting Department at{' '}
            <span className="text-slate-400 font-mono">compliance.officer@kdsolution.it</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
