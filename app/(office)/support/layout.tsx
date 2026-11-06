// path: app/(office)/support/layout.tsx

import React from 'react';
import Link from 'next/link';

export default function SupportLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="h-9 w-9 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-lg border border-blue-500/30">
            CS
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center space-x-2">
              <span>Customer Support Operations Portal</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                SUPPORT
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Merchant Inquiries, Ticketing Resolution & Transaction Status (Strict Gateway & KYC Isolation Enforced)
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs text-slate-400">
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded bg-slate-900 border border-slate-800">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            <span className="text-slate-300 font-mono">Gateway Keys: ISOLATED</span>
          </div>
          <div className="px-3 py-1 rounded bg-slate-900 border border-slate-800 font-mono text-slate-400">
            KYC Decisions: READ-ONLY / BLOCKED
          </div>
        </div>
      </header>

      <nav className="bg-slate-950/80 border-b border-slate-800 px-6 py-2 flex space-x-6 text-sm font-medium">
        <Link
          href="/support"
          className="text-slate-400 hover:text-white transition-colors py-1 border-b-2 border-transparent hover:border-blue-500"
        >
          Ticketing Queue
        </Link>
      </nav>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  );
}
