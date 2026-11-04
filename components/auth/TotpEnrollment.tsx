// path: components/auth/TotpEnrollment.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Loader2,
  QrCode,
  KeyRound,
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
import { Input } from '@/components/ui/Input';

export interface TotpEnrollmentProps {
  readonly initialSecret?: string | undefined;
  readonly initialQrCodeUrl?: string | undefined;
  readonly onSuccess?: (() => void) | undefined;
  readonly setupApiUrl?: string | undefined;
  readonly verifyApiUrl?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Step 052: Mandatory 2FA TOTP Enrollment & QR Code Component.
 * Renders high-resolution authenticator QR code, manual entry Base32 secret,
 * and 6-digit code verification input to complete mandatory 2FA enrollment.
 */
export function TotpEnrollment({
  initialSecret,
  initialQrCodeUrl,
  onSuccess,
  setupApiUrl = '/api/auth/2fa/setup',
  verifyApiUrl = '/api/auth/2fa/verify-enrollment',
  className = '',
}: TotpEnrollmentProps) {
  const [secret, setSecret] = useState<string>(initialSecret ?? '');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>(initialQrCodeUrl ?? '');
  const [isLoadingSetup, setIsLoadingSetup] = useState<boolean>(
    !initialSecret || !initialQrCodeUrl
  );
  const [setupError, setSetupError] = useState<string | null>(null);

  const [verificationCode, setVerificationCode] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isEnrolled, setIsEnrolled] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Fetch setup details from API if not supplied via props
  const fetchSetup = useCallback(async () => {
    if (initialSecret && initialQrCodeUrl) {
      setSecret(initialSecret);
      setQrCodeUrl(initialQrCodeUrl);
      setIsLoadingSetup(false);
      return;
    }

    setIsLoadingSetup(true);
    setSetupError(null);

    try {
      const res = await fetch(setupApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        throw new Error(
          errorJson?.detail ||
            errorJson?.message ||
            'Failed to initialize two-factor authentication setup.'
        );
      }

      const data = await res.json();
      setSecret(data.secret || '');
      setQrCodeUrl(data.qr_code_data_url || '');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error occurred.';
      setSetupError(msg);
    } finally {
      setIsLoadingSetup(false);
    }
  }, [initialSecret, initialQrCodeUrl, setupApiUrl]);

  useEffect(() => {
    fetchSetup();
  }, [fetchSetup]);

  const handleCopySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = verificationCode.trim();

    if (!/^\d{6}$/.test(cleanCode)) {
      setVerifyError('Please enter a valid 6-digit numeric verification code.');
      return;
    }

    setIsSubmitting(true);
    setVerifyError(null);

    try {
      const res = await fetch(verifyApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode }),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        throw new Error(
          errorJson?.detail ||
            errorJson?.message ||
            'Invalid or expired 6-digit code. Please try again.'
        );
      }

      setIsEnrolled(true);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed.';
      setVerifyError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format secret in readable 4-character blocks
  const formattedSecret = secret
    ? secret.match(/.{1,4}/g)?.join(' ') ?? secret
    : '';

  if (isEnrolled) {
    return (
      <Card className={`max-w-md mx-auto shadow-lg border-emerald-200 ${className}`}>
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-2">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <CardTitle className="text-emerald-700 text-xl">
            2FA Active & Verified
          </CardTitle>
          <CardDescription>
            Two-factor authentication is now active on your account. Your login security is protected.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center pt-2">
          <p className="text-sm text-muted-foreground">
            Make sure to keep your authenticator app handy for future sign-ins.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`max-w-md mx-auto shadow-lg ${className}`}>
      <CardHeader className="text-center pb-2">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-2">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <CardTitle className="text-xl">Set Up Two-Factor Authentication</CardTitle>
        <CardDescription>
          Scan the QR code with your authenticator app (Google Authenticator, Authy, or 1Password)
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 pt-2">
        {setupError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p>{setupError}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 text-xs"
                onClick={fetchSetup}
              >
                Retry Setup
              </Button>
            </div>
          </div>
        )}

        {isLoadingSetup ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Generating your secure authenticator secret...
            </p>
          </div>
        ) : (
          <>
            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-4 bg-muted/40 rounded-xl border border-muted">
              {qrCodeUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrCodeUrl}
                  alt="Authenticator QR Code"
                  className="w-56 h-56 rounded-lg border shadow-sm bg-white p-2"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center bg-muted rounded-lg text-muted-foreground">
                  <QrCode className="w-12 h-12" />
                </div>
              )}
              <span className="text-xs text-muted-foreground mt-2">
                Scan with any standard RFC 6238 authenticator
              </span>
            </div>

            {/* Manual Entry Secret */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center space-x-1">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Cannot scan? Use manual setup key:</span>
              </label>
              <div className="flex items-center space-x-2">
                <code className="flex-1 p-2 bg-muted rounded text-xs font-mono tracking-wider text-center select-all border">
                  {formattedSecret || '------------------------'}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopySecret}
                  className="px-2.5 h-8 flex items-center space-x-1"
                  title="Copy secret"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-xs text-emerald-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span className="text-xs">Copy</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Verification Form */}
            <form onSubmit={handleVerify} className="space-y-4 pt-2 border-t">
              <div className="space-y-2">
                <label
                  htmlFor="totp-code"
                  className="text-sm font-medium leading-none block"
                >
                  6-Digit Verification Code
                </label>
                <Input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  value={verificationCode}
                  onChange={(e) =>
                    setVerificationCode(e.target.value.replace(/\D/g, ''))
                  }
                  className="text-center tracking-widest text-lg font-mono"
                  disabled={isSubmitting || isLoadingSetup}
                />
              </div>

              {verifyError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs">{verifyError}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                isLoading={isSubmitting}
                disabled={verificationCode.length !== 6 || isSubmitting}
              >
                Verify & Enable 2FA
              </Button>
            </form>
          </>
        )}
      </CardContent>

      <CardFooter className="flex justify-center border-t py-3 bg-muted/20">
        <span className="text-xs text-muted-foreground text-center">
          KD Solution IT Security & Compliance Protection
        </span>
      </CardFooter>
    </Card>
  );
}
