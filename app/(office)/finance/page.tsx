// path: app/(office)/finance/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function FinanceOverviewPage() {
  const [stats, setStats] = useState({
    pendingMismatches: 2,
    imminentSlaBreaches: 1,
    failedPayouts: 3,
    pendingBills: 2,
    totalDiscrepancyUsd: 12450.8,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Finance Operations Command</h2>
        <p className="text-sm text-slate-400">
          Executive summary of daily settlement balance runs, 3-day reconciliation exceptions, and banking payout inquiries.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Reconciliation Discrepancies
            </span>
            <span className="h-2 w-2 rounded-full bg-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white">{stats.pendingMismatches}</span>
            <span className="text-xs font-mono text-amber-400">72-Hour SLA Active</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            ${stats.totalDiscrepancyUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} variance pending adjustment
          </p>
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <Link
              href="/finance/reconciliation"
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center space-x-1"
            >
              <span>Inspect Mismatches</span>
              <span>&rarr;</span>
            </Link>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Critical SLA Alerts
            </span>
            <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-rose-400">{stats.imminentSlaBreaches}</span>
            <span className="text-xs font-mono text-rose-400">&lt; 12h Remaining</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Requires immediate posting or processor ticket escalation
          </p>
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <Link
              href="/finance/reconciliation"
              className="text-xs text-rose-400 hover:text-rose-300 font-medium flex items-center space-x-1"
            >
              <span>Resolve Imminent Breach</span>
              <span>&rarr;</span>
            </Link>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Failed Payouts
            </span>
            <span className="h-2 w-2 rounded-full bg-blue-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white">{stats.failedPayouts}</span>
            <span className="text-xs font-mono text-blue-400">ACH / Wire Returns</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Hold for updated merchant bank coordinates or retry
          </p>
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <Link
              href="/finance/payouts/failed"
              className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center space-x-1"
            >
              <span>Investigate Returns</span>
              <span>&rarr;</span>
            </Link>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Processor Monthly Invoices
            </span>
            <span className="h-2 w-2 rounded-full bg-purple-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white">{stats.pendingBills}</span>
            <span className="text-xs font-mono text-purple-400">5 Gateways</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            NMI, Payoneer, Rainforest, Stripe Connect, Airwallex
          </p>
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <Link
              href="/finance/processor-bills"
              className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center space-x-1"
            >
              <span>Verify Gateway Bills</span>
              <span>&rarr;</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-lg p-6">
        <h3 className="text-base font-semibold text-white mb-2">
          Operational Standards & SLA Enforcement
        </h3>
        <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
          <li>
            <strong className="text-slate-200">72-Hour Resolution Mandate:</strong> All internal-vs-processor ledger mismatches must be investigated and resolved with adjustment posting within 72 hours of detection.
          </li>
          <li>
            <strong className="text-slate-200">ACH Returns (R01-R04):</strong> Bounced merchant disbursements require banking profile verification. Never retry without merchant contact or confirmation.
          </li>
          <li>
            <strong className="text-slate-200">Dual Control Compliance:</strong> Any ledger manual credit or debit adjustment exceeding $10,000 USD triggers mandatory four-eye sign-off from Super Admin or CEO.
          </li>
        </ul>
      </div>
    </div>
  );
}
