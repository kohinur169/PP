// path: app/(office)/finance/payouts/failed/page.tsx

'use client';

import React, { useState } from 'react';

interface FailedPayout {
  id: string;
  payoutId: string;
  companyId: string;
  merchantName: string;
  amountUsd: number;
  bankAccountMasked: string;
  bankRouting: string;
  failureCode: string;
  failureReason: string;
  attemptedAt: string;
  status: string;
  resolutionAction?: string;
}

export default function FailedPayoutsPage() {
  const [payouts, setPayouts] = useState<FailedPayout[]>([
    {
      id: 'fp_01',
      payoutId: 'PO_20261101_ACH_881',
      companyId: '018f6c4c-3500-7fa1-b1e2-000000000001',
      merchantName: 'Acme Digital Services LLC',
      amountUsd: 14250.0,
      bankAccountMasked: '****4412',
      bankRouting: '021000021',
      failureCode: 'R01_INSUFFICIENT_FUNDS',
      failureReason: 'Originator account insufficient funds / return notice received from FedACH',
      attemptedAt: '2026-11-01T14:20:00.000Z',
      status: 'pending_investigation',
    },
    {
      id: 'fp_02',
      payoutId: 'PO_20261102_ACH_904',
      companyId: '018f6c4c-3500-7fa1-b1e2-000000000002',
      merchantName: 'Summit Cloud Logistics Inc',
      amountUsd: 8720.5,
      bankAccountMasked: '****9182',
      bankRouting: '121000358',
      failureCode: 'R04_INVALID_ACCOUNT_NUMBER',
      failureReason: 'Receiving bank reported account number structure invalid or closed',
      attemptedAt: '2026-11-02T11:05:00.000Z',
      status: 'pending_investigation',
    },
  ]);

  const [activePayout, setActivePayout] = useState<FailedPayout | null>(null);
  const [action, setAction] = useState<
    'RETRY_DISBURSEMENT' | 'HOLD_FOR_MERCHANT_BANK_UPDATE' | 'RETURN_TO_MERCHANT_BALANCE'
  >('HOLD_FOR_MERCHANT_BANK_UPDATE');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePayout) return;

    try {
      const res = await fetch('/api/office/finance/payouts/failed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'finance_ops',
        },
        body: JSON.stringify({
          failedPayoutId: activePayout.id,
          action,
          notes,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Resolution failed');
      }

      setPayouts((prev) =>
        prev.map((p) =>
          p.id === activePayout.id
            ? {
                ...p,
                status:
                  action === 'RETRY_DISBURSEMENT'
                    ? 'retried'
                    : action === 'HOLD_FOR_MERCHANT_BANK_UPDATE'
                    ? 'held_for_update'
                    : 'returned_to_ledger',
                resolutionAction: action,
              }
            : p
        )
      );

      setMessage({
        type: 'success',
        text: `Action "${action.replace(/_/g, ' ')}" executed for payout ${activePayout.payoutId}.`,
      });
      setActivePayout(null);
      setNotes('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Failed Payout Investigation</h2>
        <p className="text-sm text-slate-400">
          Investigate returned ACH and wire disbursements. Resolve banking network rejects (R01-R04) and release or hold settlement balances.
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg text-sm border ${
            message.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800 text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          <span className="text-sm font-semibold text-white">Active Return Incidents</span>
          <span className="text-xs bg-slate-900 text-slate-400 px-2.5 py-1 rounded border border-slate-800">
            {payouts.filter((p) => p.status === 'pending_investigation').length} Pending Review
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Payout ID / Merchant</th>
                <th className="py-3 px-4 font-semibold text-right">Amount (USD)</th>
                <th className="py-3 px-4 font-semibold">Bank Coordinates</th>
                <th className="py-3 px-4 font-semibold">Reject Code</th>
                <th className="py-3 px-4 font-semibold">Failure Reason</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {payouts.map((p) => (
                <tr key={p.id} className="hover:bg-slate-900/30">
                  <td className="py-3 px-4">
                    <div className="font-mono text-white font-medium">{p.payoutId}</div>
                    <div className="text-[11px] text-slate-400 font-medium">{p.merchantName}</div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-white">
                    ${p.amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">
                    <div>Acct: {p.bankAccountMasked}</div>
                    <div className="text-[10px] text-slate-500">Routing: {p.bankRouting}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800">
                      {p.failureCode}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300 max-w-xs truncate" title={p.failureReason}>
                    {p.failureReason}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                        p.status === 'pending_investigation'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {p.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {p.status === 'pending_investigation' ? (
                      <button
                        onClick={() => {
                          setActivePayout(p);
                          setMessage(null);
                        }}
                        className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors"
                      >
                        Investigate
                      </button>
                    ) : (
                      <span className="text-slate-500 text-xs">Resolved</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {activePayout && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-white">Investigate Failed Payout</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{activePayout.payoutId}</p>
              </div>
              <button
                onClick={() => setActivePayout(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Merchant:</span>
                <span className="text-white font-medium">{activePayout.merchantName}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Disbursement Amount:</span>
                <span className="text-emerald-400 font-mono font-bold">
                  ${activePayout.amountUsd.toFixed(2)} USD
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>FedACH Reject Reason:</span>
                <span className="text-rose-400 font-mono font-semibold">
                  {activePayout.failureCode}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-800">
                &ldquo;{activePayout.failureReason}&rdquo;
              </p>
            </div>

            <form onSubmit={handleResolve} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Resolution Protocol
                </label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-white"
                >
                  <option value="HOLD_FOR_MERCHANT_BANK_UPDATE">
                    Hold Payout (Require Merchant Bank Account Update in Portal)
                  </option>
                  <option value="RETURN_TO_MERCHANT_BALANCE">
                    Return to Available Balance (Post ledger credit to merchant balance)
                  </option>
                  <option value="RETRY_DISBURSEMENT">
                    Retry Disbursement (Transient network issue resolved)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Resolution Notes & Reference
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detail merchant communications, banking confirmations, or ACH ticket notes..."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActivePayout(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded text-xs"
                >
                  Execute Payout Action
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
