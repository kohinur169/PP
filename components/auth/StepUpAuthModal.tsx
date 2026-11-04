// path: components/auth/StepUpAuthModal.tsx

'use client';

import * as React from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ShieldAlert, KeyRound, Smartphone, AlertCircle, Loader2 } from 'lucide-react';
import { SENSITIVE_ACTION_DESCRIPTIONS } from '@/lib/auth/step-up-types';
import type { SensitiveActionType } from '@/lib/auth/step-up-types';

export interface StepUpAuthModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onVerified: (ticketId: string) => void;
  readonly action?: SensitiveActionType | undefined;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
}

/**
 * Step 058.2: Reusable Step-Up Reauthentication Modal Component.
 * Prompts authenticated staff or merchant users for fresh password or TOTP verification
 * prior to executing high-privilege gateway, payout, KYC, or account mutations.
 */
export function StepUpAuthModal({
  isOpen,
  onClose,
  onVerified,
  action = 'UPDATE_GATEWAY_KEYS',
  title = 'Step-Up Verification Required',
  description,
}: StepUpAuthModalProps): React.ReactElement {
  const [method, setMethod] = React.useState<'password' | 'totp'>('password');
  const [password, setPassword] = React.useState('');
  const [totpCode, setTotpCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const actionDescription = SENSITIVE_ACTION_DESCRIPTIONS[action] ?? action;

  // Reset state on open/close
  React.useEffect(() => {
    if (isOpen) {
      setPassword('');
      setTotpCode('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (method === 'password' && !password.trim()) {
      setError('Please enter your account password.');
      return;
    }

    if (method === 'totp' && (!totpCode.trim() || totpCode.trim().length !== 6)) {
      setError('Please enter a valid 6-digit authenticator code.');
      return;
    }

    try {
      setLoading(true);

      const payload: Record<string, string> = { action };
      if (method === 'password') {
        payload.password = password;
      } else {
        payload.totp_code = totpCode.trim();
      }

      const res = await fetch('/api/auth/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.detail || data.message || 'Verification failed. Please check your credentials.');
        setLoading(false);
        return;
      }

      setLoading(false);
      onVerified(data.ticket_id);
      onClose();
    } catch (err: unknown) {
      setError('Network error occurred during verification. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent className="sm:max-w-md">
        <ModalHeader>
          <div className="flex items-center space-x-2 text-amber-600 mb-1">
            <ShieldAlert className="h-5 w-5" />
            <span className="text-xs font-semibold tracking-wider uppercase">High-Privilege Security Gate</span>
          </div>
          <ModalTitle>{title}</ModalTitle>
          <ModalDescription>
            {description ?? `This operation requires fresh identity verification: ${actionDescription}.`}
          </ModalDescription>
        </ModalHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Method Selection Tabs */}
          <div className="flex rounded-md border p-1 bg-muted/40">
            <button
              type="button"
              onClick={() => {
                setMethod('password');
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center space-x-2 py-1.5 text-xs font-medium rounded transition-colors ${
                method === 'password'
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Password</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod('totp');
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center space-x-2 py-1.5 text-xs font-medium rounded transition-colors ${
                method === 'totp'
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>2FA Authenticator</span>
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex items-start space-x-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/20">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Password Method Input */}
          {method === 'password' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Current Account Password</label>
              <Input
                type="password"
                placeholder="Enter your account password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                disabled={loading}
              />
              <p className="text-[11px] text-muted-foreground">
                Your reauthentication ticket will remain valid for 5 minutes (300 seconds).
              </p>
            </div>
          )}

          {/* 2FA Method Input */}
          {method === 'totp' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">6-Digit Authenticator Code</label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
                disabled={loading}
                className="font-mono tracking-widest text-center text-lg"
              />
              <p className="text-[11px] text-muted-foreground">
                Open Google Authenticator or your 2FA app to obtain your temporary code.
              </p>
            </div>
          )}

          <ModalFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Confirm & Proceed'
              )}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
