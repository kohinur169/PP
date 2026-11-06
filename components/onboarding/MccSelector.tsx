// path: components/onboarding/MccSelector.tsx

'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ISO_18245_MCC_CATALOG,
  classifyMccRisk,
  MccClassificationResult,
  Iso18245MccItem,
} from '@/lib/constants/mcc';

export interface MccSelectorProps {
  value: string;
  onChange: (mcc: string, classification: MccClassificationResult) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
}

export function MccSelector({
  value,
  onChange,
  label = 'Merchant Category Code (MCC)',
  error,
  disabled = false,
}: MccSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedClassification = useMemo(() => {
    if (!value) return null;
    return classifyMccRisk(value);
  }, [value]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return ISO_18245_MCC_CATALOG;
    return ISO_18245_MCC_CATALOG.filter(
      (item) =>
        item.code.includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: Iso18245MccItem) => {
    const classification = classifyMccRisk(item.code);
    onChange(item.code, classification);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className="space-y-2 relative text-xs sm:text-sm">
      {label && <label className="block text-slate-300 font-medium">{label} *</label>}

      {/* Main Trigger / Search Input */}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-lg text-left flex items-center justify-between transition-colors ${
            error
              ? 'border-rose-500 text-rose-200'
              : 'border-slate-700 text-white hover:border-slate-600 focus:border-emerald-500'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {selectedClassification ? (
            <div className="flex items-center space-x-2 truncate">
              <span className="font-mono font-bold text-emerald-400">
                {selectedClassification.mcc}
              </span>
              <span className="text-slate-200 truncate">
                {selectedClassification.title}
              </span>
            </div>
          ) : (
            <span className="text-slate-500">Select standard ISO 18245 MCC code...</span>
          )}
          <span className="text-slate-400 text-xs ml-2">&#9662;</span>
        </button>

        {/* Dropdown Menu */}
        {isOpen && !disabled && (
          <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-72 flex flex-col">
            <div className="p-2 border-b border-slate-800 bg-slate-950">
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by code (e.g. 5734, 4722) or industry..."
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="overflow-y-auto divide-y divide-slate-800/60 p-1">
              {filteredItems.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No matching MCC codes found.
                </div>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className="w-full text-left p-2.5 hover:bg-slate-800/80 rounded-lg flex items-center justify-between transition-colors group"
                  >
                    <div className="space-y-0.5 truncate pr-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-emerald-400 text-xs">
                          {item.code}
                        </span>
                        <span className="font-medium text-white group-hover:text-emerald-300 transition-colors text-xs truncate">
                          {item.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {item.category} &middot; {item.description}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {item.isProhibited ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                          Prohibited
                        </span>
                      ) : item.isRestricted ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                          Restricted (10%)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          Tier {item.riskTier}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {/* Selected Classification Summary Badge */}
      {selectedClassification && (
        <div
          className={`p-3 rounded-xl border text-xs space-y-1.5 transition-colors ${
            selectedClassification.isProhibited
              ? 'bg-rose-950/40 border-rose-800 text-rose-200'
              : selectedClassification.isRestricted
              ? 'bg-amber-950/40 border-amber-800 text-amber-200'
              : 'bg-emerald-950/30 border-emerald-800 text-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between font-bold">
            <span>
              {selectedClassification.isProhibited
                ? 'BARRED CATEGORY'
                : selectedClassification.isRestricted
                ? 'RESTRICTED HIGH-RISK MCC'
                : `TIER ${selectedClassification.riskTier} STANDARD MCC`}
            </span>
            <span className="font-mono">
              Reserve: {selectedClassification.baselineReservePercent}% ({selectedClassification.reserveHoldDays}d)
            </span>
          </div>
          <p className="text-slate-300 text-[11px]">{selectedClassification.explanation}</p>
        </div>
      )}
    </div>
  );
}
