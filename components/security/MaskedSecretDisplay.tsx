// path: components/security/MaskedSecretDisplay.tsx

'use client';

import React, { useState } from 'react';
import { maskSecret } from '../../lib/crypto/mask';
import { en } from '../../lib/i18n/strings/en';

export interface MaskedSecretDisplayProps {
  readonly value: string | null | undefined;
  readonly lastUpdated?: string | Date | null | undefined;
  readonly label?: string | undefined;
  readonly visibleSuffixLength?: number | undefined;
  readonly copyValue?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Universal Masked Secret Display Component.
 * Enforces KD Solution IT security compliance:
 * - Credentials are never shown in full after creation
 * - Displays masked value with last 4 characters visible
 * - Renders last updated timestamp for audit verification
 */
export const MaskedSecretDisplay: React.FC<MaskedSecretDisplayProps> = ({
  value,
  lastUpdated,
  label,
  visibleSuffixLength = 4,
  copyValue,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const masked = maskSecret(value, visibleSuffixLength);

  const formattedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : en.security.neverUpdated;

  const handleCopy = async () => {
    if (!copyValue) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(copyValue);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Ignore clipboard write rejections in sandbox / non-https environments
    }
  };

  return (
    <div
      className={`rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-100 ${className}`}
      data-testid="masked-secret-container"
    >
      {label && (
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <code
            className="rounded bg-slate-800 px-2.5 py-1 font-mono text-sm tracking-wide text-emerald-400"
            data-testid="masked-secret-value"
          >
            {masked}
          </code>

          {copyValue && (
            <button
              type="button"
              onClick={handleCopy}
              className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              aria-label={en.security.copySecret}
              data-testid="copy-key-id-button"
            >
              {copied ? en.security.copied : en.security.copySecret}
            </button>
          )}
        </div>

        <div
          className="text-xs text-slate-400"
          data-testid="masked-secret-updated-at"
        >
          <span className="font-medium text-slate-400">{en.security.lastUpdated}:</span>{' '}
          <span className="text-slate-300">{formattedDate}</span>
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-400">
        {en.security.maskedSecretNotice}
      </div>
    </div>
  );
};
