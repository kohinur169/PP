// path: components/checkout/StripeField.tsx
'use client';

import React, { useState, useMemo } from 'react';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import type { Stripe, StripePaymentElementOptions } from '@stripe/stripe-js';
import { getStripeClient } from '@/lib/payment/stripe-client';

export interface StripeFieldProps {
  clientSecret: string;
  publishableKey?: string | undefined;
  returnUrl: string;
  onSuccess: (paymentIntent: Record<string, unknown>) => void;
  onError?: ((error: string) => void) | undefined;
  submitButtonText?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

interface StripeFormInnerProps {
  returnUrl: string;
  onSuccess: (paymentIntent: Record<string, unknown>) => void;
  onError?: ((error: string) => void) | undefined;
  submitButtonText: string;
  disabled: boolean;
}

function StripeFormInner({
  returnUrl,
  onSuccess,
  onError,
  submitButtonText,
  disabled,
}: StripeFormInnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const paymentElementOptions: StripePaymentElementOptions = {
    layout: 'tabs',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Step 133.3: Client-side stripe.confirmPayment flow
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: 'if_required',
      });

      if (error) {
        const errorText = error.message ?? 'An unexpected payment error occurred with Stripe Elements.';
        setErrorMessage(errorText);
        onError?.(errorText);
      } else if (paymentIntent) {
        if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
          onSuccess(paymentIntent as unknown as Record<string, unknown>);
        } else {
          const statusError = `Payment incomplete with status: ${paymentIntent.status}`;
          setErrorMessage(statusError);
          onError?.(statusError);
        }
      }
    } catch (err: unknown) {
      const generalError = err instanceof Error ? err.message : String(err);
      setErrorMessage(generalError);
      onError?.(generalError);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="stripe-payment-form">
      {errorMessage && (
        <div
          className="p-3 text-sm text-red-700 bg-red-50 rounded-md border border-red-200"
          role="alert"
          data-testid="stripe-error-message"
        >
          {errorMessage}
        </div>
      )}

      {/* Step 133.2: Unified Payment Element supporting cards, Apple Pay, and Google Pay */}
      <div className="stripe-payment-element-wrapper min-h-[160px]" data-testid="stripe-element-container">
        <PaymentElement options={paymentElementOptions} />
      </div>

      <button
        type="submit"
        disabled={disabled || !stripe || !elements || isProcessing}
        className="w-full h-10 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium rounded-md shadow-sm transition-colors text-sm flex items-center justify-center gap-2"
        data-testid="stripe-submit-button"
      >
        {isProcessing ? (
          <>
            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Authorizing Payment...
          </>
        ) : (
          submitButtonText
        )}
      </button>
    </form>
  );
}

/**
 * Step 133.1: Wraps checkout form in Stripe <Elements> provider with design system styling.
 */
export function StripeField({
  clientSecret,
  publishableKey,
  returnUrl,
  onSuccess,
  onError,
  submitButtonText = 'Pay Securely',
  disabled = false,
  className = '',
}: StripeFieldProps) {
  const stripePromise = useMemo(() => getStripeClient(publishableKey), [publishableKey]);

  if (!clientSecret || !clientSecret.trim()) {
    return (
      <div className="p-4 text-sm text-red-700 bg-red-50 rounded-md border border-red-200">
        Missing Stripe PaymentIntent client secret.
      </div>
    );
  }

  const appearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#2563eb',
      colorBackground: '#ffffff',
      colorText: '#111827',
      colorDanger: '#dc2626',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      spacingUnit: '4px',
      borderRadius: '6px',
    },
  };

  return (
    <div className={`stripe-field-container p-4 rounded-lg border border-gray-200 bg-white ${className}`}>
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-800">
          Digital Wallet & Card Payment (Stripe Elements)
        </span>
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
          Encrypted SAQ A Elements
        </span>
      </div>

      <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
        <StripeFormInner
          returnUrl={returnUrl}
          onSuccess={onSuccess}
          onError={onError}
          submitButtonText={submitButtonText}
          disabled={disabled}
        />
      </Elements>
    </div>
  );
}
