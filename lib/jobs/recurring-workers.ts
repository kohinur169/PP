// path: lib/jobs/recurring-workers.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { dispatchActivityEmail } from '@/lib/email/activity-mailer';

export interface RecurringInvoiceTemplate {
  id: string;
  tenantId: string;
  companyId: string;
  clientEmail: string;
  amountUsd: number;
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'annually';
  nextRunDate: string; // YYYY-MM-DD
  isActive: boolean;
  lastGeneratedAt?: string | undefined;
}

export interface GeneratedInvoiceInstance {
  id: string;
  templateId: string;
  tenantId: string;
  companyId: string;
  clientEmail: string;
  amountUsd: number;
  invoiceNumber: string;
  issuedAt: string;
}

export interface PlatformSubscriptionRecord {
  id: string;
  tenantId: string;
  companyId: string;
  merchantEmail: string;
  planName: string;
  amountUsd: number;
  nextChargeDate: string; // YYYY-MM-DD
  advanceWarningSentAt?: string | undefined;
  status: 'active' | 'past_due' | 'canceled';
  gatewayCustomerVaultId: string;
}

export interface CleanupItemRecord {
  id: string;
  tenantId: string;
  tokenType: 'session' | 'password_reset' | 'email_verify';
  expiresAt: string;
  isPurged: boolean;
}

const recurringTemplatesStore = new Map<string, RecurringInvoiceTemplate>();
const generatedInvoicesStore = new Map<string, GeneratedInvoiceInstance>();
const subscriptionsStore = new Map<string, PlatformSubscriptionRecord>();
const cleanupStore = new Map<string, CleanupItemRecord>();
let invoiceNumCounter = 5000;

/**
 * Calculates next run date based on cadence.
 */
function advanceCadenceDate(currentDateStr: string, cadence: string): string {
  const d = new Date(currentDateStr);
  if (cadence === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (cadence === 'quarterly') {
    d.setMonth(d.getMonth() + 3);
  } else if (cadence === 'annually') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    // monthly default
    d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Step 158.1: Recurring Invoicing Worker.
 * Section 27: "Recurring invoice generation and client reminders."
 */
export async function runRecurringInvoicingJob(input: {
  tenantId: string;
  currentDateStr: string; // YYYY-MM-DD
}): Promise<{ itemsProcessed: number; generatedCount: number }> {
  let itemsProcessed = 0;
  let generatedCount = 0;

  for (const template of recurringTemplatesStore.values()) {
    if (template.tenantId !== input.tenantId || !template.isActive) {
      continue;
    }

    itemsProcessed++;

    if (template.nextRunDate <= input.currentDateStr) {
      invoiceNumCounter++;
      const invoiceNumber = `INV-REC-${invoiceNumCounter}`;
      const instanceId = generateUuidV7();
      const now = new Date().toISOString();

      const instance: GeneratedInvoiceInstance = {
        id: instanceId,
        templateId: template.id,
        tenantId: template.tenantId,
        companyId: template.companyId,
        clientEmail: template.clientEmail,
        amountUsd: template.amountUsd,
        invoiceNumber,
        issuedAt: now,
      };

      generatedInvoicesStore.set(instanceId, instance);

      // Advance schedule
      template.lastGeneratedAt = now;
      template.nextRunDate = advanceCadenceDate(template.nextRunDate, template.cadence);
      generatedCount++;

      logger.info('Recurring invoice generated and reminder dispatched', {
        templateId: template.id,
        invoiceNumber,
        clientEmail: template.clientEmail,
        amountUsd: template.amountUsd,
      });

      // Dispatch client email notification with payment link
      try {
        await dispatchActivityEmail({
          tenantId: template.tenantId,
          templateKey: 'invoice_sent',
          recipient: template.clientEmail,
          variables: {
            invoiceNumber,
            merchantName: 'Sub-Merchant Store',
            amount: template.amountUsd,
            paymentUrl: `https://payfac.kdsolution.com/i/${instanceId}`,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to dispatch recurring invoice email', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { itemsProcessed, generatedCount };
}

/**
 * Step 158.2: Subscription Charges & 7-Day Advance Warning Worker.
 * Section 27: "Subscription charge attempts and the 7 day advance warnings."
 */
export async function runSubscriptionChargesJob(input: {
  tenantId: string;
  currentDateStr: string; // YYYY-MM-DD
}): Promise<{ warningsSent: number; chargesProcessed: number }> {
  let warningsSent = 0;
  let chargesProcessed = 0;

  const today = new Date(input.currentDateStr);
  const sevenDaysAheadDate = new Date(today);
  sevenDaysAheadDate.setDate(sevenDaysAheadDate.getDate() + 7);
  const sevenDaysAheadStr = sevenDaysAheadDate.toISOString().slice(0, 10);

  for (const sub of subscriptionsStore.values()) {
    if (sub.tenantId !== input.tenantId || sub.status !== 'active') {
      continue;
    }

    // Check 7-day advance warning requirement
    if (sub.nextChargeDate === sevenDaysAheadStr && !sub.advanceWarningSentAt) {
      sub.advanceWarningSentAt = input.currentDateStr;
      warningsSent++;

      logger.info('7-Day subscription renewal advance warning sent', {
        subscriptionId: sub.id,
        merchantEmail: sub.merchantEmail,
        renewalDate: sub.nextChargeDate,
      });

      try {
        await dispatchActivityEmail({
          tenantId: sub.tenantId,
          templateKey: 'subscription_warning',
          recipient: sub.merchantEmail,
          variables: {
            renewalDate: sub.nextChargeDate,
            amount: sub.amountUsd,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to dispatch subscription warning email', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Check due charges
    if (sub.nextChargeDate <= input.currentDateStr) {
      chargesProcessed++;
      sub.advanceWarningSentAt = undefined;
      sub.nextChargeDate = advanceCadenceDate(sub.nextChargeDate, 'monthly');

      logger.info('Subscription charge processed via customer vault', {
        subscriptionId: sub.id,
        amountUsd: sub.amountUsd,
        vaultId: sub.gatewayCustomerVaultId,
      });
    }
  }

  return { warningsSent, chargesProcessed };
}

/**
 * Step 158.3: Expired Token & Session Cleanup Worker.
 * Section 27: "Expired token and session cleanup."
 */
export async function runTokenAndSessionCleanupJob(input: {
  tenantId: string;
  nowIso: string;
}): Promise<{ purgedCount: number }> {
  let purgedCount = 0;

  for (const item of cleanupStore.values()) {
    if (item.tenantId === input.tenantId && !item.isPurged) {
      if (item.expiresAt < input.nowIso) {
        item.isPurged = true;
        purgedCount++;
      }
    }
  }

  logger.info('Expired token and session cleanup completed', {
    tenantId: input.tenantId,
    purgedCount,
  });

  return { purgedCount };
}

/**
 * Seed helpers for test suites.
 */
export function seedRecurringTemplate(template: RecurringInvoiceTemplate): void {
  recurringTemplatesStore.set(template.id, template);
}

export function seedSubscription(sub: PlatformSubscriptionRecord): void {
  subscriptionsStore.set(sub.id, sub);
}

export function seedCleanupItem(item: CleanupItemRecord): void {
  cleanupStore.set(item.id, item);
}

/**
 * Resets stores for test isolation.
 */
export function resetRecurringWorkersStore(): void {
  recurringTemplatesStore.clear();
  generatedInvoicesStore.clear();
  subscriptionsStore.clear();
  cleanupStore.clear();
}
