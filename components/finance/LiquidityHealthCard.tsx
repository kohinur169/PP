// path: components/finance/LiquidityHealthCard.tsx

'use client';

import React, { useState, useEffect } from 'react';

export interface LiquidityData {
  bufferBalanceUsd: string;
  minimumThresholdUsd: string;
  peakChargeback30dUsd: string;
  delayedSettlementsPendingUsd: string;
  status: 'healthy' | 'warning' | 'critical_deficit';
  ratio: number;
  healthPercentage: number;
  surplusDeficitUsd: string;
  lastEvaluatedAt: string;
}

interface LiquidityHealthCardProps {
  initialData?: LiquidityData;
  onRefresh?: () => void;
  showAdminControls?: boolean;
}

export function LiquidityHealthCard({
  initialData,
  onRefresh,
  showAdminControls = false,
}: LiquidityHealthCardProps) {
  const [data, setData] = useState<LiquidityData>(
    initialData ?? {
      bufferBalanceUsd: '250000.0000',
      minimumThresholdUsd: '50000.0000',
      peakChargeback30dUsd: '20000.0000',
      delayedSettlementsPendingUsd: '0.0000',
      status: 'healthy',
      ratio: 5.0,
      healthPercentage: 500,
      surplusDeficitUsd: '200000.0000',
      lastEvaluatedAt: new Date().toISOString(),
    }
  );

  const [isLoading, setIsLoading] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('25000');
  const [depositSource, setDepositSource] = useState('Operating Cash Reserves - Silicon Valley Bank');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchLiquidity = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/office/finance/liquidity');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.liquidity) {
          setData(json.liquidity);
        }
      }
    } catch {
      // Keep state if fetch fails
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!initialData) {
      void fetchLiquidity();
    }
  }, [initialData]);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/office/finance/liquidity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'replenish',
          amountUsd: depositAmount,
          source: depositSource,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setActionMessage(`Successfully injected $${parseFloat(depositAmount).toLocaleString()} into liquidity buffer.`);
        setIsDepositOpen(false);
        await fetchLiquidity();
        onRefresh?.();
      } else {
        setActionMessage(json.detail || 'Failed to replenish buffer.');
      }
    } catch {
      setActionMessage('Network error replenishing buffer.');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = () => {
    switch (data.status) {
      case 'healthy':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1.5" />
            BUFFER HEALTHY ({data.healthPercentage}%)
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse" />
            WARNING BUFFER ({data.healthPercentage}%)
          </span>
        );
      case 'critical_deficit':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 mr-1.5" />
            CRITICAL DEFICIT ({data.healthPercentage}%)
          </span>
        );
    }
  };

  const formattedBalance = parseFloat(data.bufferBalanceUsd).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedFloor = parseFloat(data.minimumThresholdUsd).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedSurplus = parseFloat(data.surplusDeficitUsd).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedPeakCb = parseFloat(data.peakChargeback30dUsd).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedPendingDelays = parseFloat(data.delayedSettlementsPendingUsd).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
      {/* Background health tint */}
      <div
        className={`absolute -right-20 -top-20 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-20 ${
          data.status === 'healthy'
            ? 'bg-emerald-500'
            : data.status === 'warning'
            ? 'bg-amber-500'
            : 'bg-rose-500'
        }`}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              Platform Emergency Liquidity Buffer
            </h3>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Dedicated company capitalization buffer protecting merchant daily payouts against settlement delays and chargeback surges.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {showAdminControls && (
            <button
              onClick={() => setIsDepositOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              + Capitalize Buffer
            </button>
          )}
          <button
            onClick={() => void fetchLiquidity()}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            {isLoading ? 'Scanning...' : 'Refresh'}
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200">
          {actionMessage}
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            Buffer Balance
          </span>
          <div className="text-2xl font-extrabold text-white mt-1">
            ${formattedBalance}
          </div>
          <span className="text-[11px] text-emerald-400 font-medium">
            Company Fiduciary Capital
          </span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            Mandatory Floor (Threshold)
          </span>
          <div className="text-2xl font-extrabold text-slate-200 mt-1">
            ${formattedFloor}
          </div>
          <span className="text-[11px] text-slate-400">
            Min. Liquidity Benchmark
          </span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            Net Surplus / Deficit
          </span>
          <div
            className={`text-2xl font-extrabold mt-1 ${
              parseFloat(data.surplusDeficitUsd) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {parseFloat(data.surplusDeficitUsd) >= 0 ? `+$${formattedSurplus}` : `-$${formattedSurplus.replace('-', '')}`}
          </div>
          <span className="text-[11px] text-slate-400">
            Coverage Ratio: {data.ratio.toFixed(2)}x
          </span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            30-Day Peak CB Exposure
          </span>
          <div className="text-2xl font-extrabold text-slate-300 mt-1">
            ${formattedPeakCb}
          </div>
          <span className="text-[11px] text-slate-400">
            Pending Delays: ${formattedPendingDelays}
          </span>
        </div>
      </div>

      {/* Capitalization Modal */}
      {isDepositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h4 className="text-base font-bold text-white">Inject Company Liquidity Capitalization</h4>
            <p className="text-xs text-slate-400 mt-1">
              Transfer operating corporate funds into the emergency liquidity buffer to guarantee settlement continuity.
            </p>

            <form onSubmit={handleDeposit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Amount in USD ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Funding Account / Source Description
                </label>
                <input
                  type="text"
                  value={depositSource}
                  onChange={(e) => setDepositSource(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDepositOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Confirm Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
