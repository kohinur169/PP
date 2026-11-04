// path: lib/ledger/fiduciary.ts

import Decimal from 'decimal.js';
import { Money } from '@/lib/money/money';
import { Role } from '@/lib/auth/roles';
import { logger } from '@/lib/logger';
import { AuditLogRepository } from '@/lib/db/audit';

/**
 * Standard Chart of Accounts categorization for Fiduciary vs Corporate Segregation.
 */
export enum AccountCategory {
  FIDUCIARY_ASSET = 'FIDUCIARY_ASSET',
  FIDUCIARY_LIABILITY = 'FIDUCIARY_LIABILITY',
  CORPORATE_ASSET = 'CORPORATE_ASSET',
  CORPORATE_LIABILITY = 'CORPORATE_LIABILITY',
  CORPORATE_REVENUE = 'CORPORATE_REVENUE',
  CORPORATE_EXPENSE = 'CORPORATE_EXPENSE',
}

/**
 * Enterprise Chart of Accounts (COA) numbers and definitions.
 */
export interface AccountDefinition {
  readonly code: string;
  readonly name: string;
  readonly category: AccountCategory;
  readonly isFiduciary: boolean;
  readonly normalBalance: 'DEBIT' | 'CREDIT';
  readonly description: string;
}

export const CHART_OF_ACCOUNTS: Readonly<Record<string, AccountDefinition>> = {
  // --- FIDUCIARY ASSET ACCOUNTS (Sub-merchant & Client Settlement Custody) ---
  '1100': {
    code: '1100',
    name: 'Fiduciary Settlement Assets',
    category: AccountCategory.FIDUCIARY_ASSET,
    isFiduciary: true,
    normalBalance: 'DEBIT',
    description: 'Segregated custodial bank account holding sub-merchant transaction proceeds awaiting payout.',
  },
  '1110': {
    code: '1110',
    name: 'Fiduciary Rolling Reserves',
    category: AccountCategory.FIDUCIARY_ASSET,
    isFiduciary: true,
    normalBalance: 'DEBIT',
    description: 'Segregated custodial bank account holding withheld rolling risk reserves.',
  },

  // --- FIDUCIARY LIABILITY ACCOUNTS (Owed to Sub-merchants & Clients) ---
  '2100': {
    code: '2100',
    name: 'Merchant Settlement Liabilities',
    category: AccountCategory.FIDUCIARY_LIABILITY,
    isFiduciary: true,
    normalBalance: 'CREDIT',
    description: 'Unpaid transaction settlement balances strictly owed to sub-merchants.',
  },
  '2110': {
    code: '2110',
    name: 'Merchant Reserve Liabilities',
    category: AccountCategory.FIDUCIARY_LIABILITY,
    isFiduciary: true,
    normalBalance: 'CREDIT',
    description: 'Withheld rolling reserves owed to sub-merchants upon completion of holding period.',
  },

  // --- CORPORATE PLATFORM ACCOUNTS (Platform Operational Funds) ---
  '1000': {
    code: '1000',
    name: 'Corporate Operational Cash',
    category: AccountCategory.CORPORATE_ASSET,
    isFiduciary: false,
    normalBalance: 'DEBIT',
    description: 'General operating bank account for platform corporate cash, payroll, and retained earnings.',
  },
  '4000': {
    code: '4000',
    name: 'Platform Processing Fee Revenue',
    category: AccountCategory.CORPORATE_REVENUE,
    isFiduciary: false,
    normalBalance: 'CREDIT',
    description: 'Earned fee revenue from payment facilitation processing markups.',
  },
  '5000': {
    code: '5000',
    name: 'Processor Cost of Sales',
    category: AccountCategory.CORPORATE_EXPENSE,
    isFiduciary: false,
    normalBalance: 'DEBIT',
    description: 'Direct interchange and payment processor gateway fees incurred per transaction.',
  },
  '6000': {
    code: '6000',
    name: 'Platform Operating Expenses',
    category: AccountCategory.CORPORATE_EXPENSE,
    isFiduciary: false,
    normalBalance: 'DEBIT',
    description: 'Platform corporate overhead including cloud infrastructure, compliance tools, and office expenses.',
  },
};

/**
 * Individual leg of a double-entry journal entry.
 */
export interface JournalEntryLine {
  readonly accountCode: string;
  readonly debit: Money;
  readonly credit: Money;
  readonly memo?: string | undefined;
}

/**
 * Complete double-entry balanced journal entry.
 */
export interface JournalEntry {
  readonly id: string;
  readonly transactionReference: string;
  readonly lines: readonly JournalEntryLine[];
  readonly postedAt: string;
  readonly memo: string;
  readonly isFeeTransfer?: boolean | undefined;
}

export interface PostJournalEntryInput {
  readonly transactionReference: string;
  readonly lines: readonly {
    readonly accountCode: string;
    readonly debit?: string | number | Money | undefined;
    readonly credit?: string | number | Money | undefined;
    readonly memo?: string | undefined;
  }[];
  readonly memo: string;
  readonly isFeeTransfer?: boolean | undefined;
}

/**
 * Error raised when a transaction breaches fiduciary segregation by commingling
 * client/merchant custodial funds with corporate accounts.
 */
export class FiduciaryComminglingError extends Error {
  constructor(message: string) {
    super(`Fiduciary Commingling Violation: ${message}`);
    this.name = 'FiduciaryComminglingError';
  }
}

/**
 * Error raised when double-entry debits do not equal credits.
 */
export class DoubleEntryBalanceError extends Error {
  constructor(totalDebit: string, totalCredit: string) {
    super(
      `Double-Entry Imbalance: Debits (${totalDebit}) must equal Credits (${totalCredit}) exactly.`
    );
    this.name = 'DoubleEntryBalanceError';
  }
}

/**
 * Fiduciary Segregation Compliance Audit Report.
 */
export interface FiduciaryAuditReport {
  readonly auditTimestamp: string;
  readonly status: 'COMPLIANT' | 'DEFICIT_BREACH';
  readonly fiduciaryCustodialAssets: Money; // Accounts 1100 + 1110
  readonly totalMerchantLiabilities: Money; // Accounts 2100 + 2110
  readonly surplusDeficit: Money; // Assets - Liabilities
  readonly coverageRatio: number; // Assets / Liabilities
  readonly isFullyCovered: boolean;
  readonly alertsDispatched: readonly string[];
}

export interface FiduciaryAlert {
  readonly id: string;
  readonly severity: 'CRITICAL';
  readonly timestamp: string;
  readonly recipientRoles: readonly Role[];
  readonly message: string;
  readonly auditReport: FiduciaryAuditReport;
}

// In-memory ledger storage for isolated testing and ledger state management
const ledgerEntries: JournalEntry[] = [];
const fiduciaryAlertsQueue: FiduciaryAlert[] = [];

/**
 * Resets the in-memory ledger and alerts for test isolation.
 */
export function resetFiduciaryLedgerForTest(): void {
  ledgerEntries.length = 0;
  fiduciaryAlertsQueue.length = 0;
}

/**
 * Retrieves all posted journal entries.
 */
export function getAllJournalEntries(): readonly JournalEntry[] {
  return [...ledgerEntries];
}

/**
 * Retrieves all dispatched fiduciary compliance alerts.
 */
export function getDispatchedFiduciaryAlerts(): readonly FiduciaryAlert[] {
  return [...fiduciaryAlertsQueue];
}

/**
 * Calculates current net balance for a specific account.
 */
export function getAccountBalance(accountCode: string): Money {
  const def = CHART_OF_ACCOUNTS[accountCode];
  if (!def) {
    throw new Error(`Unknown account code "${accountCode}".`);
  }

  let balance = new Decimal(0);

  for (const entry of ledgerEntries) {
    for (const line of entry.lines) {
      if (line.accountCode === accountCode) {
        if (def.normalBalance === 'DEBIT') {
          balance = balance.plus(line.debit.value).minus(line.credit.value);
        } else {
          balance = balance.plus(line.credit.value).minus(line.debit.value);
        }
      }
    }
  }

  return new Money(balance);
}

/**
 * Step 077.2: Enforces ledger posting constraints preventing commingling
 * of platform operational fees with held merchant settlement balances.
 */
export function validateFiduciaryPostingConstraints(
  lines: readonly JournalEntryLine[],
  isFeeTransfer = false
): void {
  let hasFiduciaryAsset = false;
  let hasCorporateExpenseOrCash = false;

  for (const line of lines) {
    const account = CHART_OF_ACCOUNTS[line.accountCode];
    if (!account) {
      throw new Error(`Invalid account code "${line.accountCode}" in journal entry.`);
    }

    if (
      account.code === '1100' ||
      account.code === '1110'
    ) {
      hasFiduciaryAsset = true;
    }

    // Direct corporate spending accounts (Corporate Cash 1000 or Operating Expenses 6000)
    if (account.code === '1000' || account.code === '6000') {
      hasCorporateExpenseOrCash = true;
    }
  }

  // Fiduciary custodial funds must NEVER be directly drained into corporate operating cash
  // or used to directly pay corporate operating expenses in a single transaction.
  if (hasFiduciaryAsset && hasCorporateExpenseOrCash && !isFeeTransfer) {
    throw new FiduciaryComminglingError(
      'Direct commingling of Fiduciary Settlement Assets (Account 1100/1110) with Corporate Operating Cash (Account 1000) or Expenses (Account 6000) is strictly prohibited by regulatory fiduciary duties.'
    );
  }
}

/**
 * Posts a double-entry balanced journal entry with fiduciary commingling validation.
 */
export function postJournalEntry(input: PostJournalEntryInput): JournalEntry {
  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);

  const parsedLines: JournalEntryLine[] = input.lines.map((l) => {
    const debit = new Money(l.debit ?? 0);
    const credit = new Money(l.credit ?? 0);

    totalDebit = totalDebit.plus(debit.value);
    totalCredit = totalCredit.plus(credit.value);

    return {
      accountCode: l.accountCode,
      debit,
      credit,
      memo: l.memo,
    };
  });

  // Step 077.2: Rule 1 - Enforce exact double-entry balance
  if (!totalDebit.equals(totalCredit)) {
    throw new DoubleEntryBalanceError(
      totalDebit.toFixed(4),
      totalCredit.toFixed(4)
    );
  }

  // Step 077.2: Rule 2 & Rule 3 - Enforce anti-commingling constraints
  validateFiduciaryPostingConstraints(parsedLines, input.isFeeTransfer);

  const entry: JournalEntry = {
    id: `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    transactionReference: input.transactionReference,
    lines: parsedLines,
    postedAt: new Date().toISOString(),
    memo: input.memo,
    isFeeTransfer: input.isFeeTransfer,
  };

  ledgerEntries.push(entry);
  return entry;
}

/**
 * Step 077.3: Executes daily fiduciary segregation audit check verifying
 * Bank Settlement Account balance equals or exceeds total Merchant Liabilities.
 */
export function runDailyFiduciaryAudit(options?: {
  readonly auditRepo?: AuditLogRepository | undefined;
}): FiduciaryAuditReport {
  const account1100 = getAccountBalance('1100'); // Fiduciary Settlement Assets
  const account1110 = getAccountBalance('1110'); // Fiduciary Rolling Reserves
  const account2100 = getAccountBalance('2100'); // Merchant Settlement Liabilities
  const account2110 = getAccountBalance('2110'); // Merchant Reserve Liabilities

  const custodialAssets = account1100.add(account1110);
  const merchantLiabilities = account2100.add(account2110);
  const surplusDeficit = custodialAssets.subtract(merchantLiabilities);

  const liabilitiesDecimal = merchantLiabilities.value;
  const assetsDecimal = custodialAssets.value;

  let coverageRatio = 1.0;
  if (!liabilitiesDecimal.isZero()) {
    coverageRatio = assetsDecimal.dividedBy(liabilitiesDecimal).toNumber();
  } else if (assetsDecimal.isNegative()) {
    coverageRatio = 0.0;
  }

  const isFullyCovered = assetsDecimal.greaterThanOrEqualTo(liabilitiesDecimal);
  const status: 'COMPLIANT' | 'DEFICIT_BREACH' = isFullyCovered
    ? 'COMPLIANT'
    : 'DEFICIT_BREACH';

  const alertsDispatched: string[] = [];
  const auditTimestamp = new Date().toISOString();

  const report: FiduciaryAuditReport = {
    auditTimestamp,
    status,
    fiduciaryCustodialAssets: custodialAssets,
    totalMerchantLiabilities: merchantLiabilities,
    surplusDeficit,
    coverageRatio,
    isFullyCovered,
    alertsDispatched,
  };

  // Step 077.4: Dispatches compliance alert if platform funds dip below fiduciary liability coverage
  if (!isFullyCovered) {
    raiseFiduciaryComplianceAlert(report, options?.auditRepo);
    alertsDispatched.push('CRITICAL_DEFICIT_BREACH_ALERT_DISPATCHED');
  }

  logger.info('Daily fiduciary segregation audit executed', {
    status,
    custodialAssets: custodialAssets.toDisplayString(),
    merchantLiabilities: merchantLiabilities.toDisplayString(),
    surplusDeficit: surplusDeficit.toDisplayString(),
    coverageRatio: `${(coverageRatio * 100).toFixed(2)}%`,
  });

  return report;
}

/**
 * Step 077.4: Dispatches critical compliance alert to CEO, Super Admin, and Compliance Officer
 * whenever fiduciary assets fail to 100% cover sub-merchant liabilities.
 */
export function raiseFiduciaryComplianceAlert(
  report: FiduciaryAuditReport,
  auditRepo?: AuditLogRepository
): FiduciaryAlert {
  const alertId = `fid_alert_${Date.now()}`;
  const recipientRoles: Role[] = [Role.CEO, Role.SUPER_ADMIN, Role.COMPLIANCE_KYC];
  const message = `[CRITICAL COMPLIANCE ALERT] Fiduciary liability breach detected. Custodial assets (${report.fiduciaryCustodialAssets.toDisplayString()}) are below merchant liabilities (${report.totalMerchantLiabilities.toDisplayString()}). Deficit: ${report.surplusDeficit.toDisplayString()} (Coverage: ${(report.coverageRatio * 100).toFixed(2)}%). Immediate treasury intervention required.`;

  const alert: FiduciaryAlert = {
    id: alertId,
    severity: 'CRITICAL',
    timestamp: new Date().toISOString(),
    recipientRoles,
    message,
    auditReport: report,
  };

  fiduciaryAlertsQueue.push(alert);

  logger.error('CRITICAL COMPLIANCE ALERT: Fiduciary deficit breach detected', {
    alertId,
    deficitUsd: report.surplusDeficit.toDisplayString(),
    coverageRatio: report.coverageRatio,
    recipients: recipientRoles,
  });

  if (auditRepo) {
    try {
      auditRepo.createLog({
        company_id: '00000000-0000-7000-8000-000000000000',
        actor_id: '00000000-0000-0000-0000-000000000000', // System automated audit
        action: 'FIDUCIARY_DEFICIT_BREACH_ALERT',
        entity_type: 'ledger_fiduciary_audit',
        entity_id: alertId,
        payload: {
          deficitUsd: report.surplusDeficit.toDisplayString(),
          custodialAssets: report.fiduciaryCustodialAssets.toDisplayString(),
          merchantLiabilities: report.totalMerchantLiabilities.toDisplayString(),
          coverageRatio: report.coverageRatio,
          timestamp: alert.timestamp,
        },
      });
    } catch (auditErr) {
      logger.error('Failed to log fiduciary audit alert to audit repository', {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }
  }

  return alert;
}
