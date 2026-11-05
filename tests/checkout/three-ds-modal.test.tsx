// path: tests/checkout/three-ds-modal.test.tsx
// @vitest-environment happy-dom

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThreeDsChallengeModal } from '@/components/checkout/ThreeDsChallengeModal';

describe('3D Secure 2.0 Challenge Modal Component (Step 134.2)', () => {
  const challengeUrl = 'https://3ds-acs.auth.platform/challenge/pi_test_123';

  beforeEach(() => {
    // Suppress happy-dom external iframe network load notice
    const originalSrcDescriptor = Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype,
      'src'
    );

    if (originalSrcDescriptor?.set) {
      vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLIFrameElement, val: string) {
        this.setAttribute('src', val);
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders modal with issuer challenge iframe when isOpen is true', () => {
    render(<ThreeDsChallengeModal url={challengeUrl} isOpen={true} />);

    expect(screen.getByTestId('three-ds-modal')).toBeDefined();
    const iframe = screen.getByTestId('three-ds-iframe') as HTMLIFrameElement;
    expect(iframe).toBeDefined();
    expect(iframe.src).toBe(challengeUrl);
    expect(screen.getByText('Cardholder Identity Verification (3DS2)')).toBeDefined();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ThreeDsChallengeModal url={challengeUrl} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('triggers onCancel when close button or cancel link is clicked', () => {
    const handleCancel = vi.fn();
    render(
      <ThreeDsChallengeModal
        url={challengeUrl}
        isOpen={true}
        onCancel={handleCancel}
      />
    );

    const closeBtn = screen.getByTestId('three-ds-close-btn');
    fireEvent.click(closeBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);

    const cancelLink = screen.getByTestId('three-ds-cancel-btn');
    fireEvent.click(cancelLink);
    expect(handleCancel).toHaveBeenCalledTimes(2);
  });

  it('invokes onComplete when postMessage indicates challenge success', () => {
    const handleComplete = vi.fn();
    render(
      <ThreeDsChallengeModal
        url={challengeUrl}
        isOpen={true}
        onComplete={handleComplete}
      />
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: '3ds_challenge_complete',
            token: 'tok_3ds_challenge_cleared_99182',
          },
        })
      );
    });

    expect(handleComplete).toHaveBeenCalledWith('tok_3ds_challenge_cleared_99182');
  });
});
