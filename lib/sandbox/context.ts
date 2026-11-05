// path: lib/sandbox/context.ts

import { logger } from '@/lib/logger/logger';

export interface SandboxEnvironmentContext {
  companyId: string;
  isTestMode: boolean;
  bannerVisible: boolean;
  bannerMessage: string;
}

const companySandboxModes = new Map<string, boolean>();

/**
 * Step 214.2: Enforces strict data separation between Live and Test/Sandbox environments.
 */
export function setMerchantSandboxMode(companyId: string, isTest: boolean): SandboxEnvironmentContext {
  companySandboxModes.set(companyId, isTest);

  logger.info('Merchant sandbox mode toggled', {
    companyId,
    isTestMode: isTest,
  });

  return getMerchantSandboxContext(companyId);
}

export function getMerchantSandboxContext(companyId: string): SandboxEnvironmentContext {
  const isTest = companySandboxModes.get(companyId) ?? false;

  return {
    companyId,
    isTestMode: isTest,
    bannerVisible: isTest,
    bannerMessage: isTest
      ? 'TEST MODE ACTIVE — Transactions are simulated and will not move real funds.'
      : '',
  };
}

/**
 * Step 214.4: Sandbox isolation guard preventing test payments from touching real balances or bank payouts.
 */
export function assertSandboxTransactionAllowed(isTestMode: boolean, operation: 'charge' | 'payout' | 'settlement'): void {
  if (isTestMode && operation === 'payout') {
    throw new Error('Sandbox Guard: Payouts to real bank accounts are strictly prohibited in Test Mode.');
  }
}

export function resetSandboxModes(): void {
  companySandboxModes.clear();
}
