// path: tests/checkout/collectjs.test.tsx
// @vitest-environment happy-dom

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CollectJsField } from '@/components/checkout/CollectJsField';
import type { CollectJsConfiguration, CollectJSGlobal } from '@/types/collectjs';

describe('NMI Collect.js Hosted Tokenization Front-End Component (Step 132)', () => {
  const tokenizationKey = 'sec_key_mock_tokenization_991823';
  let capturedConfig: CollectJsConfiguration | null = null;

  beforeEach(() => {
    capturedConfig = null;
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    const mockCollectJS: CollectJSGlobal = {
      configure: vi.fn().mockImplementation((cfg: CollectJsConfiguration) => {
        capturedConfig = cfg;
      }),
    };

    window.CollectJS = mockCollectJS;

    // Mock script element creation to prevent happy-dom external network load exceptions
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'script') {
        // Override src setter to not trigger network loading in test environment
        Object.defineProperty(el, 'src', {
          value: '',
          writable: true,
        });
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.CollectJS;
  });

  it('renders hosted field mount target containers and submit button without native input fields', () => {
    const handleSuccess = vi.fn();
    const { container } = render(
      <CollectJsField
        tokenizationKey={tokenizationKey}
        onTokenSuccess={handleSuccess}
        submitButtonText="Pay $150.00"
      />
    );

    expect(screen.getByTestId('collectjs-ccnumber-target')).toBeDefined();
    expect(screen.getByTestId('collectjs-ccexp-target')).toBeDefined();
    expect(screen.getByTestId('collectjs-cvv-target')).toBeDefined();
    expect(screen.getByTestId('collectjs-submit-btn')).toBeDefined();
    expect(screen.getByText('Pay $150.00')).toBeDefined();

    // Verify PCI-DSS SAQ A compliance: Zero native input fields
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).toBe(0);
  });

  it('injects Collect.js script with tokenization key and configures CollectJS on load', () => {
    const handleSuccess = vi.fn();
    render(
      <CollectJsField
        tokenizationKey={tokenizationKey}
        onTokenSuccess={handleSuccess}
      />
    );

    const script = document.querySelector('script') as HTMLScriptElement | null;
    expect(script).toBeDefined();
    expect(script?.src).toContain('https://secure.nmi.com/token/Collect.js');
    expect(script?.getAttribute('data-tokenization-key')).toBe(tokenizationKey);

    // Simulate script load
    act(() => {
      script?.dispatchEvent(new Event('load'));
    });

    expect(window.CollectJS?.configure).toHaveBeenCalled();
    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig?.fields?.ccnumber?.selector).toBe('#nmi-collect-ccnumber');
    expect(capturedConfig?.fields?.ccexp?.selector).toBe('#nmi-collect-ccexp');
    expect(capturedConfig?.fields?.cvv?.selector).toBe('#nmi-collect-cvv');
  });

  it('fires onTokenSuccess when CollectJS returns a token', () => {
    const handleSuccess = vi.fn();
    render(
      <CollectJsField
        tokenizationKey={tokenizationKey}
        onTokenSuccess={handleSuccess}
      />
    );

    const script = document.querySelector('script') as HTMLScriptElement | null;
    act(() => {
      script?.dispatchEvent(new Event('load'));
    });

    expect(capturedConfig?.callback).toBeDefined();

    // Simulate successful token emission from Collect.js iframe
    act(() => {
      capturedConfig?.callback?.({
        token: 'tok_nmi_1MockPaymentToken9988',
        card: { bin: '424242', exp: '1228', type: 'visa' },
      });
    });

    expect(handleSuccess).toHaveBeenCalledWith('tok_nmi_1MockPaymentToken9988', {
      bin: '424242',
      exp: '1228',
      type: 'visa',
    });
  });

  it('displays inline validation errors when CollectJS reports field validation failure', () => {
    const handleSuccess = vi.fn();
    render(
      <CollectJsField
        tokenizationKey={tokenizationKey}
        onTokenSuccess={handleSuccess}
      />
    );

    const script = document.querySelector('script') as HTMLScriptElement | null;
    act(() => {
      script?.dispatchEvent(new Event('load'));
    });

    // Simulate validation error on ccnumber
    act(() => {
      capturedConfig?.validationCallback?.('ccnumber', false, 'The card number entered is invalid.');
    });

    expect(screen.getByText('The card number entered is invalid.')).toBeDefined();

    // Simulate validation resolved
    act(() => {
      capturedConfig?.validationCallback?.('ccnumber', true, '');
    });

    expect(screen.queryByText('The card number entered is invalid.')).toBeNull();
  });
});
