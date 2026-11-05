// path: tests/processors/provisioning.test.ts

import { describe, it, expect } from 'vitest';
import {
  generateProviderSubmerchantId,
  provisionSubMerchantAccounts,
  isMerchantOperational,
  ALL_PLATFORM_PROCESSORS,
} from '@/lib/processors/provisioning';

describe('Step 110: Sub-Merchant Auto-Provisioning Pipeline & Multi-Gateway Sync', () => {
  const companyId = '018f6c4c-3500-7fa1-b1e2-999999999abc';
  const tenantId = '018f6c4c-3500-7fa1-b1e2-123456789abc';

  it('Step 110.1: generates provider-specific sub-merchant IDs across all five payment processors', () => {
    const stripeId = generateProviderSubmerchantId('stripe_connect', companyId);
    expect(stripeId).toMatch(/^acct_stripe_/);

    const rfId = generateProviderSubmerchantId('rainforest', companyId);
    expect(rfId).toMatch(/^sub_rf_/);

    const nmiId = generateProviderSubmerchantId('nmi', companyId);
    expect(nmiId).toMatch(/^mid_nmi_/);

    const awxId = generateProviderSubmerchantId('airwallex', companyId);
    expect(awxId).toMatch(/^sub_awx_/);

    const payoneerId = generateProviderSubmerchantId('payoneer', companyId);
    expect(payoneerId).toMatch(/^pdr_payoneer_/);
  });

  it('Step 110.2: provisions sub-merchant accounts across all 5 payment processors upon executive sign-off', async () => {
    const summary = await provisionSubMerchantAccounts({
      tenantId,
      companyId,
      companyLegalName: 'Apex Cloud Systems Inc',
      mccCode: '5734',
    });

    expect(summary.totalProvidersAttempted).toBe(5);
    expect(summary.activeAccountsCount).toBe(5);
    expect(summary.pendingMasterCount).toBe(0);
    expect(summary.requiresOfficeAlert).toBe(false);

    const providerNames = summary.accounts.map((a) => a.providerName);
    expect(providerNames).toEqual(expect.arrayContaining([...ALL_PLATFORM_PROCESSORS]));

    for (const account of summary.accounts) {
      expect(account.status).toBe('active');
      expect(account.capabilities.card_payments).toBe(true);
      expect(account.capabilities.payouts).toBe(true);
      expect(account.webhookEndpointId).toBeDefined();
    }
  });

  it('Step 110.3: queues provisioning and raises urgent alert if master platform gateway is disconnected', async () => {
    const summary = await provisionSubMerchantAccounts({
      tenantId,
      companyId,
      companyLegalName: 'Apex Cloud Systems Inc',
      mccCode: '5734',
      masterGatewayAvailability: {
        nmi: true,
        stripe_connect: false, // DISCONNECTED MASTER GATEWAY
        rainforest: true,
        airwallex: true,
        payoneer: true,
      },
    });

    expect(summary.activeAccountsCount).toBe(4);
    expect(summary.pendingMasterCount).toBe(1);
    expect(summary.requiresOfficeAlert).toBe(true);
    expect(summary.alertReason).toContain('Urgent');

    const stripeAccount = summary.accounts.find((a) => a.providerName === 'stripe_connect');
    expect(stripeAccount?.status).toBe('pending_master_gateway');
    expect(stripeAccount?.capabilities.card_payments).toBe(false);
  });

  it('Step 110.4: operational gate blocks payments and payouts if processor verification is incomplete', async () => {
    const summary = await provisionSubMerchantAccounts({
      tenantId,
      companyId,
      companyLegalName: 'Apex Cloud Systems Inc',
      mccCode: '5734',
    });

    const gate = isMerchantOperational({
      subMerchantAccounts: summary.accounts,
      isProcessorVerified: false, // NOT VERIFIED BY UPSTREAM PROCESSOR
      isPlatformRiskCleared: true,
    });

    expect(gate.canAcceptPayments).toBe(false);
    expect(gate.canInitiatePayouts).toBe(false);
    expect(gate.canPublishOfferings).toBe(false);
    expect(gate.reasons).toContain('Processor authoritative KYB verification is not complete.');
  });

  it('Step 110.5: operational gate blocks payments and payouts if platform risk checks are not cleared', async () => {
    const summary = await provisionSubMerchantAccounts({
      tenantId,
      companyId,
      companyLegalName: 'Apex Cloud Systems Inc',
      mccCode: '5734',
    });

    const gate = isMerchantOperational({
      subMerchantAccounts: summary.accounts,
      isProcessorVerified: true,
      isPlatformRiskCleared: false, // NOT CLEARED BY RISK
    });

    expect(gate.canAcceptPayments).toBe(false);
    expect(gate.canInitiatePayouts).toBe(false);
    expect(gate.canPublishOfferings).toBe(false);
    expect(gate.reasons).toContain('Platform compliance and risk underwriting checks are not cleared.');
  });

  it('Step 110.6: operational gate enables product listings, payments, and payouts when all checks pass', async () => {
    const summary = await provisionSubMerchantAccounts({
      tenantId,
      companyId,
      companyLegalName: 'Apex Cloud Systems Inc',
      mccCode: '5734',
    });

    const gate = isMerchantOperational({
      subMerchantAccounts: summary.accounts,
      isProcessorVerified: true,
      isPlatformRiskCleared: true,
    });

    expect(gate.canAcceptPayments).toBe(true);
    expect(gate.canInitiatePayouts).toBe(true);
    expect(gate.canPublishOfferings).toBe(true);
    expect(gate.reasons).toHaveLength(0);
    expect(gate.activeGatewayProviders).toHaveLength(5);
  });
});
