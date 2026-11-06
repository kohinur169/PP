// path: components/checkout/ThreeDsChallengeModal.tsx
'use client';

import React, { useEffect } from 'react';

export interface ThreeDsChallengeModalProps {
  url: string;
  isOpen: boolean;
  onComplete?: ((token?: string | undefined) => void) | undefined;
  onCancel?: (() => void) | undefined;
  title?: string | undefined;
}

/**
 * Step 134.2: 3D Secure 2.0 Access Control Server (ACS) Step-Up Challenge Modal.
 * Renders an isolated iframe embedding the card issuer's authentication prompt
 * and listens for postMessage completion notifications.
 */
export function ThreeDsChallengeModal({
  url,
  isOpen,
  onComplete,
  onCancel,
  title = 'Cardholder Identity Verification (3DS2)',
}: ThreeDsChallengeModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleMessage = (event: MessageEvent) => {
      // Validate origin if expected, or inspect payload structure
      const data = event.data as Record<string, unknown> | undefined;
      if (data && (data['type'] === '3ds_challenge_complete' || data['status'] === 'authenticated')) {
        const token = (data['token'] as string | undefined) ?? '3ds_challenge_auth_token_success';
        onComplete?.(token);
      } else if (data && (data['type'] === '3ds_challenge_failed' || data['status'] === 'failed')) {
        onCancel?.();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isOpen, onComplete, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="three-ds-modal-title"
      data-testid="three-ds-modal"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl border border-gray-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/80">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <h2 id="three-ds-modal-title" className="text-sm font-semibold text-gray-800">
              {title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 text-sm font-medium transition-colors"
            data-testid="three-ds-close-btn"
            aria-label="Close Verification"
          >
            ✕
          </button>
        </div>

        {/* Modal Body: Secure Issuer Challenge Iframe */}
        <div className="relative h-[480px] w-full bg-gray-100 flex items-center justify-center">
          <iframe
            src={url}
            title="Issuer 3D Secure Challenge"
            className="h-full w-full border-0"
            data-testid="three-ds-iframe"
            sandbox="allow-scripts allow-forms allow-same-origin allow-top-navigation"
          />
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>Protected by 3-D Secure 2.2 Protocol</span>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-600 hover:text-gray-900 underline text-xs"
            data-testid="three-ds-cancel-btn"
          >
            Cancel and Return
          </button>
        </div>
      </div>
    </div>
  );
}
