// path: tests/jobs/recurring-workers.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  runRecurringInvoicingJob,
  runSubscriptionChargesJob,
  runTokenAndSessionCleanupJob,
  seedRecurringTemplate,
  seedSubscription,
  seedCleanupItem,
  resetRecurringWorkersStore,
} from '@/lib/jobs/recurring-workers';
import { resetActivityMailerStore } from '@/lib/email/activity-mailer';

describe('Recurring Billing, Subscription Warnings & Token Cleanup Workers (Step 158)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyA = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    resetRecurringWorkersStore();
    resetActivityMailerStore();
  });

  describe('Recurring Invoicing Generation (Step 158.1)', () => {
    it('generates new invoices for due templates and advances next run date', async () => {
      seedRecurringTemplate({
        id: 'tpl_monthly_001',
        tenantId,
        companyId: companyA,
        clientEmail: 'buyer@corp.com',
        amountUsd: 499.0,
        cadence: 'monthly',
        nextRunDate: '2026-11-05',
        isActive: true,
      });

      seedRecurringTemplate({
        id: 'tpl_future_002',
        tenantId,
        companyId: companyA,
        clientEmail: 'future@corp.com',
        amountUsd: 150.0,
        cadence: 'monthly',
        nextRunDate: '2026-11-20', // Not yet due
        isActive: true,
      });

      const result = await runRecurringInvoicingJob({
        tenantId,
        currentDateStr: '2026-11-05',
      });

      expect(result.itemsProcessed).toBe(2);
      expect(result.generatedCount).toBe(1);
    });
  });

  describe('Subscription Charges & 7-Day Advance Warning (Step 158.2)', () => {
    it('dispatches advance warnings exactly 7 days prior to renewal', async () => {
      // 7 days ahead from 2026-11-05 is 2026-11-12
      seedSubscription({
        id: 'sub_merchant_plan_001',
        tenantId,
        companyId: companyA,
        merchantEmail: 'owner@store.com',
        planName: 'Enterprise SaaS PayFac Plan',
        amountUsd: 299.0,
        nextChargeDate: '2026-11-12',
        status: 'active',
        gatewayCustomerVaultId: 'vault_cust_99182',
      });

      const warningRun = await runSubscriptionChargesJob({
        tenantId,
        currentDateStr: '2026-11-05',
      });

      expect(warningRun.warningsSent).toBe(1);
      expect(warningRun.chargesProcessed).toBe(0);

      // Re-running on same day should not resend duplicate warning
      const duplicateRun = await runSubscriptionChargesJob({
        tenantId,
        currentDateStr: '2026-11-05',
      });
      expect(duplicateRun.warningsSent).toBe(0);
    });

    it('processes recurring charge when charge date is due', async () => {
      seedSubscription({
        id: 'sub_due_002',
        tenantId,
        companyId: companyA,
        merchantEmail: 'owner@store.com',
        planName: 'Pro Tier',
        amountUsd: 99.0,
        nextChargeDate: '2026-11-05', // Due today
        status: 'active',
        gatewayCustomerVaultId: 'vault_cust_123',
      });

      const chargeRun = await runSubscriptionChargesJob({
        tenantId,
        currentDateStr: '2026-11-05',
      });

      expect(chargeRun.chargesProcessed).toBe(1);
    });
  });

  describe('Token and Session Cleanup (Step 158.3)', () => {
    it('purges expired tokens while preserving active sessions', async () => {
      seedCleanupItem({
        id: 'token_expired_001',
        tenantId,
        tokenType: 'password_reset',
        expiresAt: '2026-11-01T00:00:00Z', // Expired
        isPurged: false,
      });

      seedCleanupItem({
        id: 'session_active_002',
        tenantId,
        tokenType: 'session',
        expiresAt: '2026-11-10T00:00:00Z', // Valid active
        isPurged: false,
      });

      const result = await runTokenAndSessionCleanupJob({
        tenantId,
        nowIso: '2026-11-05T12:00:00Z',
      });

      expect(result.purgedCount).toBe(1);
    });
  });
});
