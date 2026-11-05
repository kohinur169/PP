// path: components/checkout/CollectJsField.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
import type { CollectJsCardMetadata, CollectJsTokenResponse } from '@/types/collectjs';

export interface CollectJsFieldProps {
  tokenizationKey: string;
  onTokenSuccess: (token: string, cardMeta?: CollectJsCardMetadata | undefined) => void;
  onTokenError?: ((error: string) => void) | undefined;
  scriptUrl?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  submitButtonText?: string | undefined;
}

export function CollectJsField({
  tokenizationKey,
  onTokenSuccess,
  onTokenError,
  scriptUrl = 'https://secure.nmi.com/token/Collect.js',
  disabled = false,
  className = '',
  submitButtonText = 'Pay Securely',
}: CollectJsFieldProps) {
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isTokenizing, setIsTokenizing] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    // Check if script already injected
    const existingScript = document.querySelector(`script[src="${scriptUrl}"]`) as HTMLScriptElement | null;

    const setupCollectJs = () => {
      if (!window.CollectJS) {
        setLoadError('NMI Collect.js library failed to initialize on window.');
        onTokenError?.('NMI Collect.js library failed to initialize on window.');
        return;
      }

      try {
        window.CollectJS.configure({
          paymentSelector: '#nmi-pay-button',
          variant: 'inline',
          styleObject: {
            input: {
              'font-size': '14px',
              'font-family': 'ui-sans-serif, system-ui, sans-serif',
              color: '#111827',
              height: '40px',
              border: '1px solid #d1d5db',
              'border-radius': '6px',
              padding: '8px 12px',
              'background-color': '#ffffff',
            },
            ':focus': {
              border: '1px solid #2563eb',
              outline: 'none',
              'box-shadow': '0 0 0 2px rgba(37, 99, 235, 0.2)',
            },
            '.invalid': {
              border: '1px solid #dc2626',
              color: '#dc2626',
            },
          },
          fields: {
            ccnumber: {
              selector: '#nmi-collect-ccnumber',
              placeholder: '•••• •••• •••• ••••',
            },
            ccexp: {
              selector: '#nmi-collect-ccexp',
              placeholder: 'MM / YY',
            },
            cvv: {
              selector: '#nmi-collect-cvv',
              placeholder: 'CVC',
            },
          },
          validationCallback: (field: string, status: boolean, message: string) => {
            if (!isMountedRef.current) return;
            setValidationErrors((prev) => {
              const updated = { ...prev };
              if (!status && message) {
                updated[field] = message;
              } else {
                delete updated[field];
              }
              return updated;
            });
          },
          callback: (response: CollectJsTokenResponse) => {
            if (!isMountedRef.current) return;
            setIsTokenizing(false);

            if (response.token) {
              setValidationErrors({});
              onTokenSuccess(response.token, response.card);
            } else {
              const errMsg = 'Failed to generate one-time payment token from NMI Collect.js.';
              setValidationErrors({ general: errMsg });
              onTokenError?.(errMsg);
            }
          },
          timeoutDuration: 15000,
          timeoutCallback: () => {
            if (!isMountedRef.current) return;
            setIsTokenizing(false);
            const timeoutMsg = 'Tokenization timed out. Please check card details and retry.';
            setValidationErrors({ general: timeoutMsg });
            onTokenError?.(timeoutMsg);
          },
        });

        setIsScriptLoaded(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(msg);
        onTokenError?.(msg);
      }
    };

    if (existingScript) {
      if (window.CollectJS) {
        setupCollectJs();
      } else {
        existingScript.addEventListener('load', setupCollectJs);
      }
    } else {
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.async = true;
      script.setAttribute('data-tokenization-key', tokenizationKey);

      script.onload = () => {
        if (isMountedRef.current) {
          setupCollectJs();
        }
      };

      script.onerror = () => {
        if (isMountedRef.current) {
          const errText = 'Failed to load NMI Collect.js hosted tokenization script from secure origin.';
          setLoadError(errText);
          onTokenError?.(errText);
        }
      };

      document.head.appendChild(script);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [tokenizationKey, scriptUrl, onTokenSuccess, onTokenError]);

  return (
    <div className={`nmi-collectjs-container space-y-4 p-4 rounded-lg border border-gray-200 bg-white ${className}`}>
      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-800">Card Payment (PCI-DSS SAQ A Hosted)</span>
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
          Encrypted Hosted Fields
        </span>
      </div>

      {loadError && (
        <div className="p-3 text-sm text-red-700 bg-red-50 rounded-md border border-red-200" role="alert">
          {loadError}
        </div>
      )}

      {validationErrors['general'] && (
        <div className="p-3 text-sm text-red-700 bg-red-50 rounded-md border border-red-200" role="alert">
          {validationErrors['general']}
        </div>
      )}

      {/* Card Number Hosted Mount Target */}
      <div className="space-y-1">
        <label htmlFor="nmi-collect-ccnumber" className="block text-xs font-medium text-gray-700">
          Card Number
        </label>
        <div
          id="nmi-collect-ccnumber"
          className="h-10 w-full rounded-md border border-gray-300 bg-gray-50/50 flex items-center px-3"
          data-testid="collectjs-ccnumber-target"
        />
        {validationErrors['ccnumber'] && (
          <p className="text-xs text-red-600 mt-0.5">{validationErrors['ccnumber']}</p>
        )}
      </div>

      {/* Expiry and CVV Mount Targets */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="nmi-collect-ccexp" className="block text-xs font-medium text-gray-700">
            Expiration Date
          </label>
          <div
            id="nmi-collect-ccexp"
            className="h-10 w-full rounded-md border border-gray-300 bg-gray-50/50 flex items-center px-3"
            data-testid="collectjs-ccexp-target"
          />
          {validationErrors['ccexp'] && (
            <p className="text-xs text-red-600 mt-0.5">{validationErrors['ccexp']}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="nmi-collect-cvv" className="block text-xs font-medium text-gray-700">
            Security Code (CVC)
          </label>
          <div
            id="nmi-collect-cvv"
            className="h-10 w-full rounded-md border border-gray-300 bg-gray-50/50 flex items-center px-3"
            data-testid="collectjs-cvv-target"
          />
          {validationErrors['cvv'] && (
            <p className="text-xs text-red-600 mt-0.5">{validationErrors['cvv']}</p>
          )}
        </div>
      </div>

      {/* Collect.js Tokenization Trigger Button */}
      <button
        id="nmi-pay-button"
        type="button"
        disabled={disabled || !isScriptLoaded || isTokenizing}
        onClick={() => setIsTokenizing(true)}
        className="w-full mt-2 h-10 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium rounded-md shadow-sm transition-colors text-sm flex items-center justify-center gap-2"
        data-testid="collectjs-submit-btn"
      >
        {isTokenizing ? (
          <>
            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Tokenizing Card...
          </>
        ) : (
          submitButtonText
        )}
      </button>
    </div>
  );
}
