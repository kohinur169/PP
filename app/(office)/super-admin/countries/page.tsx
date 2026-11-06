// path: app/(office)/super-admin/countries/page.tsx

'use client';

import React, { useState, useEffect } from 'react';

interface CountryItem {
  id: string;
  country_code: string;
  country_name: string;
  is_enabled: boolean;
  is_sanctioned_frozen: boolean;
  sanctions_program: string | null;
  pending_change_status: 'pending_approval' | null;
  proposed_enabled: boolean | null;
  proposed_by: string | null;
  change_justification: string | null;
}

interface CountrySummary {
  total: number;
  enabled: number;
  disabled: number;
  sanctionedFrozen: number;
  pendingApproval: number;
}

export default function CountryControlsPage() {
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [summary, setSummary] = useState<CountrySummary>({
    total: 0,
    enabled: 0,
    disabled: 0,
    sanctionedFrozen: 0,
    pendingApproval: 0,
  });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled' | 'sanctioned' | 'pending'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Proposal modal state
  const [modalCountry, setModalCountry] = useState<CountryItem | null>(null);
  const [proposeEnabled, setProposeEnabled] = useState(true);
  const [justification, setJustification] = useState('');

  // Emergency disable modal state
  const [emergencyCountry, setEmergencyCountry] = useState<CountryItem | null>(null);
  const [emergencyReason, setEmergencyReason] = useState('');

  const fetchCountries = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/office/compliance/country-controls', {
        headers: { 'x-user-role': 'super_admin' },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setCountries(json.countries);
          setSummary(json.summary);
        }
      }
    } catch {
      // Keep state if fetch fails
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchCountries();
  }, []);

  const handlePropose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalCountry) return;
    setIsLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/office/compliance/country-controls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'super_admin',
          'x-user-id': '018f6c4c-3500-7fa1-b1e2-000000000001',
        },
        body: JSON.stringify({
          action: 'propose',
          countryCode: modalCountry.country_code,
          enabled: proposeEnabled,
          justification,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({ type: 'success', message: json.message });
        setModalCountry(null);
        setJustification('');
        await fetchCountries();
      } else {
        setFeedback({ type: 'error', message: json.detail || 'Proposal failed' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error submitting proposal' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (countryCode: string) => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/office/compliance/country-controls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'ceo', // CEO provides dual control approval
          'x-user-id': '018f6c4c-3500-7fa1-b1e2-100000000001',
        },
        body: JSON.stringify({
          action: 'approve',
          countryCode,
          notes: 'CEO dual-control ratification confirmed.',
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({ type: 'success', message: json.message });
        await fetchCountries();
      } else {
        setFeedback({ type: 'error', message: json.detail || 'Approval failed' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error approving country state change' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmergencyDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emergencyCountry) return;
    setIsLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/office/compliance/country-controls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'super_admin',
          'x-user-id': '018f6c4c-3500-7fa1-b1e2-000000000001',
        },
        body: JSON.stringify({
          action: 'emergency_disable',
          countryCode: emergencyCountry.country_code,
          reason: emergencyReason,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({ type: 'success', message: json.message });
        setEmergencyCountry(null);
        setEmergencyReason('');
        await fetchCountries();
      } else {
        setFeedback({ type: 'error', message: json.detail || 'Emergency freeze failed' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error executing emergency freeze' });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCountries = countries.filter((c) => {
    const matchesSearch =
      c.country_name.toLowerCase().includes(search.toLowerCase()) ||
      c.country_code.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    if (filter === 'enabled') return c.is_enabled;
    if (filter === 'disabled') return !c.is_enabled && !c.is_sanctioned_frozen;
    if (filter === 'sanctioned') return c.is_sanctioned_frozen;
    if (filter === 'pending') return c.pending_change_status === 'pending_approval';
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Global Country Enablement & Sanctions Freeze Registry
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Joint dual-control governance (Super Admin + CEO). Permanently freezes OFAC/UN sanctioned nations.
          </p>
        </div>

        <button
          onClick={() => void fetchCountries()}
          disabled={isLoading}
          className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
        >
          {isLoading ? 'Scanning...' : 'Refresh Registry'}
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-lg text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/80 border-rose-800 text-rose-300'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <span className="text-xs text-slate-400 font-medium uppercase">Total Countries</span>
          <div className="text-2xl font-bold text-white mt-1">{summary.total}</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <span className="text-xs text-emerald-400 font-medium uppercase">Active (Enabled)</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{summary.enabled}</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <span className="text-xs text-slate-400 font-medium uppercase">Policy Disabled</span>
          <div className="text-2xl font-bold text-slate-300 mt-1">{summary.disabled}</div>
        </div>

        <div className="bg-slate-950 border border-rose-900/60 rounded-lg p-4">
          <span className="text-xs text-rose-400 font-medium uppercase">Sanctioned Frozen</span>
          <div className="text-2xl font-bold text-rose-400 mt-1">{summary.sanctionedFrozen}</div>
        </div>

        <div className="bg-slate-950 border border-amber-900/60 rounded-lg p-4">
          <span className="text-xs text-amber-400 font-medium uppercase">Pending Dual Approval</span>
          <div className="text-2xl font-bold text-amber-400 mt-1">{summary.pendingApproval}</div>
        </div>
      </div>

      {/* Pending Dual Approval Banner */}
      {summary.pendingApproval > 0 && (
        <div className="bg-amber-950/30 border border-amber-800/80 rounded-xl p-5">
          <div className="flex items-center space-x-2 text-amber-300 font-semibold text-sm">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Executive Dual-Control Actions Awaiting Ratification ({summary.pendingApproval})</span>
          </div>
          <div className="mt-3 space-y-3">
            {countries
              .filter((c) => c.pending_change_status === 'pending_approval')
              .map((c) => (
                <div
                  key={c.id}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-white font-bold">
                        {c.country_code}
                      </span>
                      <span className="text-sm font-bold text-white">{c.country_name}</span>
                      <span className="text-xs text-amber-400 font-semibold">
                        &rarr; Proposes to {c.proposed_enabled ? 'ENABLE' : 'DISABLE'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      <span className="font-medium text-slate-300">Justification:</span>{' '}
                      {c.change_justification}
                    </p>
                  </div>

                  <button
                    onClick={() => void handleApprove(c.country_code)}
                    disabled={isLoading}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap transition-colors"
                  >
                    Confirm & Ratify (CEO Dual Control)
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by country name or ISO alpha-2 code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white text-sm placeholder:text-slate-500"
        />

        <div className="flex items-center space-x-1.5 overflow-x-auto">
          {(['all', 'enabled', 'disabled', 'sanctioned', 'pending'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${
                filter === tab
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Countries Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/80 text-xs font-semibold uppercase text-slate-400 tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Country Name</th>
                <th className="py-3 px-4">Governance Status</th>
                <th className="py-3 px-4">Regulatory Sanctions Program</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {filteredCountries.map((c) => (
                <tr key={c.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-white">{c.country_code}</td>
                  <td className="py-3.5 px-4 font-sans font-medium text-slate-200">{c.country_name}</td>
                  <td className="py-3.5 px-4 font-sans">
                    {c.is_sanctioned_frozen ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                        <span className="mr-1">&#128274;</span> SANCTIONED FROZEN
                      </span>
                    ) : c.pending_change_status === 'pending_approval' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                        AWAITING DUAL APPROVAL
                      </span>
                    ) : c.is_enabled ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        ENABLED
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                        DISABLED
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-sans text-xs text-slate-400">
                    {c.sanctions_program || 'Standard Merchant Jurisdiction'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-sans space-x-2">
                    {c.is_sanctioned_frozen ? (
                      <span className="text-[11px] text-rose-400 font-semibold italic">
                        Permanent Legal Lock
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setModalCountry(c);
                            setProposeEnabled(!c.is_enabled);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                        >
                          Propose {c.is_enabled ? 'Disable' : 'Enable'}
                        </button>
                        {c.is_enabled && (
                          <button
                            onClick={() => setEmergencyCountry(c)}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors"
                          >
                            Freeze
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Propose Change Modal */}
      {modalCountry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white">
              Propose {proposeEnabled ? 'Enabling' : 'Disabling'} {modalCountry.country_name} ({modalCountry.country_code})
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Changes to merchant country availability require dual approval from counterpart executive (CEO).
            </p>

            <form onSubmit={handlePropose} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Regulatory / Commercial Justification
                </label>
                <textarea
                  rows={3}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs"
                  placeholder="Detail licensing, banking clearance, or risk policy update..."
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalCountry(null)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Submit Proposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Emergency Freeze Modal */}
      {emergencyCountry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-rose-900 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-rose-400">
              Emergency Country Freeze: {emergencyCountry.country_name} ({emergencyCountry.country_code})
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Instantly blocks merchant onboarding, checkout, and payouts for this jurisdiction without dual-control delay.
            </p>

            <form onSubmit={handleEmergencyDisable} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Urgent Containment Reason
                </label>
                <textarea
                  rows={3}
                  value={emergencyReason}
                  onChange={(e) => setEmergencyReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-rose-800 rounded-lg text-white text-xs"
                  placeholder="e.g. Breaking international sanction notice or high-risk card fraud wave..."
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEmergencyCountry(null)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white"
                >
                  Execute Immediate Freeze
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
