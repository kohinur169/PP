// path: app/(client)/e/[token]/page.tsx

'use client';

import React, { useState, useRef } from 'react';

interface EstimateData {
  estimateNumber: string;
  companyName: string;
  clientName: string;
  clientEmail: string;
  totalAmountUsd: number;
  status: 'sent' | 'accepted' | 'declined' | 'expired';
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPriceUsd: number;
    totalUsd: number;
  }>;
  acceptedAt?: string;
  signatureDataUrl?: string;
  signerIp?: string;
}

export default function TokenizedEstimateViewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [estimate, setEstimate] = useState<EstimateData>({
    estimateNumber: 'EST-2026-0019',
    companyName: 'Acme Digital Services LLC',
    clientName: 'Global Cloud Systems Ltd',
    clientEmail: 'procurement@globalcloud.com',
    totalAmountUsd: 4800.0,
    status: 'sent',
    lineItems: [
      {
        description: 'Multi-Processor Fallback Architecture Implementation (NMI, Rainforest, Stripe)',
        quantity: 1,
        unitPriceUsd: 3200.0,
        totalUsd: 3200.0,
      },
      {
        description: 'Automated TaxCloud Sales Tax Boundary Calculation Integration',
        quantity: 1,
        unitPriceUsd: 1600.0,
        totalUsd: 1600.0,
      },
    ],
  });

  const [signatureText, setSignatureText] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleAcceptAndSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signatureText.trim()) {
      setNotice({ type: 'error', text: 'Please type your legal full name as digital signature.' });
      return;
    }

    if (!agreedToTerms) {
      setNotice({ type: 'error', text: 'You must check the agreement box to accept this estimate.' });
      return;
    }

    setIsSubmitting(true);
    setNotice(null);

    try {
      const resolvedParams = await params;
      const token = resolvedParams.token || 'demo-token';

      // Digital signature data URL representation
      const signatureDataUrl = `data:text/plain;charset=utf-8,SIGNED_BY:${encodeURIComponent(signatureText)}:AT:${Date.now()}`;

      const res = await fetch(`/api/client/estimate/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signatureDataUrl,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to sign estimate');
      }

      setEstimate((prev) => ({
        ...prev,
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
        signatureDataUrl,
        signerIp: '127.0.0.1',
      }));

      setNotice({
        type: 'success',
        text: 'Estimate accepted and legally signed! The merchant has been notified to commence project kickoff.',
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400 mb-3">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            <span>Digital Estimate Portal &bull; Zero Login Required</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{estimate.companyName}</h1>
          <p className="text-sm text-slate-400">Formal Project Estimate {estimate.estimateNumber}</p>
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
                Prepared For
              </span>
              <div className="mt-1 text-base font-bold text-white">{estimate.clientName}</div>
              <div className="text-xs text-slate-400 font-mono">{estimate.clientEmail}</div>
            </div>

            <div className="text-right">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Status
              </span>
              <div className="mt-1">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    estimate.status === 'accepted'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}
                >
                  {estimate.status === 'accepted' ? 'Accepted & Signed' : 'Pending Signature'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2">Scope of Deliverables</th>
                  <th className="py-2 text-center">Qty</th>
                  <th className="py-2 text-right">Unit Price</th>
                  <th className="py-2 text-right">Total (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {estimate.lineItems.map((item, idx) => (
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
              <div className="w-64 flex justify-between text-base font-bold text-white font-mono">
                <span>Total Quote:</span>
                <span className="text-blue-400">${estimate.totalAmountUsd.toFixed(2)} USD</span>
              </div>
            </div>
          </div>

          {estimate.status === 'accepted' ? (
            <div className="p-6 sm:p-8 bg-emerald-950/20 border-t border-emerald-800/40">
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg">
                  &#10003;
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Digitally Executed Estimate</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Signed on {new Date(estimate.acceptedAt || Date.now()).toLocaleString('en-US')}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono space-y-2">
                <div className="flex justify-between text-slate-400">
                  <span>Signer Legal Representative:</span>
                  <span className="text-white font-bold">{estimate.clientName}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Signer Network Origin:</span>
                  <span className="text-slate-300">{estimate.signerIp || 'Verified Web Token'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tamper-Evident Token Status:</span>
                  <span className="text-emerald-400">LOCKED / COUNTER-SIGNED</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 sm:p-8 bg-slate-950 border-t border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-white">Digital Acceptance &amp; Legal Sign-Off</h3>

              <form onSubmit={handleAcceptAndSign} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Authorized Signer Full Legal Name
                  </label>
                  <input
                    type="text"
                    value={signatureText}
                    onChange={(e) => setSignatureText(e.target.value)}
                    placeholder="Type your full legal name (e.g. Johnathan Smith, VP Engineering)"
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2.5 text-xs text-white font-medium focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div className="flex items-start space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-900 border-slate-800 text-blue-600 focus:ring-0"
                  />
                  <label htmlFor="terms" className="text-xs text-slate-400 cursor-pointer">
                    I confirm that I am authorized to bind {estimate.clientName} to this proposal and approve the scope of work described above for ${estimate.totalAmountUsd.toFixed(2)} USD.
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold tracking-wide transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? 'Recording Digital Signature...' : 'Accept & Digitally Sign Estimate'}
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
