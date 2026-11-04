// path: app/(merchant)/layout.tsx

import React from 'react';
import Link from 'next/link';

export default function MerchantLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="h-9 w-9 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-lg border border-indigo-500/30">
            KD
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center space-x-2">
              <span>Merchant Portal</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                OWNER
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Sub-Merchant Operations, Invoicing, Transactions &amp; Payout Ledger
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs text-slate-400">
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded bg-slate-900 border border-slate-800 font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300">Tenant Isolation Active</span>
          </div>
          <div className="px-3 py-1 rounded bg-slate-900 border border-slate-800 font-mono text-slate-400">
            USD (18,4) Precision
          </div>
        </div>
      </header>

      <nav className="bg-slate-950/80 border-b border-slate-800 px-6 py-2 flex space-x-6 text-sm font-medium">
        <Link
          href="/dashboard"
          className="text-slate-400 hover:text-white transition-colors py-1 border-b-2 border-transparent hover:border-indigo-500"
        >
          Overview &amp; Metrics
        </Link>
        <Link
          href="/settings"
          className="text-slate-400 hover:text-white transition-colors py-1 border-b-2 border-transparent hover:border-indigo-500"
        >
          Company Profile &amp; Payouts
        </Link>
      </nav>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  );
}
