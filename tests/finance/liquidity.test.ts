// path: tests/finance/liquidity.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  PlatformLiquidityBufferRepository,
  calculateMinimumLiquidityFloor,
  evaluateLiquidityHealthStatus,
  absorbDelayedSettlement,
  replenishLiquidityBuffer,
  evaluateLiquidityHealthAndAlert,
  clearPlatformLiquidityStore,
  clearDispatchedLiquidityAlerts,
  getDispatchedLiquidityAlerts,
  InsufficientLiquidityBufferError,
  DEFAULT_PLATFORM_COMPANY_ID,
} from '@/lib/finance/liquidity';
import { AuditLogRepository } from '@/lib/db/audit';
import { GET as getLiquidity, POST as postLiquidityAction } from '@/app/api/office/finance/liquidity/route';

describe('Step 080: Platform Emergency Liquidity Buffer & Company Funds Capitalization', () => {
  const financeOpsUserId = '018f6c4c-3500-7fa1-b1e2-300000000003';
  const superAdminUserId = '018f6c4c-3500-7fa1-b1e2-000000000001';
  const ceoUserId = '018f6c4c-3500-7fa1-b1e2-100000000001';
  const supportUserId = '018f6c4c-3500-7fa1-b1e2-400000000004';

  let liquidityRepo: PlatformLiquidityBufferRepository;
  let auditRepo: AuditLogRepository;
  let loggedAuditEvents: any[];

  beforeEach(() => {
    clearPlatformLiquidityStore();
    clearDispatchedLiquidityAlerts();
    liquidityRepo = new PlatformLiquidityBufferRepository();
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

  describe('Step 080.1 & Step 080.2: Minimum Floor Calculation & Health Evaluation', () => {
    it('initializes default platform buffer with healthy state', async () => {
      const buffer = await liquidityRepo.getOrCreatePlatformBuffer();
      expect(buffer.buffer_balance).toBe('250000.0000');
      expect(buffer.minimum_threshold).toBe('50000.0000');
      expect(buffer.status).toBe('healthy');
    });

    it('calculates 30-day peak chargeback exposure and minimum floor accurately', () => {
      // 1.5 * $20,000 = $30,000. Base floor $50,000 wins.
      const floorLowCb = calculateMinimumLiquidityFloor({
        baseFloorUsd: '50000.0000',
        peakChargeback30dUsd: '20000.0000',
      });
      expect(floorLowCb).toBe('50000.0000');

      // 1.5 * $60,000 = $90,000. Peak chargeback buffer wins.
      const floorHighCb = calculateMinimumLiquidityFloor({
        baseFloorUsd: '50000.0000',
        peakChargeback30dUsd: '60000.0000',
      });
      expect(floorHighCb).toBe('90000.0000');

      // With delayed settlements pending: $90,000 + $25,000 = $115,000
      const floorWithDelays = calculateMinimumLiquidityFloor({
        baseFloorUsd: '50000.0000',
        peakChargeback30dUsd: '60000.0000',
        delayedSettlementsPendingUsd: '25000.0000',
      });
      expect(floorWithDelays).toBe('115000.0000');
    });

    it('evaluates health rating ratios correctly for healthy, warning, and critical_deficit', () => {
      // 130% coverage -> healthy
      const healthyEval = evaluateLiquidityHealthStatus('65000.0000', '50000.0000');
      expect(healthyEval.status).toBe('healthy');
      expect(healthyEval.ratio).toBe(1.3);

      // 110% coverage -> warning (between 1.00 and 1.20)
      const warningEval = evaluateLiquidityHealthStatus('55000.0000', '50000.0000');
      expect(warningEval.status).toBe('warning');
      expect(warningEval.ratio).toBe(1.1);

      // 80% coverage -> critical_deficit (below 1.00)
      const deficitEval = evaluateLiquidityHealthStatus('40000.0000', '50000.0000');
      expect(deficitEval.status).toBe('critical_deficit');
      expect(deficitEval.ratio).toBe(0.8);
      expect(deficitEval.surplusDeficitUsd).toBe('-10000.0000');
    });
  });

  describe('Step 080.3: Delayed Settlement Drawdown & Quality Gate', () => {
    it('absorbs delayed processor settlement, deducts buffer, and records audit trail', async () => {
      const result = await absorbDelayedSettlement(
        {
          settlementAmountUsd: '100000.0000',
          merchantId: 'merch_018f6c4c_alpha',
          batchId: 'BATCH_20261103_PAYONEER_DELAY',
          actorId: financeOpsUserId,
          notes: 'Payoneer wire delayed due to banking holiday; platform buffer deployed.',
        },
        { repo: liquidityRepo, auditRepo }
      );

      expect(result.success).toBe(true);
      expect(result.drawdownAmountUsd).toBe('100000.0000');
      expect(result.remainingBufferUsd).toBe('150000.0000');

      // Check database state
      const buffer = await liquidityRepo.getOrCreatePlatformBuffer();
      expect(buffer.buffer_balance).toBe('150000.0000');
      expect(buffer.delayed_settlements_pending).toBe('100000.0000');

      // Check audit log
      const audit = loggedAuditEvents.find((e) => e.action === 'PLATFORM_LIQUIDITY_DRAWDOWN');
      expect(audit).toBeDefined();
      const payload = audit.payload ?? audit.metadata;
      expect(payload.merchantId).toBe('merch_018f6c4c_alpha');
      expect(payload.batchId).toBe('BATCH_20261103_PAYONEER_DELAY');
    });

    it('throws InsufficientLiquidityBufferError when drawdown exceeds available company buffer', async () => {
      await expect(
        absorbDelayedSettlement(
          {
            settlementAmountUsd: '300000.0000', // exceeds initial $250,000 buffer
            merchantId: 'merch_whale',
            batchId: 'BATCH_OVERSIZED',
          },
          { repo: liquidityRepo, auditRepo }
        )
      ).rejects.toThrow(InsufficientLiquidityBufferError);
    });
  });

  describe('Step 080.4: Escalation Alerts when Buffer Falls Below 120%', () => {
    it('dispatches HIGH alert to Finance Ops & CEO when buffer falls into warning zone (100% - 120%)', async () => {
      // Drawdown $190,000 from $250,000 leaving $60,000. Minimum threshold is $50,000. Ratio = 60,000 / 50,000 = 1.20
      // Let's create a custom buffer with $55,000 balance and $50,000 threshold (ratio 1.10)
      const warningBuffer = await liquidityRepo.create({
        company_id: '018f6c4c-3500-7fa1-b1e2-999999999999',
        buffer_balance: '55000.0000',
        minimum_threshold: '50000.0000',
        status: 'warning',
      });

      const alert = await evaluateLiquidityHealthAndAlert(warningBuffer, {
        repo: liquidityRepo,
        auditRepo,
      });

      expect(alert).not.toBeNull();
      expect(alert?.severity).toBe('HIGH');
      expect(alert?.recipientRoles).toContain(Role.FINANCE_OPS);
      expect(alert?.recipientRoles).toContain(Role.CEO);
      expect(alert?.recipientRoles).not.toContain(Role.SUPER_ADMIN);

      const dispatched = getDispatchedLiquidityAlerts();
      expect(dispatched).toHaveLength(1);

      // Verify audit log
      const audit = loggedAuditEvents.find((e) => e.action === 'PLATFORM_LIQUIDITY_ALERT');
      expect(audit).toBeDefined();
    });

    it('escalates to CRITICAL alert including Super Admin when buffer falls into deficit (<100%)', async () => {
      const deficitBuffer = await liquidityRepo.create({
        company_id: '018f6c4c-3500-7fa1-b1e2-888888888888',
        buffer_balance: '35000.0000',
        minimum_threshold: '50000.0000',
        status: 'critical_deficit',
      });

      const alert = await evaluateLiquidityHealthAndAlert(deficitBuffer, {
        repo: liquidityRepo,
        auditRepo,
      });

      expect(alert).not.toBeNull();
      expect(alert?.severity).toBe('CRITICAL');
      expect(alert?.recipientRoles).toContain(Role.FINANCE_OPS);
      expect(alert?.recipientRoles).toContain(Role.CEO);
      expect(alert?.recipientRoles).toContain(Role.SUPER_ADMIN);
    });

    it('does not dispatch alert when buffer is healthy (>=120%)', async () => {
      const healthyBuffer = await liquidityRepo.getOrCreatePlatformBuffer();
      const alert = await evaluateLiquidityHealthAndAlert(healthyBuffer, {
        repo: liquidityRepo,
        auditRepo,
      });
      expect(alert).toBeNull();
      expect(getDispatchedLiquidityAlerts()).toHaveLength(0);
    });
  });

  describe('Step 080.5: Capitalization / Replenishment', () => {
    it('replenishes buffer with corporate treasury funds and updates status', async () => {
      // First drawdown $100,000
      await absorbDelayedSettlement(
        {
          settlementAmountUsd: '100000.0000',
          merchantId: 'merch_test',
          batchId: 'BATCH_TEST',
        },
        { repo: liquidityRepo, auditRepo }
      );

      // Now replenish $150,000 and recover $100,000 delayed settlement
      const replenished = await replenishLiquidityBuffer(
        {
          amountUsd: '150000.0000',
          source: 'JPMorgan Chase Corporate Treasury Capitalization',
          recoveredDelayedSettlementUsd: '100000.0000',
          actorId: financeOpsUserId,
        },
        { repo: liquidityRepo, auditRepo }
      );

      expect(replenished.success).toBe(true);
      expect(replenished.newBufferBalanceUsd).toBe('300000.0000');
      expect(replenished.status).toBe('healthy');

      const audit = loggedAuditEvents.find((e) => e.action === 'PLATFORM_LIQUIDITY_REPLENISHED');
      expect(audit).toBeDefined();
    });
  });

  describe('HTTP API Route Integration: /api/office/finance/liquidity', () => {
    it('allows Finance Ops and CEO to view liquidity health via GET', async () => {
      const req = new NextRequest('http://localhost/api/office/finance/liquidity', {
        headers: {
          'x-user-role': Role.FINANCE_OPS,
          'x-user-id': financeOpsUserId,
        },
      });

      const res = await getLiquidity(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.liquidity.bufferBalanceUsd).toBe('250000.0000');
      expect(data.liquidity.status).toBe('healthy');
      expect(data.liquidity.ratio).toBeGreaterThanOrEqual(1.2);
    });

    it('rejects unauthorized roles (support, blogger, client) with HTTP 403', async () => {
      const req = new NextRequest('http://localhost/api/office/finance/liquidity', {
        headers: {
          'x-user-role': Role.SUPPORT,
          'x-user-id': supportUserId,
        },
      });

      const res = await getLiquidity(req);
      expect(res.status).toBe(403);
    });

    it('executes drawdown simulation via POST action "drawdown"', async () => {
      const req = new NextRequest('http://localhost/api/office/finance/liquidity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.FINANCE_OPS,
          'x-user-id': financeOpsUserId,
        },
        body: JSON.stringify({
          action: 'drawdown',
          settlementAmountUsd: '50000.0000',
          merchantId: 'merch_api_test',
          batchId: 'BATCH_API_DELAY',
        }),
      });

      const res = await postLiquidityAction(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.remainingBufferUsd).toBe('200000.0000');
    });

    it('executes replenishment via POST action "replenish"', async () => {
      const req = new NextRequest('http://localhost/api/office/finance/liquidity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.FINANCE_OPS,
          'x-user-id': financeOpsUserId,
        },
        body: JSON.stringify({
          action: 'replenish',
          amountUsd: '75000.0000',
          source: 'Series A Capitalization Allocation',
        }),
      });

      const res = await postLiquidityAction(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.newBufferBalanceUsd).toBeDefined();
    });
  });
});
