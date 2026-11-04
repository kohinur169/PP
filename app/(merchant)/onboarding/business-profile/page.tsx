// path: app/(merchant)/onboarding/business-profile/page.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  PaymentProcessorId,
  getProcessorDynamicFields,
  validateProcessorBusinessProfile,
  mapCanonicalProfileToProcessorPayload,
} from '@/lib/kyb/schemas';

export default function BusinessProfileOnboardingPage() {
  const [selectedProcessor, setSelectedProcessor] = useState<PaymentProcessorId>('stripe_connect');

  // Common Base Fields
  const [legalBusinessName, setLegalBusinessName] = useState('');
  const [dbaName, setDbaName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [businessType, setBusinessType] = useState<'llc' | 'corporation' | 'partnership' | 'sole_proprietorship'>('llc');
  const [incorporationDate, setIncorporationDate] = useState('2022-01-15');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('US');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [supportEmail, setSupportEmail] = useState('');

  // Processor Dynamic Field Values
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({
    stripeMcc: '5734',
    representativeTitle: 'Chief Executive Officer',
    businessDescription: 'SaaS cloud platform providing automated financial workflow solutions.',
    nmiMerchantCategory: 'E-Commerce Software',
    estimatedMonthlyVolumeUsd: '50000',
    averageTicketUsd: '120',
    maxTicketUsd: '1500',
    gatewayUsernameRequested: 'apex_gateway_user',
    rainforestPlatformPayorId: 'rf_payor_99120',
    bankRoutingNumber: '021000021',
    bankAccountNumber: '123456789012',
    airwallexSettlementCurrencies: 'USD, EUR, GBP',
    crossBorderCorridors: 'US, GB, DE',
    payoneerPayeeId: 'PAYEE-2026-9912',
    primaryBeneficiaryCountry: 'US',
  });

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [submittedPayload, setSubmittedPayload] = useState<Record<string, unknown> | null>(null);

  const dynamicFields = getProcessorDynamicFields(selectedProcessor);

  const handleDynamicChange = (fieldName: string, value: string) => {
    setDynamicValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleProcessorSwitch = (proc: PaymentProcessorId) => {
    setSelectedProcessor(proc);
    setValidationErrors([]);
    setSubmittedPayload(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors([]);
    setSubmittedPayload(null);

    // Assemble form data object
    const rawData: Record<string, any> = {
      legalBusinessName: legalBusinessName.trim(),
      dbaName: dbaName.trim() || undefined,
      taxId: taxId.trim(),
      businessType,
      incorporationDate: incorporationDate.trim(),
      streetAddress: streetAddress.trim(),
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode.trim(),
      country: country.trim().toUpperCase(),
      websiteUrl: websiteUrl.trim(),
      supportPhone: supportPhone.trim(),
      supportEmail: supportEmail.trim(),
    };

    // Parse dynamic fields
    if (selectedProcessor === 'nmi') {
      rawData.nmiMerchantCategory = dynamicValues.nmiMerchantCategory;
      rawData.estimatedMonthlyVolumeUsd = parseFloat(dynamicValues.estimatedMonthlyVolumeUsd || '0');
      rawData.averageTicketUsd = parseFloat(dynamicValues.averageTicketUsd || '0');
      rawData.maxTicketUsd = parseFloat(dynamicValues.maxTicketUsd || '0');
      rawData.gatewayUsernameRequested = dynamicValues.gatewayUsernameRequested;
    } else if (selectedProcessor === 'stripe_connect') {
      rawData.stripeMcc = dynamicValues.stripeMcc;
      rawData.representativeTitle = dynamicValues.representativeTitle;
      rawData.businessDescription = dynamicValues.businessDescription;
    } else if (selectedProcessor === 'rainforest') {
      rawData.rainforestPlatformPayorId = dynamicValues.rainforestPlatformPayorId;
      rawData.bankRoutingNumber = dynamicValues.bankRoutingNumber;
      rawData.bankAccountNumber = dynamicValues.bankAccountNumber;
    } else if (selectedProcessor === 'airwallex') {
      rawData.airwallexSettlementCurrencies = (dynamicValues.airwallexSettlementCurrencies || '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      rawData.crossBorderCorridors = (dynamicValues.crossBorderCorridors || '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    } else if (selectedProcessor === 'payoneer') {
      rawData.payoneerPayeeId = dynamicValues.payoneerPayeeId;
      rawData.primaryBeneficiaryCountry = (dynamicValues.primaryBeneficiaryCountry || 'US').trim().toUpperCase();
    }

    const validation = validateProcessorBusinessProfile(selectedProcessor, rawData);
    if (!validation.success) {
      setValidationErrors(validation.errors);
      return;
    }

    const payload = mapCanonicalProfileToProcessorPayload(selectedProcessor, validation.data);
    setSubmittedPayload(payload);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Link href="/dashboard" className="hover:text-white transition-colors">
            Merchant Dashboard
          </Link>
          <span>/</span>
          <span className="text-slate-300">Underwriting Onboarding</span>
          <span>/</span>
          <span className="text-emerald-400 font-medium">Business Profile</span>
        </div>

        {/* Hero Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                Phase 7 KYB Form Engine
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                Dynamic Processor-Driven Business Profile
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Field requirements adapt dynamically based on your designated underwriting processor without redundant re-entry.
              </p>
            </div>
          </div>

          {/* Processor Selection Tab Bar */}
          <div className="mt-6 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Designated Underwriting Payment Processor:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {(
                [
                  { id: 'stripe_connect', label: 'Stripe Connect' },
                  { id: 'nmi', label: 'NMI (Collect.js)' },
                  { id: 'rainforest', label: 'Rainforest' },
                  { id: 'airwallex', label: 'Airwallex' },
                  { id: 'payoneer', label: 'Payoneer' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProcessorSwitch(p.id)}
                  className={`p-2.5 rounded-xl border font-bold text-center transition-all ${
                    selectedProcessor === p.id
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-lg'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Validation Errors Box */}
        {validationErrors.length > 0 && (
          <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl space-y-1 text-xs text-rose-200">
            <div className="font-bold uppercase tracking-wider">
              Profile Validation Incomplete ({validationErrors.length} Errors):
            </div>
            <ul className="list-disc pl-5 space-y-1">
              {validationErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Success Payload Box */}
        {submittedPayload ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg">
                &#10003;
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Profile Validated for {selectedProcessor.toUpperCase()}
                </h2>
                <p className="text-xs text-slate-400">
                  Canonical business data successfully transformed into target processor underwriting schema.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400 font-semibold mb-2">
                Processor API Transformed Payload:
              </div>
              <pre className="text-[11px] font-mono text-emerald-300 overflow-x-auto p-2 bg-slate-900/80 rounded border border-slate-800">
                {JSON.stringify(submittedPayload, null, 2)}
              </pre>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSubmittedPayload(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition-colors"
              >
                Modify Business Profile
              </button>
            </div>
          </div>
        ) : (
          /* Form Inputs */
          <form
            onSubmit={handleSubmit}
            className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl text-xs sm:text-sm"
          >
            {/* Common Section */}
            <div className="space-y-4 border-b border-slate-800 pb-6">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Section 1: General Business Identity (Canonical)
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-300 font-medium">Legal Business Name *</label>
                  <input
                    type="text"
                    required
                    value={legalBusinessName}
                    onChange={(e) => setLegalBusinessName(e.target.value)}
                    placeholder="Acme Global Logistics LLC"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-300 font-medium">Trade Name / DBA (Optional)</label>
                  <input
                    type="text"
                    value={dbaName}
                    onChange={(e) => setDbaName(e.target.value)}
                    placeholder="Acme Pay"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-300 font-medium">Tax ID / EIN *</label>
                  <input
                    type="text"
                    required
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="12-3456789"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-300 font-medium">Entity Structure *</label>
                  <select
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="llc">Limited Liability Company (LLC)</option>
                    <option value="corporation">Corporation (C-Corp / S-Corp)</option>
                    <option value="partnership">General Partnership</option>
                    <option value="sole_proprietorship">Sole Proprietorship</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-300 font-medium">Formation Date *</label>
                  <input
                    type="date"
                    required
                    value={incorporationDate}
                    onChange={(e) => setIncorporationDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-slate-300 font-medium">Street Address *</label>
                  <input
                    type="text"
                    required
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                    placeholder="100 Financial Way, Suite 400"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-300 font-medium">City *</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="San Francisco"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-300 font-medium">State / Postal *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="CA"
                      className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="text"
                      required
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="94105"
                      className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-300 font-medium">Country (ISO-2) *</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    placeholder="US"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 uppercase font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-300 font-medium">Support Phone *</label>
                  <input
                    type="tel"
                    required
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                    placeholder="+1 (555) 234-5678"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-300 font-medium">Support Email *</label>
                  <input
                    type="email"
                    required
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    placeholder="support@company.com"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300 font-medium">Commercial Website URL *</label>
                <input
                  type="url"
                  required
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://www.company.com"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Dynamic Processor Specific Fields Section */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Section 2: Dynamic Requirements for {selectedProcessor.toUpperCase()}
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {dynamicFields.map((field) => (
                  <div key={field.fieldName} className="space-y-1">
                    <label className="block text-slate-300 font-medium">
                      {field.label} {field.required && '*'}
                    </label>
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      required={field.required}
                      placeholder={field.placeholder}
                      value={dynamicValues[field.fieldName] || ''}
                      onChange={(e) => handleDynamicChange(field.fieldName, e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[11px] text-slate-400">{field.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors shadow-lg"
              >
                Validate & Transform for {selectedProcessor.toUpperCase()} Underwriting &rarr;
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
