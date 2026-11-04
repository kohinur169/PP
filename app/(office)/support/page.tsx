// path: app/(office)/support/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface TicketSummary {
  id: string;
  ticketNumber: string;
  merchantName: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  status: 'open' | 'in_progress' | 'waiting_on_merchant' | 'resolved' | 'closed';
  updatedAt: string;
  messageCount: number;
}

export default function SupportTicketingQueuePage() {
  const [tickets, setTickets] = useState<TicketSummary[]>([
    {
      id: 'tkt_01',
      ticketNumber: 'TKT-2026-0101',
      merchantName: 'Acme Digital Services LLC',
      subject: 'Inquiry regarding payment chargeback dispute evidence submission',
      priority: 'high',
      category: 'chargeback_question',
      status: 'open',
      updatedAt: '2026-11-04T12:30:00.000Z',
      messageCount: 2,
    },
    {
      id: 'tkt_02',
      ticketNumber: 'TKT-2026-0102',
      merchantName: 'Summit Cloud Logistics Inc',
      subject: 'Collect.js tokenization integration error in checkout iframe',
      priority: 'urgent',
      category: 'integration_help',
      status: 'in_progress',
      updatedAt: '2026-11-04T14:15:00.000Z',
      messageCount: 4,
    },
    {
      id: 'tkt_03',
      ticketNumber: 'TKT-2026-0103',
      merchantName: 'Pacific Retailers Group',
      subject: 'Requesting clarification on monthly settlement batch fees',
      priority: 'medium',
      category: 'payment_inquiry',
      status: 'waiting_on_merchant',
      updatedAt: '2026-11-03T18:00:00.000Z',
      messageCount: 3,
    },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white">Customer Support Ticketing Queue</h2>
          <p className="text-sm text-slate-400">
            Manage merchant communication, provide integration guidance, and investigate transaction statuses.
          </p>
        </div>
        <div className="flex space-x-2 text-xs">
          <span className="px-3 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 font-mono">
            {tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length} Active
          </span>
        </div>
      </div>

      <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-lg flex items-start space-x-3 text-xs text-amber-300">
        <span className="text-base font-bold">&#9888;</span>
        <div>
          <strong className="font-semibold">Support Security Guardrail:</strong> Support staff has read-only visibility into merchant transaction statuses. Under strict platform security policy, support operators cannot view gateway private keys, alter Collect.js secrets, approve KYC packets, or execute payout disbursements.
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          <span className="text-sm font-semibold text-white">Merchant Inquiries</span>
          <span className="text-xs text-slate-400 font-mono">{tickets.length} Total Tickets</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Ticket #</th>
                <th className="py-3 px-4 font-semibold">Merchant</th>
                <th className="py-3 px-4 font-semibold">Subject</th>
                <th className="py-3 px-4 font-semibold text-center">Priority</th>
                <th className="py-3 px-4 font-semibold text-center">Category</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold">Last Updated</th>
                <th className="py-3 px-4 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-900/30">
                  <td className="py-3 px-4 font-mono font-bold text-white">{t.ticketNumber}</td>
                  <td className="py-3 px-4 font-medium text-slate-300">{t.merchantName}</td>
                  <td className="py-3 px-4 text-slate-200 max-w-sm truncate" title={t.subject}>
                    {t.subject}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                        t.priority === 'urgent'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : t.priority === 'high'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {t.priority}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-[11px] text-slate-400 font-mono">
                      {t.category.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                        t.status === 'open'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : t.status === 'in_progress'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : t.status === 'resolved'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {t.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {new Date(t.updatedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Link
                      href={`/support/tickets/${t.id}`}
                      className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors"
                    >
                      View &amp; Reply
                    </Link>
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
