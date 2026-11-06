// path: tests/ledger/fiduciary-segregation.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHART_OF_ACCOUNTS,
  AccountCategory,
  postJournalEntry,
  getAccountBalance,
  runDailyFiduciaryAudit,
  resetFiduciaryLedgerForTest,
  getDispatchedFiduciaryAlerts,
  FiduciaryComminglingError,
  DoubleEntryBalanceError,
} from '@/lib/ledger/fiduciary';
import { Role } from '@/lib/auth/roles';
import { AuditLogRepository } from '@/lib/db/audit';

describe('Step 077: Client & Merchant Funds Fiduciary Segregation Architecture', () => {
  let auditRepo: AuditLogRepository;
  let loggedAuditEvents: any[];

  beforeEach(() => {
    resetFiduciaryLedgerForTest();
    loggedAuditEvents = [];

    auditRepo = {
      createLog: async (input: any) => {
        loggedAuditEvents.push(input);
        return {
          id: `audit_${Date.now()}`,
          ...input,
          created_at: new Date().toISOString(),
        } as any;
      },
    } as unknown as AuditLogRepository;
  });

  describe('Step 077.1: Dedicated Chart of Accounts Structure', () => {
    it('strictly separates Fiduciary Settlement Assets (Account 1100) from Corporate Cash (Account 1000)', () => {
      // 1. Verify Fiduciary Accounts
      const acct1100 = CHART_OF_ACCOUNTS['1100'];
      expect(acct1100).toBeDefined();
      expect(acct1100.isFiduciary).toBe(true);
      expect(acct1100.category).toBe(AccountCategory.FIDUCIARY_ASSET);
      expect(acct1100.normalBalance).toBe('DEBIT');

      const acct1110 = CHART_OF_ACCOUNTS['1110'];
      expect(acct1110.isFiduciary).toBe(true);
      expect(acct1110.category).toBe(AccountCategory.FIDUCIARY_ASSET);

      const acct2100 = CHART_OF_ACCOUNTS['2100'];
      expect(acct2100.isFiduciary).toBe(true);
      expect(acct2100.category).toBe(AccountCategory.FIDUCIARY_LIABILITY);
      expect(acct2100.normalBalance).toBe('CREDIT');

      const acct2110 = CHART_OF_ACCOUNTS['2110'];
      expect(acct2110.isFiduciary).toBe(true);
      expect(acct2110.category).toBe(AccountCategory.FIDUCIARY_LIABILITY);

      // 2. Verify Corporate Operational Accounts
      const acct1000 = CHART_OF_ACCOUNTS['1000'];
      expect(acct1000).toBeDefined();
      expect(acct1000.isFiduciary).toBe(false);
      expect(acct1000.category).toBe(AccountCategory.CORPORATE_ASSET);

      const acct4000 = CHART_OF_ACCOUNTS['4000'];
      expect(acct4000.isFiduciary).toBe(false);
      expect(acct4000.category).toBe(AccountCategory.CORPORATE_REVENUE);

      const acct6000 = CHART_OF_ACCOUNTS['6000'];
      expect(acct6000.isFiduciary).toBe(false);
      expect(acct6000.category).toBe(AccountCategory.CORPORATE_EXPENSE);
    });
  });

  describe('Step 077.2: Ledger Posting Constraints & Anti-Commingling Enforcement', () => {
    it('enforces exact double-entry mathematical balance (Debits = Credits)', () => {
      expect(() => {
        postJournalEntry({
          transactionReference: 'TX_IMBALANCE_001',
          memo: 'Unbalanced journal entry attempt',
          lines: [
            { accountCode: '1100', debit: '1000.0000' },
            { accountCode: '2100', credit: '990.0000' }, // Imbalance of 10.0000
          ],
        });
      }).toThrow(DoubleEntryBalanceError);
    });

    it('prohibits direct commingling of Fiduciary Assets (1100) into Corporate Operational Cash (1000)', () => {
      expect(() => {
        postJournalEntry({
          transactionReference: 'TX_COMMINGLE_001',
          memo: 'Unauthorized commingling of client custodial funds to corporate treasury',
          lines: [
            { accountCode: '1100', credit: '5000.0000' }, // Draining custodial assets
            { accountCode: '1000', debit: '5000.0000' },  // Crediting corporate cash
          ],
        });
      }).toThrow(FiduciaryComminglingError);
    });

    it('prohibits using Fiduciary Assets (1100) to directly pay Corporate Operating Expenses (6000)', () => {
      expect(() => {
        postJournalEntry({
          transactionReference: 'TX_COMMINGLE_002',
          memo: 'Paying platform cloud hosting from custodial settlement account',
          lines: [
            { accountCode: '1100', credit: '2500.0000' }, // Draining custodial assets
            { accountCode: '6000', debit: '2500.0000' },  // Operating expenses
          ],
        });
      }).toThrow(FiduciaryComminglingError);
    });

    it('allows compliant settlement journal entry strictly balancing fiduciary assets and liabilities', () => {
      const entry = postJournalEntry({
        transactionReference: 'BATCH_SETTLEMENT_20261104_01',
        memo: 'Gross batch settlement from acquiring processor',
        lines: [
          { accountCode: '1100', debit: '25000.0000', memo: 'Custodial settlement deposit received' },
          { accountCode: '2100', credit: '23750.0000', memo: 'Net merchant settlement payable' },
          { accountCode: '2110', credit: '1250.0000', memo: '5% Rolling risk reserve withheld' },
        ],
      });

      expect(entry).toBeDefined();
      expect(getAccountBalance('1100').toNumericString()).toBe('25000.0000');
      expect(getAccountBalance('2100').toNumericString()).toBe('23750.0000');
      expect(getAccountBalance('2110').toNumericString()).toBe('1250.0000');
    });
  });

  describe('Step 077.3 & Step 077.4: Daily Fiduciary Segregation Audit & Deficit Alerts', () => {
    it('verifies 100% mathematical match between custodial assets and merchant liabilities in compliant state', () => {
      // Seed balanced fiduciary settlement: $50,000 assets vs $50,000 liabilities ($47,500 payable + $2,500 reserve)
      postJournalEntry({
        transactionReference: 'SETTLE_001',
        memo: 'Initial custodial settlement intake',
        lines: [
          { accountCode: '1100', debit: '47500.0000' },
          { accountCode: '1110', debit: '2500.0000' },
          { accountCode: '2100', credit: '47500.0000' },
          { accountCode: '2110', credit: '2500.0000' },
        ],
      });

      const report = runDailyFiduciaryAudit({ auditRepo });

      expect(report.status).toBe('COMPLIANT');
      expect(report.isFullyCovered).toBe(true);
      expect(report.fiduciaryCustodialAssets.toNumericString()).toBe('50000.0000');
      expect(report.totalMerchantLiabilities.toNumericString()).toBe('50000.0000');
      expect(report.surplusDeficit.toNumericString()).toBe('0.0000');
      expect(report.coverageRatio).toBe(1.0);
      expect(report.alertsDispatched).toHaveLength(0);
      expect(getDispatchedFiduciaryAlerts()).toHaveLength(0);
    });

    it('raises CRITICAL compliance alert to CEO, Super Admin & Compliance Officer when custodial assets dip below merchant liabilities', () => {
      postJournalEntry({
        transactionReference: 'FID_SETTLE_INIT',
        memo: 'Custodial settlement deposit',
        lines: [
          { accountCode: '1100', debit: '80000.0000' },
          { accountCode: '2100', credit: '100000.0000' },
          { accountCode: '5000', debit: '20000.0000' }, // Processor cost / receivable leg
        ],
      });

      // Total Fiduciary Custodial Assets: 1100 = $80,000
      // Total Merchant Liabilities: 2100 = $100,000
      // Shortfall = -$20,000.0000 (Coverage = 80%)
      const report = runDailyFiduciaryAudit({ auditRepo });

      expect(report.status).toBe('DEFICIT_BREACH');
      expect(report.isFullyCovered).toBe(false);
      expect(report.fiduciaryCustodialAssets.toNumericString()).toBe('80000.0000');
      expect(report.totalMerchantLiabilities.toNumericString()).toBe('100000.0000');
      expect(report.surplusDeficit.toNumericString()).toBe('-20000.0000');
      expect(report.coverageRatio).toBe(0.8);
      expect(report.alertsDispatched).toContain('CRITICAL_DEFICIT_BREACH_ALERT_DISPATCHED');

      // Verify dispatched alert details
      const alerts = getDispatchedFiduciaryAlerts();
      expect(alerts).toHaveLength(1);
      const alert = alerts[0];
      expect(alert.severity).toBe('CRITICAL');
      expect(alert.recipientRoles).toContain(Role.CEO);
      expect(alert.recipientRoles).toContain(Role.SUPER_ADMIN);
      expect(alert.recipientRoles).toContain(Role.COMPLIANCE_KYC);
      expect(alert.message).toContain('Fiduciary liability breach detected');
      expect(alert.message).toContain('$-20,000.00');
      expect(alert.message).toContain('80.00%');

      // Verify audit repository entry
      expect(loggedAuditEvents).toHaveLength(1);
      const auditLog = loggedAuditEvents[0];
      expect(auditLog.action).toBe('FIDUCIARY_DEFICIT_BREACH_ALERT');
      expect(auditLog.payload.deficitUsd).toBe('$-20,000.00');
    });
  });
});
