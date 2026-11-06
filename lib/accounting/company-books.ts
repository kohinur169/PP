// path: lib/accounting/company-books.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { Money } from '@/lib/money/money';

export type CorporateEntryType = 'revenue' | 'expense' | 'tax';

export interface CompanyAccountingEntryRecord {
  id: string;
  tenantId: string;
  category: 'platform_fees' | 'subscription_fees' | 'dispute_fees' | 'processor_interchange' | 'operating_overhead';
  entryType: CorporateEntryType;
  amountUsd: string;
  description: string;
  vendorOrSource: string;
  referenceId?: string | undefined;
  createdBy: string;
  createdAt: string;
}

export interface ProfitAndLossReport {
  totalRevenueUsd: string;
  totalExpensesUsd: string;
  netOperatingIncomeUsd: string;
  entriesCount: number;
  generatedAt: string;
}

const accountingStore = new Map<string, CompanyAccountingEntryRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 238: Strict RBAC check enforcing corporate accounting access strictly to Super Admin, CEO, and Finance Ops.
 */
export function assertAccountingRbacAccess(userRole: string): void {
  const allowed = ['super_admin', 'ceo', 'finance_ops'];
  if (!allowed.includes(userRole)) {
    throw new Error(`Unauthorized: Role '${userRole}' is strictly prohibited from accessing internal corporate accounting books.`);
  }
}

/**
 * Step 237.2 & 237.3: Records internal platform corporate income or expense.
 */
export async function recordCorporateAccountingEntry(input: {
  tenantId: string;
  category: CompanyAccountingEntryRecord['category'];
  entryType: CorporateEntryType;
  amountUsd: string | number;
  description: string;
  vendorOrSource: string;
  referenceId?: string | undefined;
  userRole: string;
  userId: string;
}): Promise<CompanyAccountingEntryRecord> {
  assertAccountingRbacAccess(input.userRole);

  const id = generateUuidV7();
  const amountStr = Number(input.amountUsd).toFixed(4);
  const now = new Date().toISOString();

  const record: CompanyAccountingEntryRecord = {
    id,
    tenantId: input.tenantId,
    category: input.category,
    entryType: input.entryType,
    amountUsd: amountStr,
    description: input.description,
    vendorOrSource: input.vendorOrSource,
    referenceId: input.referenceId,
    createdBy: input.userId,
    createdAt: now,
  };

  accountingStore.set(id, record);

  logger.info('Corporate accounting entry recorded', {
    entryId: id,
    category: input.category,
    type: input.entryType,
    amountUsd: amountStr,
    vendor: input.vendorOrSource,
  });

  try {
    await auditRepo.append({
      actor_id: input.userId,
      action: 'CORPORATE_ACCOUNTING_ENTRY_RECORDED',
      entity_type: 'company_accounting',
      entity_id: id,
      payload: {
        category: input.category,
        entryType: input.entryType,
        amountUsd: amountStr,
        vendor: input.vendorOrSource,
      },
    });
  } catch {}

  return record;
}

/**
 * Step 237.4: Generates corporate Profit & Loss (P&L) statement.
 */
export function generateCorporateProfitAndLoss(tenantId: string, userRole: string): ProfitAndLossReport {
  assertAccountingRbacAccess(userRole);

  let totalRev = Money.from('0.0000');
  let totalExp = Money.from('0.0000');
  let count = 0;

  for (const entry of accountingStore.values()) {
    if (entry.tenantId === tenantId) {
      count++;
      const money = Money.from(entry.amountUsd);
      if (entry.entryType === 'revenue') {
        totalRev = totalRev.add(money);
      } else {
        totalExp = totalExp.add(money);
      }
    }
  }

  const netIncome = totalRev.subtract(totalExp);

  return {
    totalRevenueUsd: totalRev.toNumericString(),
    totalExpensesUsd: totalExp.toNumericString(),
    netOperatingIncomeUsd: netIncome.toNumericString(),
    entriesCount: count,
    generatedAt: new Date().toISOString(),
  };
}

export function resetAccountingStore(): void {
  accountingStore.clear();
}
