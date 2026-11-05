// path: app/(merchant)/onboarding/beneficial-owners/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  type BeneficialOwnerInput,
  validateUboRegistry,
  isUboThresholdMet,
} from '@/lib/kyb/ubo';

const INITIAL_OWNERS: BeneficialOwnerInput[] = [
  {
    id: 'ubo_1',
    fullName: 'Alexander Wright',
    dateOfBirth: '1985-04-12',
    nationality: 'US',
    equityPercentage: 50.0,
    isDirector: true,
    isPrimarySignatory: true,
    residentialAddress: {
      streetAddress: '140 Franklin St, Apt 4A',
      city: 'New York',
      stateOrProvince: 'NY',
      postalCode: '10013',
      country: 'US',
    },
    idDocId: 'file_pass_01',
    idDocFilename: 'alexander_wright_passport.pdf',
    livenessStatus: 'passed',
  },
  {
    id: 'ubo_2',
    fullName: 'Sophia Lin',
    dateOfBirth: '1990-09-24',
    nationality: 'US',
    equityPercentage: 50.0,
    isDirector: true,
    isPrimarySignatory: false,
    residentialAddress: {
      streetAddress: '220 Greenwich St, Fl 18',
      city: 'New York',
      stateOrProvince: 'NY',
      postalCode: '10007',
      country: 'US',
    },
    idDocId: '',
    idDocFilename: '',
    livenessStatus: 'pending',
  },
];

export default function BeneficialOwnersPage() {
  const [owners, setOwners] = useState<BeneficialOwnerInput[]>(INITIAL_OWNERS);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const totalEquity = owners.reduce((acc, o) => acc + (Number(o.equityPercentage) || 0), 0);

  const handleUpdateOwner = (index: number, updates: Partial<BeneficialOwnerInput>) => {
    setOwners((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, ...updates };
      return next;
    });
    setSubmitSuccess(false);
  };

  const handleUpdateAddress = (
    index: number,
    field: string,
    value: string
  ) => {
    setOwners((prev) => {
      const next = [...prev];
      const current = next[index]!;
      next[index] = {
        ...current,
        residentialAddress: {
          ...current.residentialAddress,
          [field]: value,
        },
      };
      return next;
    });
    setSubmitSuccess(false);
  };

  const handleAddOwner = () => {
    setOwners((prev) => [
      ...prev,
      {
        id: `ubo_${Date.now()}`,
        fullName: '',
        dateOfBirth: '1995-01-01',
        nationality: 'US',
        equityPercentage: 0,
        isDirector: false,
        isPrimarySignatory: false,
        residentialAddress: {
          streetAddress: '',
          city: '',
          postalCode: '',
          country: 'US',
        },
        idDocId: '',
        idDocFilename: '',
        livenessStatus: 'pending',
      },
    ]);
  };

  const handleRemoveOwner = (index: number) => {
    setOwners((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSimulateUpload = (index: number) => {
    handleUpdateOwner(index, {
      idDocId: `doc_${Date.now()}`,
      idDocFilename: `id_document_${Date.now()}.pdf`,
      livenessStatus: 'passed',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateUboRegistry(owners);
    if (!result.valid) {
      setValidationErrors(result.issues.map((i) => i.message));
      setSubmitSuccess(false);
    } else {
      setValidationErrors([]);
      setSubmitSuccess(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Link href="/onboarding" className="hover:text-white transition-colors">
            Merchant Onboarding
          </Link>
          <span>/</span>
          <span className="text-slate-300">Phase 7 KYB Compliance</span>
          <span>/</span>
          <span className="text-emerald-400 font-medium">Beneficial Owners & Directors</span>
        </div>

        {/* Hero Header */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
            Step 096 UBO & Director Verification
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
            Director & Ultimate Beneficial Owner (UBO) Registry
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Federal FinCEN & EU 5AMLD compliance rules mandate government ID collection and liveness checks for all individuals holding 25% or more equity, plus at least one managing director.
          </p>

          {/* Equity Progress Meter */}
          <div className="mt-6 p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-300 font-semibold">
                Total Declared Beneficial Ownership
              </span>
              <span
                className={`font-mono font-bold ${
                  totalEquity === 100
                    ? 'text-emerald-400'
                    : totalEquity > 100
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}
              >
                {totalEquity.toFixed(1)}% / 100.0%
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  totalEquity === 100
                    ? 'bg-emerald-500'
                    : totalEquity > 100
                    ? 'bg-rose-500'
                    : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min(totalEquity, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Owner Records Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {owners.map((owner, idx) => {
            const isUbo = isUboThresholdMet(owner.equityPercentage);
            return (
              <div
                key={owner.id ?? idx}
                className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs">
                      {idx + 1}
                    </span>
                    <h3 className="font-bold text-white text-sm">
                      {owner.fullName || `Beneficial Owner #${idx + 1}`}
                    </h3>
                    {isUbo && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                        Qualifying UBO (&ge; 25%)
                      </span>
                    )}
                  </div>
                  {owners.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOwner(idx)}
                      className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                    >
                      Remove Owner
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Legal Full Name (as shown on ID)
                    </label>
                    <input
                      type="text"
                      value={owner.fullName}
                      onChange={(e) => handleUpdateOwner(idx, { fullName: e.target.value })}
                      placeholder="e.g. Jane Elizabeth Doe"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={owner.dateOfBirth}
                      onChange={(e) => handleUpdateOwner(idx, { dateOfBirth: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Nationality (ISO 2-letter Code)
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      value={owner.nationality}
                      onChange={(e) =>
                        handleUpdateOwner(idx, { nationality: e.target.value.toUpperCase() })
                      }
                      placeholder="US"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Beneficial Equity Share (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={owner.equityPercentage}
                      onChange={(e) =>
                        handleUpdateOwner(idx, { equityPercentage: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Role Toggles */}
                <div className="flex flex-wrap gap-4 pt-2 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={owner.isDirector}
                      onChange={(e) => handleUpdateOwner(idx, { isDirector: e.target.checked })}
                      className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-slate-300">Managing Director / Officer</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={owner.isPrimarySignatory}
                      onChange={(e) =>
                        handleUpdateOwner(idx, { isPrimarySignatory: e.target.checked })
                      }
                      className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-slate-300">Primary Authorized Signatory</span>
                  </label>
                </div>

                {/* Residential Address */}
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <span className="text-slate-300 font-semibold block">Residential Street Address</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Street Address"
                      value={owner.residentialAddress?.streetAddress || ''}
                      onChange={(e) => handleUpdateAddress(idx, 'streetAddress', e.target.value)}
                      className="sm:col-span-2 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                    <input
                      type="text"
                      placeholder="City"
                      value={owner.residentialAddress?.city || ''}
                      onChange={(e) => handleUpdateAddress(idx, 'city', e.target.value)}
                      className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Postal / ZIP Code"
                      value={owner.residentialAddress?.postalCode || ''}
                      onChange={(e) => handleUpdateAddress(idx, 'postalCode', e.target.value)}
                      className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                    <input
                      type="text"
                      placeholder="Country Code (e.g. US)"
                      maxLength={2}
                      value={owner.residentialAddress?.country || ''}
                      onChange={(e) =>
                        handleUpdateAddress(idx, 'country', e.target.value.toUpperCase())
                      }
                      className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white uppercase font-mono"
                    />
                  </div>
                </div>

                {/* Identity Verification & Liveness Card */}
                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="text-slate-200 font-semibold block">
                      Government ID & Liveness Status
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      {owner.idDocFilename
                        ? `Attached: ${owner.idDocFilename} (AES-256-GCM Encrypted)`
                        : isUbo
                        ? 'Mandatory: Passport or Driver’s License required for >= 25% ownership.'
                        : 'Optional for owners under 25% threshold.'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {owner.idDocId ? (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold text-[11px]">
                        ID Verified &middot; Liveness {owner.livenessStatus?.toUpperCase()}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSimulateUpload(idx)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 font-medium text-[11px] transition-colors"
                      >
                        Upload ID & Complete Liveness
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={handleAddOwner}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-700 font-semibold text-xs transition-colors"
            >
              + Add Beneficial Owner / Director
            </button>

            <button
              type="submit"
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg transition-colors"
            >
              Validate & Submit Beneficial Ownership
            </button>
          </div>
        </form>

        {/* Validation Errors Feedback */}
        {validationErrors.length > 0 && (
          <div className="p-4 bg-rose-950/80 border border-rose-800 rounded-2xl text-xs space-y-2">
            <h4 className="font-bold text-rose-200">KYB Compliance Gating Errors</h4>
            <ul className="list-disc pl-5 text-rose-300 space-y-1">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Success Confirmation */}
        {submitSuccess && (
          <div className="p-4 bg-emerald-950/80 border border-emerald-800 rounded-2xl text-xs text-emerald-200 space-y-1">
            <h4 className="font-bold text-emerald-100">UBO Registry Approved</h4>
            <p>
              All beneficial owners and directors meet regulatory standards. Identification documents have been verified and sealed into the processor packet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
