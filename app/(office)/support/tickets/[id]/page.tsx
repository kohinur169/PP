// path: app/(office)/support/tickets/[id]/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface Message {
  id: string;
  authorName: string;
  authorRole: 'support' | 'merchant';
  message: string;
  isInternalNote: boolean;
  createdAt: string;
}

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [ticketId, setTicketId] = useState('tkt_01');
  const [ticket, setTicket] = useState({
    id: 'tkt_01',
    ticketNumber: 'TKT-2026-0101',
    merchantName: 'Acme Digital Services LLC',
    companyId: '018f6c4c-3500-7fa1-b1e2-000000000001',
    subject: 'Inquiry regarding payment chargeback dispute evidence submission',
    priority: 'high',
    category: 'chargeback_question',
    status: 'in_progress',
    createdAt: '2026-11-04T10:00:00.000Z',
    messages: [
      {
        id: 'msg_01',
        authorName: 'Sarah Jenkins (Merchant Admin)',
        authorRole: 'merchant' as const,
        message:
          'Hello, we received a Visa dispute notice for charge ch_992182 ($450.00). What is the deadline to upload our customer delivery signature proof?',
        isInternalNote: false,
        createdAt: '2026-11-04T10:00:00.000Z',
      },
      {
        id: 'msg_02',
        authorName: 'David Miller (Support Ops)',
        authorRole: 'support' as const,
        message:
          'Internal note: Checked dispute record in dispute table. Dispute response window is 7 business days from notification date.',
        isInternalNote: true,
        createdAt: '2026-11-04T10:15:00.000Z',
      },
      {
        id: 'msg_03',
        authorName: 'David Miller (Support Ops)',
        authorRole: 'support' as const,
        message:
          'Hi Sarah, you have until November 11th at 23:59 UTC to submit your signed delivery receipt through the Disputes tab in your merchant portal.',
        isInternalNote: false,
        createdAt: '2026-11-04T10:18:00.000Z',
      },
    ],
  });

  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [status, setStatus] = useState(ticket.status);
  const [messageNotice, setMessageNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    try {
      const res = await fetch(`/api/office/support/tickets/${ticket.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'support',
          'x-user-id': '018f6c4c-3500-7fa1-b1e2-400000000004',
          'x-user-name': 'David Miller (Support Ops)',
        },
        body: JSON.stringify({
          action: 'reply',
          message: replyText,
          isInternalNote,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Reply failed');
      }

      const newMsg: Message = {
        id: `msg_${Date.now()}`,
        authorName: 'David Miller (Support Ops)',
        authorRole: 'support',
        message: replyText,
        isInternalNote,
        createdAt: new Date().toISOString(),
      };

      setTicket((prev) => ({
        ...prev,
        messages: [...prev.messages, newMsg],
      }));

      setReplyText('');
      setMessageNotice({
        type: 'success',
        text: isInternalNote
          ? 'Internal staff note recorded (hidden from merchant).'
          : 'Public reply dispatched to merchant notification center.',
      });
    } catch (err: any) {
      setMessageNotice({ type: 'error', text: err.message });
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/office/support/tickets/${ticket.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'support',
          'x-user-id': '018f6c4c-3500-7fa1-b1e2-400000000004',
        },
        body: JSON.stringify({
          action: 'status_update',
          status: newStatus,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Status update failed');
      }

      setStatus(newStatus);
      setTicket((prev) => ({ ...prev, status: newStatus as any }));
      setMessageNotice({
        type: 'success',
        text: `Ticket status updated to "${newStatus.replace(/_/g, ' ')}".`,
      });
    } catch (err: any) {
      setMessageNotice({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link
            href="/support"
            className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
          >
            <span>&larr;</span>
            <span>Back to Queue</span>
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-sm font-mono text-white font-bold">{ticket.ticketNumber}</span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400">Status:</span>
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white"
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting_on_merchant">Waiting on Merchant</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {messageNotice && (
        <div
          className={`p-3 rounded text-xs border ${
            messageNotice.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800 text-rose-300'
          }`}
        >
          {messageNotice.text}
        </div>
      )}

      <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-white">{ticket.subject}</h2>
            <div className="mt-1 flex items-center space-x-3 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">{ticket.merchantName}</span>
              <span>&bull;</span>
              <span className="font-mono text-slate-400">Category: {ticket.category}</span>
              <span>&bull;</span>
              <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                Priority: {ticket.priority}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-[10px] font-mono">
            <span className="px-2 py-0.5 rounded bg-rose-950/50 border border-rose-800/40 text-rose-300">
              Gateway Keys: Zero Access
            </span>
            <span className="px-2 py-0.5 rounded bg-rose-950/50 border border-rose-800/40 text-rose-300">
              KYC Decisions: Zero Access
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white">Conversation History</h3>

        <div className="space-y-3">
          {ticket.messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg p-4 border ${
                m.isInternalNote
                  ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                  : m.authorRole === 'support'
                  ? 'bg-blue-950/20 border-blue-800/40 text-slate-200'
                  : 'bg-slate-950 border-slate-800 text-slate-200'
              }`}
            >
              <div className="flex justify-between items-center mb-1 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-white">{m.authorName}</span>
                  {m.isInternalNote && (
                    <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-700/60">
                      Internal Staff Note
                    </span>
                  )}
                  {m.authorRole === 'support' && !m.isInternalNote && (
                    <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/40">
                      Staff Reply
                    </span>
                  )}
                </div>
                <span className="text-slate-500 font-mono text-[11px]">
                  {new Date(m.createdAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-line">{m.message}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-lg p-5">
        <h4 className="text-xs font-semibold text-white mb-2">Compose Response or Internal Note</h4>
        <form onSubmit={handleSendReply} className="space-y-3">
          <textarea
            rows={4}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your response to the merchant or internal collaboration notes..."
            className="w-full bg-slate-900 border border-slate-800 rounded p-3 text-xs text-white focus:outline-none focus:border-blue-500"
            required
          />

          <div className="flex justify-between items-center">
            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isInternalNote}
                onChange={(e) => setIsInternalNote(e.target.checked)}
                className="rounded bg-slate-900 border-slate-800 text-blue-600 focus:ring-0"
              />
              <span>Internal staff note (hidden from merchant portal)</span>
            </label>

            <button
              type="submit"
              className={`px-4 py-2 text-xs font-medium rounded text-white transition-colors ${
                isInternalNote
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {isInternalNote ? 'Save Internal Note' : 'Send Public Reply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
