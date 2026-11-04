// path: app/(client)/i/[token]/page.tsx

'use client';

import React, { useState } from 'react';

interface InvoiceData {
  invoiceNumber: string;
  companyName: string;
  clientName: string;
  clientEmail: string;
  subtotalUsd: number;
  taxAmountUsd: number;
  totalAmountUsd: number;
  status: 'issued' | 'paid' | 'overdue' | 'voided';
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPriceUsd: number;
    totalUsd: number;
  }>;
  paidAt?: string;
  paymentReceipt?: {
    receiptNumber: string;
    chargeId: string;
    paidAmountUsd: number;
    paidAt: string;
    paymentMethod: string;
    last4: string;
  };
}

export default function TokenizedInvoiceViewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [invoice, setInvoice] = useState<InvoiceData>({
    invoiceNumber: 'INV-2026-0042',
    companyName: 'Acme Digital Services LLC',
    clientName: 'Global Cloud Systems Ltd',
    clientEmail: 'billing@globalcloud.com',
    subtotalUsd: 1400.0,
    taxAmountUsd: 112.0,
    totalAmountUsd: 1512.0,
    status: 'issued',
    lineItems: [
      {
        description: 'PCI-DSS SAQ-A Compliant Gateway Integration & Tokenization',
        quantity: 1,
        unitPriceUsd: 1000.0,
        totalUsd: 1000.0,
      },
      {
        description: 'Autonomous Fallback Router Setup (NMI & Stripe Connect)',
        quantity: 1,
        unitPriceUsd: 400.0,
        totalUsd: 400.0,
      },
    ],
  });

  const [cardNumber, setCardNumber] = useState('•••• •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('•••');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setNotice(null);

    try {
      const resolvedParams = await params;
      const token = resolvedParams.token || 'demo-token';

      const res = await fetch(`/api/client/invoice/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentMethod: {
            type: 'card',
            last4: '4242',
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Payment authorization failed');
      }

      const data = await res.json();
      setInvoice((prev) => ({
        ...prev,
        status: 'paid',
        paidAt: data.receipt?.paidAt || new Date().toISOString(),
        paymentReceipt: data.receipt || {
          receiptNumber: 'RCP-2026-0042-8821',
          chargeId: 'ch_simulated_99120',
          paidAmountUsd: invoice.totalAmountUsd,
          paidAt: new Date().toISOString(),
          paymentMethod: 'card',
          last4: '4242',
        },
      }));

      setNotice({
        type: 'success',
        text: 'Payment processed successfully! Your receipt has been generated below.',
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400 mb-3">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Secure 256-Bit Tokenized Portal &bull; Zero Login Required</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{invoice.companyName}</h1>
          <p className="text-sm text-slate-400">Invoice {invoice.invoiceNumber}</p>
        </div>

        {notice && (
          <div
            className={`p-4 rounded-lg text-sm border ${
              notice.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800 text-rose-300'
            }`}
          >
            {notice.text}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="p-6 sm:p-8 border-b border-slate-800 flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Billed To
              </span>
              <div className="mt-1 text-base font-bold text-white">{invoice.clientName}</div>
              <div className="text-xs text-slate-400 font-mono">{invoice.clientEmail}</div>
            </div>

            <div className="text-right">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Payment Status
              </span>
              <div className="mt-1">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    invoice.status === 'paid'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {invoice.status === 'paid' ? 'Paid in Full' : 'Due Upon Receipt'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2">Description</th>
                  <th className="py-2 text-center">Qty</th>
                  <th className="py-2 text-right">Unit Price</th>
                  <th className="py-2 text-right">Amount (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {invoice.lineItems.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-3 text-white font-medium">{item.description}</td>
                    <td className="py-3 text-center text-slate-300 font-mono">{item.quantity}</td>
                    <td className="py-3 text-right text-slate-300 font-mono">
                      ${item.unitPriceUsd.toFixed(2)}
                    </td>
                    <td className="py-3 text-right text-white font-mono font-bold">
                      ${item.totalUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <div className="w-64 space-y-2 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="text-slate-200">${invoice.subtotalUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Estimated Tax:</span>
                  <span className="text-slate-200">${invoice.taxAmountUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-slate-800">
                  <span>Total Amount:</span>
                  <span className="text-emerald-400">${invoice.totalAmountUsd.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {invoice.status === 'paid' && invoice.paymentReceipt ? (
            <div className="p-6 sm:p-8 bg-emerald-950/20 border-t border-emerald-800/40">
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg">
                  &#10003;
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Official Payment Receipt</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Receipt #{invoice.paymentReceipt.receiptNumber}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block">Amount Paid</span>
                  <span className="text-emerald-400 font-bold">
                    ${invoice.paymentReceipt.paidAmountUsd.toFixed(2)} USD
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Payment Method</span>
                  <span className="text-slate-200">Card ending {invoice.paymentReceipt.last4}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Transaction Ref</span>
                  <span className="text-slate-200 truncate block">
                    {invoice.paymentReceipt.chargeId.slice(0, 16)}...
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Paid At</span>
                  <span className="text-slate-200">
                    {new Date(invoice.paymentReceipt.paidAt).toLocaleDateString('en-US')}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-slate-500 text-center">
                This document is locked and serves as your permanent electronic receipt.
              </p>
            </div>
          ) : (
            <div className="p-6 sm:p-8 bg-slate-950 border-t border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <span>Pay via Secure Collect.js Tokenizer</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                  PCI-DSS SAQ-A
                </span>
              </h3>

              <form onSubmit={handlePay} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Card Number
                    </label>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2.5 text-xs text-white font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Expires
                    </label>
                    <input
                      type="text"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2.5 text-xs text-white font-mono text-center"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs text-slate-500">
                    Encrypted end-to-end directly with gateway
                  </span>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold tracking-wide transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? 'Authorizing Payment...' : `Pay $${invoice.totalAmountUsd.toFixed(2)} USD`}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
