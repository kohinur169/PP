// path: tests/release/go-live-gates.test.ts

import { describe, it, expect } from 'vitest';
import {
  verifyProductionEnvironmentVariables,
  verifyDatabaseMigrationsRollbackReadiness,
  verifyProviderSandboxCycles,
  verifyLiveConnectivityAndDomainSecurity,
  verifyDisasterRecoveryAndExecutiveSignoff,
  executeFullGoLiveAudit,
  REQUIRED_PRODUCTION_ENV_KEYS,
} from '@/lib/release/go-live-gates';

describe('Release and Go-Live Gates Verification Engine (Section 33 - Step 188)', () => {
  it('detects missing production environment variables and passes when all are present', () => {
    const incompleteEnv = { DATABASE_URL: 'postgres://localhost/test' };
    const failResult = verifyProductionEnvironmentVariables(incompleteEnv);
    expect(failResult.passed).toBe(false);
    expect(failResult.details).toContain('Missing required production keys');

    const completeEnv: Record<string, string> = {};
    for (const key of REQUIRED_PRODUCTION_ENV_KEYS) {
      completeEnv[key] = 'mock_secret_value_123';
    }
    const passResult = verifyProductionEnvironmentVariables(completeEnv);
    expect(passResult.passed).toBe(true);
    expect(passResult.details).toContain('All 13 required production environment variables verified');
  });

  it('verifies 100% of database migrations have matching .down.sql rollback files', () => {
    const result = verifyDatabaseMigrationsRollbackReadiness();
    expect(result.passed).toBe(true);
    expect(result.details).toContain('100% of');
    expect(result.details).toContain('validated .down.sql rollback scripts');
  });

  it('verifies all 5 contracted processors completed sandbox payment, refund, and webhook cycles', () => {
    const partialResult = verifyProviderSandboxCycles(['nmi', 'payoneer']);
    expect(partialResult.passed).toBe(false);
    expect(partialResult.details).toContain('Incomplete sandbox test cycles');

    const fullResult = verifyProviderSandboxCycles([
      'nmi',
      'payoneer',
      'rainforest',
      'stripe_connect',
      'airwallex',
    ]);
    expect(fullResult.passed).toBe(true);
    expect(fullResult.details).toContain('All 5 payment processors');
  });

  it('verifies live connectivity, transactional email, Turnstile and status page gates', () => {
    const gates = verifyLiveConnectivityAndDomainSecurity({
      liveKeysTested: true,
      emailTestReceived: true,
      turnstileDomainVerified: true,
      statusPagePublished: true,
    });

    expect(gates).toHaveLength(4);
    for (const gate of gates) {
      expect(gate.passed).toBe(true);
    }
  });

  it('verifies disaster recovery RTO, root super_admin 2FA, and compliance approvals', () => {
    const gates = verifyDisasterRecoveryAndExecutiveSignoff({
      backupRestoreRehearsed: true,
      superAdminCreatedWith2FA: true,
      independentSecurityReviewPassed: true,
      processorSchemeApprovalsConfirmed: true,
    });

    expect(gates).toHaveLength(3);
    for (const gate of gates) {
      expect(gate.passed).toBe(true);
    }
  });

  it('generates comprehensive go-live audit report with executive sign-off certificate', () => {
    const mockEnv: Record<string, string> = {};
    for (const key of REQUIRED_PRODUCTION_ENV_KEYS) {
      mockEnv[key] = 'mock_secret_value_123';
    }

    const report = executeFullGoLiveAudit({ mockEnv });
    expect(report.totalGates).toBe(10);
    expect(report.passedGates).toBe(10);
    expect(report.failedGates).toBe(0);
    expect(report.isLaunchReady).toBe(true);
    expect(report.signoffCertificate).toBeDefined();
    expect(report.signoffCertificate?.approvedByCeo).toBe(true);
    expect(report.signoffCertificate?.approvedBySuperAdmin).toBe(true);
  });
});
