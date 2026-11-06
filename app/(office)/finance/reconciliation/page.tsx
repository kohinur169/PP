// path: app/(office)/finance/reconciliation/page.tsx

'use client';

import React, { useState, useEffect } from 'react';

interface MismatchItem {
  id: string;
  batchId: string;
  processor: string;
  detectedAt: string;
  expectedLedgerAmountUsd: number;
  actualProcessorAmountUsd: number;
  discrepancyUsd: number;
  status: 'pending_resolution' | 'investigating' | 'resolved';
  slaRemainingHours: number;
  slaRemainingMinutes: number;
  slaBreached: boolean;
  resolutionType?: string;
  resolutionNotes?: string;
}

export default function ReconciliationQueuePage() {
  const [items, setItems] = useState<MismatchItem[]>([
    {
      id: 'recon_01',
      batchId: 'BATCH_20261102_NMI_01',
      processor: 'nmi',
      detectedAt: '2026-11-02T10:00:00.000Z',
      expectedLedgerAmountUsd: 145200.5,
      actualProcessorAmountUsd: 144850.5,
      discrepancyUsd: 350.0,
      status: 'pending_resolution',
      slaRemainingHours: 16,
      slaRemainingMinutes: 45,
      slaBreached: false,
    },
    {
      id: 'recon_02',
      batchId: 'BATCH_20261103_STRIPE_04',
      processor: 'stripe_connect',
      detectedAt: '2026-11-03T08:30:00.000Z',
      expectedLedgerAmountUsd: 98450.0,
      actualProcessorAmountUsd: 96350.0,
      discrepancyUsd: 2100.0,
      status: 'pending_resolution',
      slaRemainingHours: 38,
      slaRemainingMinutes: 15,
      slaBreached: false,
    },
  ]);

  const [activeItem, setActiveItem] = useState<MismatchItem | null>(null);
  const [resolutionType, setResolutionType] = useState<
    'ADJUSTMENT_POSTED' | 'PROCESSOR_REVERSED' | 'TIMING_DIFFERENCE'
  >('ADJUSTMENT_POSTED');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;

    try {
      const res = await fetch('/api/office/finance/reconciliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'finance_ops',
        },
        body: JSON.stringify({
          mismatchId: activeItem.id,
          resolutionType,
          resolutionNotes: notes,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Resolution submission failed');
      }

      setItems((prev) =>
        prev.map((i) =>
          i.id === activeItem.id
            ? {
                ...i,
                status: 'resolved',
                resolutionType,
                resolutionNotes: notes,
              }
            : i
        )
      );

      setMessage({
        type: 'success',
        text: `Reconciliation discrepancy for batch ${activeItem.batchId} successfully resolved and recorded in audit ledger.`,
      });
      setActiveItem(null);
      setNotes('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Reconciliation Discrepancy Queue</h2>
        <p className="text-sm text-slate-400">
          Investigate variances between internal double-entry ledgers and processor settlement files. Enforces a strict 72-hour SLA deadline.
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
          <span className="text-sm font-semibold text-white">Active Settlement Mismatches</span>
          <span className="text-xs bg-slate-900 text-slate-400 px-2.5 py-1 rounded border border-slate-800">
            {items.filter((i) => i.status === 'pending_resolution').length} Pending Resolution
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Batch ID / Processor</th>
                <th className="py-3 px-4 font-semibold">Detected At</th>
                <th className="py-3 px-4 font-semibold text-right">Expected (Ledger)</th>
                <th className="py-3 px-4 font-semibold text-right">Actual (Gateway)</th>
                <th className="py-3 px-4 font-semibold text-right">Variance (USD)</th>
                <th className="py-3 px-4 font-semibold text-center">72-Hour SLA Countdown</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-900/30">
                  <td className="py-3 px-4">
                    <div className="font-mono text-white font-medium">{item.batchId}</div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">
                      {item.processor}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-mono">
                    {new Date(item.detectedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    ${item.expectedLedgerAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    ${item.actualProcessorAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-amber-400">
                    ${item.discrepancyUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {item.status === 'resolved' ? (
                      <span className="text-[11px] text-slate-500 font-mono">Resolved</span>
                    ) : item.slaBreached ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-rose-950 text-rose-300 border border-rose-800">
                        BREACHED
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono ${
                          item.slaRemainingHours < 24
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-slate-900 text-emerald-400 border border-slate-800'
                        }`}
                      >
                        {item.slaRemainingHours}h {item.slaRemainingMinutes}m left
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                        item.status === 'resolved'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {item.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {item.status === 'resolved' ? (
                      <span className="text-slate-500 text-xs">Done</span>
                    ) : (
                      <button
                        onClick={() => {
                          setActiveItem(item);
                          setMessage(null);
                        }}
                        className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
                      >
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {activeItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-white">Resolve Reconciliation Mismatch</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Batch: {activeItem.batchId}</p>
              </div>
              <button
                onClick={() => setActiveItem(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Expected Ledger Total:</span>
                <span className="text-slate-200">
                  ${activeItem.expectedLedgerAmountUsd.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Actual Processor Total:</span>
                <span className="text-slate-200">
                  ${activeItem.actualProcessorAmountUsd.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-amber-400 font-bold pt-1 border-t border-slate-800">
                <span>Variance:</span>
                <span>${activeItem.discrepancyUsd.toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleResolve} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Resolution Classification
                </label>
                <select
                  value={resolutionType}
                  onChange={(e) => setResolutionType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-white"
                >
                  <option value="ADJUSTMENT_POSTED">
                    Manual Ledger Adjustment Posted (Fee / Surcharge correction)
                  </option>
                  <option value="PROCESSOR_REVERSED">
                    Processor Error Reversed (Pending next settlement cycle)
                  </option>
                  <option value="TIMING_DIFFERENCE">
                    Timing Difference Confirmed (Cut-off boundary rollover)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Audit Documentation & Ledger Journal Reference
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe journal adjustments or processor support ticket ID..."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveItem(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded text-xs"
                >
                  Post Resolution & Close Discrepancy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
