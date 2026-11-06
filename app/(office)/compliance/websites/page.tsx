// path: app/(office)/compliance/websites/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface MockStorefrontRecord {
  id: string;
  companyName: string;
  url: string;
  sslValid: boolean;
  termsFound: boolean;
  refundPolicyFound: boolean;
  contactFound: boolean;
  pricingUsdFound: boolean;
  complianceScore: number;
  verificationStatus: 'pending' | 'verified' | 'needs_remediation' | 'rejected';
}

const INITIAL_WEBSITES: MockStorefrontRecord[] = [
  {
    id: 'web_01',
    companyName: 'Apex Cloud Systems LLC',
    url: 'https://apexcloud.example.com',
    sslValid: true,
    termsFound: true,
    refundPolicyFound: true,
    contactFound: true,
    pricingUsdFound: true,
    complianceScore: 100,
    verificationStatus: 'verified',
  },
  {
    id: 'web_02',
    companyName: 'Meridian Global Goods Inc',
    url: 'https://meridianglobal.example.com',
    sslValid: true,
    termsFound: true,
    refundPolicyFound: false,
    contactFound: true,
    pricingUsdFound: true,
    complianceScore: 85,
    verificationStatus: 'pending',
  },
  {
    id: 'web_03',
    companyName: 'Velocita Direct Retailers LLC',
    url: 'http://insecure-store.example.com',
    sslValid: false,
    termsFound: false,
    refundPolicyFound: false,
    contactFound: false,
    pricingUsdFound: false,
    complianceScore: 20,
    verificationStatus: 'needs_remediation',
  },
];

export default function ComplianceWebsitesPage() {
  const [websites, setWebsites] = useState<MockStorefrontRecord[]>(INITIAL_WEBSITES);
  const [selectedSite, setSelectedSite] = useState<MockStorefrontRecord | null>(null);
  const [officerNotes, setOfficerNotes] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredWebsites = websites.filter((site) => {
    if (filterStatus === 'all') return true;
    return site.verificationStatus === filterStatus;
  });

  const handleUpdateStatus = (
    siteId: string,
    newStatus: 'verified' | 'needs_remediation' | 'rejected'
  ) => {
    setWebsites((prev) =>
      prev.map((s) => (s.id === siteId ? { ...s, verificationStatus: newStatus } : s))
    );
    setSelectedSite(null);
    setOfficerNotes('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Link href="/office" className="hover:text-white transition-colors">
            Compliance Office
          </Link>
          <span>/</span>
          <span className="text-slate-300">Merchant Storefront Audits</span>
          <span>/</span>
          <span className="text-emerald-400 font-medium">Website Verification Engine</span>
        </div>

        {/* Hero Header Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                Phase 7 Storefront Inspection
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                Merchant Website & Storefront Authenticity Engine
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Automated crawler inspects HTTPS SSL validity, Terms of Service, Refund Policy, Customer Contact details, and USD pricing disclosures.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400">
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Storefronts in Queue</span>
              {websites.filter((w) => w.verificationStatus === 'pending').length} Pending Inspection
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Active Verified</span>
              {websites.filter((w) => w.verificationStatus === 'verified').length} Storefronts Verified
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-semibold block">Gateway Activation Gate</span>
              Activation Blocked until Verified
            </div>
          </div>
        </div>

        {/* Status Filter Tab Bar */}
        <div className="flex items-center space-x-2 text-xs">
          {['all', 'pending', 'verified', 'needs_remediation', 'rejected'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors capitalize ${
                filterStatus === st
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Storefront Inspection Table */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">Merchant Entity</th>
                  <th className="p-3.5">Storefront URL</th>
                  <th className="p-3.5">SSL Protocol</th>
                  <th className="p-3.5">Automated Disclosures</th>
                  <th className="p-3.5">Audit Score</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Officer Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/30">
                {filteredWebsites.map((site) => (
                  <tr key={site.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-medium text-white">{site.companyName}</td>
                    <td className="p-3.5 font-mono text-emerald-400">
                      <a href={site.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {site.url} &nearr;
                      </a>
                    </td>
                    <td className="p-3.5">
                      {site.sslValid ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          HTTPS Valid
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                          Insecure HTTP
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center space-x-1.5 text-[10px]">
                        <span className={site.termsFound ? 'text-emerald-400' : 'text-slate-600'}>
                          Terms
                        </span>
                        <span>&middot;</span>
                        <span className={site.refundPolicyFound ? 'text-emerald-400' : 'text-slate-600'}>
                          Refund
                        </span>
                        <span>&middot;</span>
                        <span className={site.contactFound ? 'text-emerald-400' : 'text-slate-600'}>
                          Contact
                        </span>
                        <span>&middot;</span>
                        <span className={site.pricingUsdFound ? 'text-emerald-400' : 'text-slate-600'}>
                          USD $
                        </span>
                      </div>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-white">
                      {site.complianceScore}/100
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          site.verificationStatus === 'verified'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : site.verificationStatus === 'needs_remediation'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : site.verificationStatus === 'rejected'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {site.verificationStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => setSelectedSite(site)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold rounded-lg text-slate-200 border border-slate-700 transition-colors"
                      >
                        Inspect & Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inspection Modal */}
        {selectedSite && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-xs sm:text-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-white text-base">
                  Storefront Audit: {selectedSite.companyName}
                </h3>
                <button
                  onClick={() => setSelectedSite(null)}
                  className="text-slate-400 hover:text-white font-mono text-base"
                >
                  &times;
                </button>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Target URL:</span>
                  <a
                    href={selectedSite.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-emerald-400 hover:underline"
                  >
                    {selectedSite.url}
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">SSL Certificate:</span>
                  <span className={selectedSite.sslValid ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {selectedSite.sslValid ? 'PASS (HTTPS)' : 'FAIL (Insecure)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Terms of Service:</span>
                  <span>{selectedSite.termsFound ? 'Present' : 'Missing'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Refund Policy:</span>
                  <span>{selectedSite.refundPolicyFound ? 'Present' : 'Missing'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Contact Information:</span>
                  <span>{selectedSite.contactFound ? 'Present' : 'Missing'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pricing in USD:</span>
                  <span>{selectedSite.pricingUsdFound ? 'Present' : 'Missing'}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300 font-medium">Compliance Officer Review Notes</label>
                <textarea
                  rows={3}
                  value={officerNotes}
                  onChange={(e) => setOfficerNotes(e.target.value)}
                  placeholder="Record visual inspection findings, missing contact numbers, or verified refund terms..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => handleUpdateStatus(selectedSite.id, 'rejected')}
                  className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold text-xs"
                >
                  Reject Storefront
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedSite.id, 'needs_remediation')}
                  className="px-3 py-1.5 rounded-lg bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 font-bold text-xs"
                >
                  Request Remediation
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedSite.id, 'verified')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  Approve as Verified
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
