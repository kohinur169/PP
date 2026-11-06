// path: components/admin/GatewayConfigCard.tsx

'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Key, ShieldCheck, Power } from 'lucide-react';
import type { AdminGatewayConfig } from '@/lib/processors/admin';

export interface GatewayConfigCardProps {
  gateway: AdminGatewayConfig;
  onTestConnection: (providerSlug: string) => Promise<void>;
  onToggleStatus: (providerSlug: string, isEnabled: boolean) => Promise<void>;
  isTesting?: boolean;
  isToggling?: boolean;
}

export function GatewayConfigCard({
  gateway,
  onTestConnection,
  onToggleStatus,
  isTesting = false,
  isToggling = false,
}: GatewayConfigCardProps) {
  const [toggleError, setToggleError] = React.useState<string | null>(null);

  const handleToggle = async () => {
    setToggleError(null);
    try {
      await onToggleStatus(gateway.providerSlug, !gateway.isEnabled);
    } catch (err: unknown) {
      setToggleError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card className="flex flex-col justify-between border-slate-800 bg-slate-900 text-slate-100 shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xl font-bold text-white">{gateway.displayName}</CardTitle>
          <Badge variant={gateway.isEnabled ? 'success' : 'secondary'}>
            {gateway.isEnabled ? 'Active' : 'Disabled'}
          </Badge>
        </div>
        <CardDescription className="text-xs text-slate-400">
          Slug: <code className="text-emerald-400">{gateway.providerSlug}</code>
        </CardDescription>
        <p className="mt-2 text-sm text-slate-300">{gateway.description}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Capabilities Matrix */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Supported Capabilities
          </h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {gateway.capabilities.cardAcceptance && (
              <Badge variant="outline" className="border-slate-700 bg-slate-800/60 text-slate-200">
                Cards
              </Badge>
            )}
            {gateway.capabilities.eWallets && (
              <Badge variant="outline" className="border-slate-700 bg-slate-800/60 text-slate-200">
                Wallets (Apple/Google)
              </Badge>
            )}
            {gateway.capabilities.subMerchantCreation && (
              <Badge variant="outline" className="border-slate-700 bg-slate-800/60 text-slate-200">
                Sub-Merchants
              </Badge>
            )}
            {gateway.capabilities.payouts && (
              <Badge variant="outline" className="border-slate-700 bg-slate-800/60 text-slate-200">
                Payouts
              </Badge>
            )}
            {gateway.capabilities.hostedFields && (
              <Badge variant="outline" className="border-slate-700 bg-slate-800/60 text-slate-200">
                Hosted Fields (SAQ A)
              </Badge>
            )}
          </div>
        </div>

        {/* Masked Credentials */}
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Key className="h-3.5 w-3.5 text-amber-400" />
            Configured Credentials (Encrypted at Rest)
          </h4>
          <div className="mt-1.5 space-y-1 rounded border border-slate-800 bg-slate-950 p-2 text-xs font-mono">
            {Object.entries(gateway.maskedCredentials).length === 0 ? (
              <span className="text-slate-500 italic">No environment keys detected</span>
            ) : (
              Object.entries(gateway.maskedCredentials).map(([name, masked]) => (
                <div key={name} className="flex justify-between">
                  <span className="text-slate-400">{name}:</span>
                  <span className="text-slate-200">{masked}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Diagnostic Status */}
        <div className="rounded border border-slate-800 bg-slate-950/60 p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Connection Health:</span>
            {gateway.lastTestStatus === 'connected' ? (
              <span className="flex items-center gap-1 font-medium text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Healthy ({gateway.lastLatencyMs}ms)
              </span>
            ) : gateway.lastTestStatus === 'failed' ? (
              <span className="flex items-center gap-1 font-medium text-red-400">
                <XCircle className="h-3.5 w-3.5" /> Connection Failed
              </span>
            ) : (
              <span className="text-slate-500">Untested</span>
            )}
          </div>
          {gateway.lastTestedAt && (
            <div className="mt-1 text-[11px] text-slate-500">
              Last checked: {new Date(gateway.lastTestedAt).toLocaleTimeString()}
            </div>
          )}
        </div>

        {toggleError && (
          <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-950/40 p-2 text-xs text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{toggleError}</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2 border-t border-slate-800/60 pt-4">
        <Button
          variant="outline"
          size="sm"
          className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
          onClick={() => onTestConnection(gateway.providerSlug)}
          disabled={isTesting || isToggling}
          isLoading={isTesting}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Test Connection
        </Button>

        <Button
          variant={gateway.isEnabled ? 'destructive' : 'success'}
          size="sm"
          onClick={handleToggle}
          disabled={isTesting || isToggling}
          isLoading={isToggling}
        >
          <Power className="mr-1.5 h-3.5 w-3.5" />
          {gateway.isEnabled ? 'Disable Gateway' : 'Enable Gateway'}
        </Button>
      </CardFooter>
    </Card>
  );
}
