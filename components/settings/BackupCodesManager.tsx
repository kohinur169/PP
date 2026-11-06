// path: components/settings/BackupCodesManager.tsx
'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  RefreshCw,
  Copy,
  Check,
  Download,
  Printer,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export interface BackupCodesManagerProps {
  readonly initialCount?: number | undefined;
  readonly onRegenerated?: ((codes: string[]) => void) | undefined;
  readonly regenerateApiUrl?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Step 053.4: 2FA Backup Recovery Codes Management Component.
 * Enables merchants to monitor remaining recovery codes and generate
 * 10 fresh replacement codes, automatically invalidating previous codes.
 */
export function BackupCodesManager({
  initialCount = 10,
  onRegenerated,
  regenerateApiUrl = '/api/auth/2fa/backup-codes/regenerate',
  className = '',
}: BackupCodesManagerProps) {
  const [remainingCount, setRemainingCount] = useState<number>(initialCount);
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setError(null);
    setShowConfirm(false);

    try {
      const res = await fetch(regenerateApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        throw new Error(
          errorJson?.detail ||
            errorJson?.message ||
            'Failed to regenerate backup codes.'
        );
      }

      const data = await res.json();
      const codes: string[] = data.plain_codes || [];
      setNewCodes(codes);
      setRemainingCount(codes.length);

      if (onRegenerated) {
        onRegenerated(codes);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error occurred.';
      setError(msg);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCopyAll = async () => {
    if (newCodes.length === 0) return;
    try {
      const text = [
        '=== KD SOLUTION IT: 2FA BACKUP RECOVERY CODES ===',
        'Store these 10 one-time recovery codes in a secure password manager.',
        'Each code can be used exactly once to log in if your authenticator is lost.',
        '',
        ...newCodes.map((code, index) => `${index + 1}. ${code}`),
        '',
        `Generated on: ${new Date().toISOString()}`,
      ].join('\n');

      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadTxt = () => {
    if (newCodes.length === 0) return;
    const text = [
      '=== KD SOLUTION IT: 2FA BACKUP RECOVERY CODES ===',
      'Store these 10 one-time recovery codes in a secure password manager.',
      'Each code can be used exactly once to log in if your authenticator is lost.',
      '',
      ...newCodes.map((code, index) => `${index + 1}. ${code}`),
      '',
      `Generated on: ${new Date().toISOString()}`,
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kd-backup-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Card className={`max-w-2xl mx-auto shadow-md ${className}`}>
      <CardHeader>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-lg">2FA Backup Recovery Codes</CardTitle>
            <CardDescription>
              Single-use 8-character codes to access your account if your authenticator app is lost
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Status Banner */}
        <div className="flex items-center justify-between p-4 bg-muted/40 border rounded-lg">
          <div>
            <p className="text-sm font-medium">Active Recovery Codes</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {remainingCount} of 10 codes remaining
            </p>
          </div>
          <div>
            {remainingCount <= 2 ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                Low Balance
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                Healthy
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Confirmation State */}
        {showConfirm && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
            <div className="flex items-start space-x-2 text-amber-800">
              <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Regenerate Backup Codes?</h4>
                <p className="text-xs mt-1 text-amber-700">
                  Generating new backup codes will immediately invalidate all existing recovery codes.
                  You will need to save the new codes immediately.
                </p>
              </div>
            </div>
            <div className="flex space-x-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
                disabled={isRegenerating}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRegenerate}
                isLoading={isRegenerating}
              >
                Confirm & Regenerate
              </Button>
            </div>
          </div>
        )}

        {/* Freshly Generated Codes Display */}
        {newCodes.length > 0 && (
          <div className="space-y-4 p-4 bg-muted/30 border border-emerald-300 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-emerald-800">
                  Your New Backup Recovery Codes
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Save these 10 codes in a safe place. They will not be displayed again.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyAll}
                  className="h-8 text-xs flex items-center space-x-1"
                >
                  {copiedAll ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy All</span>
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTxt}
                  className="h-8 text-xs flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  className="h-8 text-xs flex items-center space-x-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              {newCodes.map((code, index) => (
                <div
                  key={index}
                  className="p-2.5 bg-white border rounded font-mono text-xs tracking-wider text-center font-semibold"
                >
                  <span className="text-muted-foreground mr-2">{index + 1}.</span>
                  {code}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t py-3 bg-muted/10">
        <span className="text-xs text-muted-foreground">
          Single-use security protection per KD Solution IT protocol
        </span>
        {!showConfirm && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfirm(true)}
            isLoading={isRegenerating}
            className="flex items-center space-x-1 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            <span>Regenerate Codes</span>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
