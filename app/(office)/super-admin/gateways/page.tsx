// path: app/(office)/super-admin/gateways/page.tsx

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft, RefreshCw, KeyRound, AlertCircle, CheckCircle } from 'lucide-react';
import { GatewayConfigCard } from '@/components/admin/GatewayConfigCard';
import { StepUpAuthModal } from '@/components/auth/StepUpAuthModal';
import { Button } from '@/components/ui/Button';
import type { AdminGatewayConfig } from '@/lib/processors/admin';
import {
  getAdminGatewayConfigs,
  testGatewayConnectionAdmin,
  toggleGatewayStatus,
} from '@/lib/processors/admin';
import type { PaymentProcessorSlug } from '@/types/processors';

export default function SuperAdminGatewaysPage() {
  const [isStepUpOpen, setIsStepUpOpen] = React.useState(false);
  const [isStepUpVerified, setIsStepUpVerified] = React.useState(false);
  const [gateways, setGateways] = React.useState<AdminGatewayConfig[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTestingSlug, setActiveTestingSlug] = React.useState<string | null>(null);
  const [activeTogglingSlug, setActiveTogglingSlug] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const actorRole = 'super_admin';
  const actorUserId = '01a1aa91-3500-7fa1-b1e2-123456789abc';

  // Initial load: prompt for Step-Up if not verified
  React.useEffect(() => {
    if (!isStepUpVerified) {
      setIsStepUpOpen(true);
      setLoading(false);
      return;
    }

    loadGateways();
  }, [isStepUpVerified]);

  const loadGateways = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const configs = await getAdminGatewayConfigs({
        actorRole,
        actorUserId,
        stepUpVerified: true,
      });
      setGateways(configs);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStepUpVerified = (_ticketId: string) => {
    setIsStepUpVerified(true);
    setIsStepUpOpen(false);
    setFeedback({
      type: 'success',
      message: 'Step-up 2FA reauthentication confirmed. Elevated gateway privileges unlocked.',
    });
  };

  const handleTestConnection = async (providerSlug: string) => {
    setActiveTestingSlug(providerSlug);
    setFeedback(null);
    try {
      const result = await testGatewayConnectionAdmin({
        providerSlug: providerSlug as PaymentProcessorSlug,
        actorUserId,
        actorRole,
        stepUpVerified: isStepUpVerified,
      });

      if (result.isConnected) {
        setFeedback({
          type: 'success',
          message: `Connection to ${providerSlug.toUpperCase()} verified (${result.latencyMs}ms): ${result.message}`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: `Connection test for ${providerSlug.toUpperCase()} failed: ${result.message}`,
        });
      }

      await loadGateways();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setActiveTestingSlug(null);
    }
  };

  const handleToggleStatus = async (providerSlug: string, isEnabled: boolean) => {
    setActiveTogglingSlug(providerSlug);
    setFeedback(null);
    try {
      const updated = await toggleGatewayStatus({
        providerSlug: providerSlug as PaymentProcessorSlug,
        isEnabled,
        actorUserId,
        actorRole,
        stepUpVerified: isStepUpVerified,
      });

      setFeedback({
        type: 'success',
        message: `Gateway ${updated.displayName} successfully ${isEnabled ? 'activated' : 'deactivated'}.`,
      });

      await loadGateways();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setActiveTogglingSlug(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Navigation & Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <Link
              href="/super-admin"
              className="mb-2 inline-flex items-center text-xs text-slate-400 hover:text-white"
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Back to Super Admin
            </Link>
            <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              <ShieldCheck className="h-7 w-7 text-emerald-400" />
              Payment Processor Gateway Console
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage live payment gateways, credential routing, automated health pings, and hot-pluggable processor adapters.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isStepUpVerified ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                <CheckCircle className="h-3.5 w-3.5" /> 2FA Step-Up Active
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsStepUpOpen(true)}
                className="border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
              >
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                Authenticate 2FA Step-Up
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={loadGateways}
              disabled={!isStepUpVerified || loading}
              className="border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mb-6 flex items-start gap-3 rounded-lg border p-4 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                : 'border-red-500/30 bg-red-950/40 text-red-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle className="h-5 w-5 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Main Content Area */}
        {!isStepUpVerified ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
            <KeyRound className="mx-auto h-12 w-12 text-amber-400" />
            <h3 className="mt-4 text-lg font-bold text-white">2FA Step-Up Reauthentication Required</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              Payment gateway credentials and activation toggles require high-privilege 2FA authorization
              per KD Solution IT security policy LR-022.
            </p>
            <Button
              onClick={() => setIsStepUpOpen(true)}
              className="mt-6 bg-emerald-600 hover:bg-emerald-500"
            >
              Reauthenticate with TOTP
            </Button>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-72 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {gateways.map((gw) => (
              <GatewayConfigCard
                key={gw.providerSlug}
                gateway={gw}
                onTestConnection={handleTestConnection}
                onToggleStatus={handleToggleStatus}
                isTesting={activeTestingSlug === gw.providerSlug}
                isToggling={activeTogglingSlug === gw.providerSlug}
              />
            ))}
          </div>
        )}

        {/* Step-Up Modal */}
        <StepUpAuthModal
          isOpen={isStepUpOpen}
          onClose={() => setIsStepUpOpen(false)}
          onVerified={handleStepUpVerified}
          action="UPDATE_GATEWAY_KEYS"
          title="Super Admin Gateway Verification"
          description="Enter your 6-digit TOTP authenticator code to access live payment gateway credentials and controls."
        />
      </div>
    </div>
  );
}
