// path: app/(merchant)/dashboard/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function MerchantDashboardOverviewPage() {
  const [metrics, setMetrics] = useState({
    businessName: 'Acme Digital Services LLC',
    riskTier: 1,
    grossVolumeUsd: 142500.0,
    netSettledUsd: 138225.0,
    availableBalanceUsd: 24850.5,
    pendingSettlementUsd: 12400.0,
    rollingReserveUsd: 7125.0,
    activeHoldsUsd: 0.0,
    disputeCount: 2,
    totalTransactionsCount: 450,
    chargebackRatePercent: 0.44,
    chargebackRateBreached: false,
    recentTransactions: [
      {
        id: 'tx_01',
        amountUsd: 450.0,
        status: 'succeeded',
        customerEmail: 'j.smith@clientcorp.com',
        createdAt: '2026-11-04T14:20:00.000Z',
      },
      {
        id: 'tx_02',
        amountUsd: 1200.0,
        status: 'succeeded',
        customerEmail: 'billing@nordictech.io',
        createdAt: '2026-11-04T12:05:00.000Z',
      },
      {
        id: 'tx_03',
        amountUsd: 85.5,
        status: 'disputed',
        customerEmail: 'm.clark@retailbuyer.net',
        createdAt: '2026-11-03T19:40:00.000Z',
      },
      {
        id: 'tx_04',
        amountUsd: 2400.0,
        status: 'pending',
        customerEmail: 'finance@apolloconsulting.org',
        createdAt: '2026-11-03T16:15:00.000Z',
      },
    ],
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-3">
            <span>{metrics.businessName}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
              Risk Tier {metrics.riskTier} (5% Rolling Reserve / 180 Days)
            </span>
          </h2>
          <p className="text-sm text-slate-400">
            Real-time merchant balance, settlement status, and dispute monitoring.
          </p>
        </div>

        <div className="flex space-x-2">
          <Link
            href="/settings"
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium transition-colors"
          >
            Bank Payout Settings
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Available for Payout
          </span>
          <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
            ${metrics.availableBalanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Disbursable on next daily ACH sweep
          </p>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Pending Settlement
          </span>
          <div className="mt-2 text-2xl font-bold text-white font-mono">
            ${metrics.pendingSettlementUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Batches clearing through acquiring network
          </p>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Rolling Reserve Hold
          </span>
          <div className="mt-2 text-2xl font-bold text-indigo-400 font-mono">
            ${metrics.rollingReserveUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Tier {metrics.riskTier} reserve protecting against chargebacks
          </p>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Dispute &amp; Chargeback Rate
            </span>
            <span
              className={`h-2 w-2 rounded-full ${
                metrics.chargebackRateBreached ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'
              }`}
            />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span
              className={`text-2xl font-bold font-mono ${
                metrics.chargebackRateBreached ? 'text-rose-400' : 'text-white'
              }`}
            >
              {metrics.chargebackRatePercent.toFixed(2)}%
            </span>
            <span className="text-xs text-slate-500 font-mono">(&lt; 1.00% card limit)</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {metrics.disputeCount} disputes across {metrics.totalTransactionsCount} transactions
          </p>
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          <span className="text-sm font-semibold text-white">Recent Payment Transactions</span>
          <span className="text-xs text-slate-400 font-mono">
            30-Day Gross: ${metrics.grossVolumeUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Transaction ID</th>
                <th className="py-3 px-4 font-semibold text-right">Amount (USD)</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold">Customer Email</th>
                <th className="py-3 px-4 font-semibold">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {metrics.recentTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-900/30">
                  <td className="py-3 px-4 font-mono font-medium text-white">{tx.id}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-100">
                    ${tx.amountUsd.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                        tx.status === 'succeeded'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : tx.status === 'disputed'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-mono">{tx.customerEmail}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {new Date(tx.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
