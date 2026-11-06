// path: app/(merchant)/settings/page.tsx

'use client';

import React, { useState } from 'react';

export default function MerchantSettingsPage() {
  const [profile, setProfile] = useState({
    legalName: 'Acme Digital Services LLC',
    dbaName: 'Acme Cloud Solutions',
    supportEmail: 'support@acme-cloud.com',
    supportPhone: '+1-555-019-2831',
    statementDescriptor: 'ACME*CLOUD SERVICES',
    payoutSchedule: 'daily',
    bankAccountMasked: '****4412',
    bankRouting: '021000021 (JPMorgan Chase)',
  });

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await fetch('/api/merchant/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'owner',
          'x-user-id': '018f6c4c-3500-7fa1-b1e2-100000000001',
          'x-company-id': '018f6c4c-3500-7fa1-b1e2-000000000001',
        },
        body: JSON.stringify({
          legalName: profile.legalName,
          dbaName: profile.dbaName,
          supportEmail: profile.supportEmail,
          supportPhone: profile.supportPhone,
          statementDescriptor: profile.statementDescriptor,
          payoutSchedule: profile.payoutSchedule,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Settings update failed');
      }

      setNotice({
        type: 'success',
        text: 'Business profile and settlement preferences updated successfully.',
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-white">Business Profile &amp; Payout Settings</h2>
        <p className="text-sm text-slate-400">
          Configure trading names, customer statement descriptors, and banking disbursement cadence.
        </p>
      </div>

      {notice && (
        <div
          className={`p-3 rounded text-xs border ${
            notice.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800 text-rose-300'
          }`}
        >
          {notice.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Company Identity</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Registered Legal Name
              </label>
              <input
                type="text"
                value={profile.legalName}
                onChange={(e) => setProfile({ ...profile, legalName: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Doing Business As (DBA)
              </label>
              <input
                type="text"
                value={profile.dbaName}
                onChange={(e) => setProfile({ ...profile, dbaName: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Public Customer Support Email
              </label>
              <input
                type="email"
                value={profile.supportEmail}
                onChange={(e) => setProfile({ ...profile, supportEmail: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Support Telephone Number
              </label>
              <input
                type="tel"
                value={profile.supportPhone}
                onChange={(e) => setProfile({ ...profile, supportPhone: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white"
                required
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Payment &amp; Settlement Configuration</h3>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Cardholder Statement Descriptor (Max 22 characters)
            </label>
            <input
              type="text"
              maxLength={22}
              value={profile.statementDescriptor}
              onChange={(e) => setProfile({ ...profile, statementDescriptor: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white font-mono uppercase"
              required
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Appears on client bank and credit card billing statements.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Payout Disbursement Schedule
              </label>
              <select
                value={profile.payoutSchedule}
                onChange={(e) => setProfile({ ...profile, payoutSchedule: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white"
              >
                <option value="daily">Daily Automatic Sweep (24h Rolling Settlement)</option>
                <option value="weekly">Weekly Sweep (Every Monday)</option>
                <option value="monthly">Monthly Consolidated Sweep</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Active Bank Account Destination
              </label>
              <div className="p-2 bg-slate-900 border border-slate-800 rounded text-xs font-mono text-slate-300">
                {profile.bankAccountMasked} &bull; {profile.bankRouting}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition-colors"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
