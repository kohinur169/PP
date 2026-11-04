// path: app/(office)/finance/processor-bills/page.tsx

'use client';

import React, { useState } from 'react';

interface ProcessorBill {
  id: string;
  invoiceNumber: string;
  processor: string;
  billingMonth: string;
  billedAmountUsd: number;
  calculatedFeeUsd: number;
  varianceUsd: number;
  status: 'matched' | 'variance_disputed' | 'under_review';
  notes?: string;
}

export default function ProcessorBillsPage() {
  const [bills, setBills] = useState<ProcessorBill[]>([
    {
      id: 'pb_01',
      invoiceNumber: 'INV-202610-NMI-8891',
      processor: 'nmi',
      billingMonth: '2026-10',
      billedAmountUsd: 14850.25,
      calculatedFeeUsd: 14850.25,
      varianceUsd: 0.0,
      status: 'under_review',
    },
    {
      id: 'pb_02',
      invoiceNumber: 'INV-202610-STRIPE-4012',
      processor: 'stripe_connect',
      billingMonth: '2026-10',
      billedAmountUsd: 22410.8,
      calculatedFeeUsd: 22150.3,
      varianceUsd: 260.5,
      status: 'under_review',
    },
    {
      id: 'pb_03',
      invoiceNumber: 'INV-202610-AIRWALLEX-1102',
      processor: 'airwallex',
      billingMonth: '2026-10',
      billedAmountUsd: 9140.0,
      calculatedFeeUsd: 9140.0,
      varianceUsd: 0.0,
      status: 'under_review',
    },
  ]);

  const [activeBill, setActiveBill] = useState<ProcessorBill | null>(null);
  const [decision, setDecision] = useState<'matched' | 'variance_disputed'>('matched');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBill) return;

    try {
      const res = await fetch('/api/office/finance/processor-bills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'finance_ops',
        },
        body: JSON.stringify({
          billId: activeBill.id,
          decision,
          notes,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Bill review submission failed');
      }

      setBills((prev) =>
        prev.map((b) =>
          b.id === activeBill.id
            ? {
                ...b,
                status: decision,
                notes,
              }
            : b
        )
      );

      setMessage({
        type: 'success',
        text: `Processor invoice ${activeBill.invoiceNumber} recorded as "${decision.replace('_', ' ')}".`,
      });
      setActiveBill(null);
      setNotes('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Processor Monthly Bill Verification</h2>
        <p className="text-sm text-slate-400">
          Match monthly gateway and interchange billing invoices against internal platform ledger deductions across all 5 payment processors (NMI, Payoneer, Rainforest, Stripe Connect, Airwallex).
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
          <span className="text-sm font-semibold text-white">Monthly Gateway Invoices</span>
          <span className="text-xs bg-slate-900 text-slate-400 px-2.5 py-1 rounded border border-slate-800">
            {bills.filter((b) => b.status === 'under_review').length} Pending Verification
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Invoice # / Processor</th>
                <th className="py-3 px-4 font-semibold">Billing Month</th>
                <th className="py-3 px-4 font-semibold text-right">Billed Amount</th>
                <th className="py-3 px-4 font-semibold text-right">Calculated Fee</th>
                <th className="py-3 px-4 font-semibold text-right">Variance</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {bills.map((b) => (
                <tr key={b.id} className="hover:bg-slate-900/30">
                  <td className="py-3 px-4">
                    <div className="font-mono text-white font-medium">{b.invoiceNumber}</div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">
                      {b.processor}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-mono">{b.billingMonth}</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-200">
                    ${b.billedAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-200">
                    ${b.calculatedFeeUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    <span
                      className={
                        b.varianceUsd > 0 ? 'text-amber-400 font-bold' : 'text-emerald-400'
                      }
                    >
                      ${b.varianceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                        b.status === 'matched'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : b.status === 'variance_disputed'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {b.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {b.status === 'under_review' ? (
                      <button
                        onClick={() => {
                          setActiveBill(b);
                          setDecision(b.varianceUsd > 0 ? 'variance_disputed' : 'matched');
                          setMessage(null);
                        }}
                        className="px-2.5 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded font-medium transition-colors"
                      >
                        Verify
                      </button>
                    ) : (
                      <span className="text-slate-500 text-xs">Reviewed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {activeBill && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-white">Review Processor Invoice</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{activeBill.invoiceNumber}</p>
              </div>
              <button
                onClick={() => setActiveBill(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Processor:</span>
                <span className="text-white uppercase">{activeBill.processor}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Billed Invoice Total:</span>
                <span className="text-white">${activeBill.billedAmountUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Platform Calculated Fees:</span>
                <span className="text-white">${activeBill.calculatedFeeUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-amber-400 font-bold pt-1 border-t border-slate-800">
                <span>Variance:</span>
                <span>${activeBill.varianceUsd.toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Verification Decision
                </label>
                <select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-white"
                >
                  <option value="matched">Matched (Amounts agree within tolerance)</option>
                  <option value="variance_disputed">
                    Variance Disputed (Submit billing inquiry ticket to processor)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Reconciliation Notes
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Record fee schedule notes or discrepancy breakdown..."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveBill(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded text-xs"
                >
                  Confirm Verification Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
