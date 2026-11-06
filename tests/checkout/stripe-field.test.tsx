// path: tests/checkout/stripe-field.test.tsx
// @vitest-environment happy-dom

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StripeField } from '@/components/checkout/StripeField';

// Mock Stripe.js & React Stripe.js modules
const mockConfirmPayment = vi.fn();
const mockElements = {
  getElement: vi.fn(),
};

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-elements-provider">{children}</div>
  ),
  PaymentElement: () => <div data-testid="mock-payment-element" />,
  useStripe: () => ({
    confirmPayment: mockConfirmPayment,
  }),
  useElements: () => mockElements,
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue({}),
}));

describe('Stripe Elements & Hosted Secure Fields Component (Step 133)', () => {
  const dummyClientSecret = 'pi_3MockPaymentIntent99_secret_abc123';
  const returnUrl = 'http://localhost:3000/checkout/complete';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders error notice if clientSecret is missing', () => {
    const handleSuccess = vi.fn();
    render(
      <StripeField
        clientSecret=""
        returnUrl={returnUrl}
        onSuccess={handleSuccess}
      />
    );

    expect(screen.getByText('Missing Stripe PaymentIntent client secret.')).toBeDefined();
  });

  it('mounts Stripe Elements wrapper, PaymentElement container, and submit button', () => {
    const handleSuccess = vi.fn();
    const { container } = render(
      <StripeField
        clientSecret={dummyClientSecret}
        returnUrl={returnUrl}
        onSuccess={handleSuccess}
        submitButtonText="Pay Now $200.00"
      />
    );

    expect(screen.getByTestId('mock-elements-provider')).toBeDefined();
    expect(screen.getByTestId('mock-payment-element')).toBeDefined();
    expect(screen.getByTestId('stripe-submit-button')).toBeDefined();
    expect(screen.getByText('Pay Now $200.00')).toBeDefined();

    // Verify PCI-DSS SAQ A isolation: Zero native input fields
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).toBe(0);
  });

  it('executes stripe.confirmPayment on form submission and triggers onSuccess for succeeded payment', async () => {
    const handleSuccess = vi.fn();
    mockConfirmPayment.mockResolvedValueOnce({
      paymentIntent: {
        id: 'pi_3MockPaymentIntent99',
        status: 'succeeded',
        amount: 20000,
      },
    });

    render(
      <StripeField
        clientSecret={dummyClientSecret}
        returnUrl={returnUrl}
        onSuccess={handleSuccess}
      />
    );

    const submitBtn = screen.getByTestId('stripe-submit-button');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockConfirmPayment).toHaveBeenCalledWith({
        elements: mockElements,
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: 'if_required',
      });
    });

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pi_3MockPaymentIntent99',
          status: 'succeeded',
        })
      );
    });
  });

  it('displays inline error message when Stripe reports card decline or authentication error', async () => {
    const handleSuccess = vi.fn();
    const handleError = vi.fn();

    mockConfirmPayment.mockResolvedValueOnce({
      error: {
        message: 'Your card was declined due to insufficient funds.',
        code: 'card_declined',
      },
    });

    render(
      <StripeField
        clientSecret={dummyClientSecret}
        returnUrl={returnUrl}
        onSuccess={handleSuccess}
        onError={handleError}
      />
    );

    const submitBtn = screen.getByTestId('stripe-submit-button');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Your card was declined due to insufficient funds.')
      ).toBeDefined();
    });

    expect(handleError).toHaveBeenCalledWith(
      'Your card was declined due to insufficient funds.'
    );
    expect(handleSuccess).not.toHaveBeenCalled();
  });
});
