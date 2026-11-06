// path: lib/finance/liquidity.ts

import { z } from 'zod';
import { AbstractRepository, EntityStorageDriver, InMemoryStorageDriver } from '@/lib/db/repository';
import { AuditLogRepository } from '@/lib/db/audit';
import { Money } from '@/lib/money/money';
import { Role } from '@/lib/auth/roles';
import { logger } from '@/lib/logger';
import { BaseEntity, EntityNotFoundError, OptimisticLockError, UpdateEntityInput } from '@/types/entity';

export type LiquidityHealthStatus = 'healthy' | 'warning' | 'critical_deficit';

export interface PlatformLiquidityBufferEntity extends BaseEntity {
  readonly buffer_balance: string; // numeric(18, 4) in USD
  readonly minimum_threshold: string; // numeric(18, 4) in USD
  readonly peak_chargeback_30d: string; // numeric(18, 4) in USD
  readonly delayed_settlements_pending: string; // numeric(18, 4) in USD
  readonly reserve_allocations: Record<string, string>;
  readonly status: LiquidityHealthStatus;
  readonly last_evaluated_at: string;
  readonly last_alert_sent_at: string | null;
}

export const LiquidityBufferCreateSchema = z.object({
  buffer_balance: z.string().regex(/^\d+(\.\d{1,4})?$/),
  minimum_threshold: z.string().regex(/^\d+(\.\d{1,4})?$/),
  peak_chargeback_30d: z.string().regex(/^\d+(\.\d{1,4})?$/).default('0.0000'),
  delayed_settlements_pending: z.string().regex(/^\d+(\.\d{1,4})?$/).default('0.0000'),
  reserve_allocations: z.record(z.string(), z.string()).default({}),
  status: z.enum(['healthy', 'warning', 'critical_deficit']).default('healthy'),
  last_evaluated_at: z.string().datetime().optional(),
  last_alert_sent_at: z.string().datetime().nullable().optional().default(null),
});

export type CreateLiquidityBufferInput = {
  readonly buffer_balance: string;
  readonly minimum_threshold: string;
  readonly peak_chargeback_30d?: string | undefined;
  readonly delayed_settlements_pending?: string | undefined;
  readonly reserve_allocations?: Record<string, string> | undefined;
  readonly status?: LiquidityHealthStatus | undefined;
  readonly last_evaluated_at?: string | undefined;
  readonly last_alert_sent_at?: string | null | undefined;
  readonly id?: string | undefined;
  readonly company_id?: string | undefined;
};

export class InsufficientLiquidityBufferError extends Error {
  constructor(
    public readonly requestedUsd: string,
    public readonly availableUsd: string
  ) {
    super(
      `Insufficient platform liquidity buffer: requested $${requestedUsd}, but only $${availableUsd} is available.`
    );
    this.name = 'InsufficientLiquidityBufferError';
  }
}

const sharedLiquidityDriver = new InMemoryStorageDriver<PlatformLiquidityBufferEntity>();

/**
 * Resets the in-memory store for test isolation.
 */
export function clearPlatformLiquidityStore(): void {
  sharedLiquidityDriver.clear();
}

export const DEFAULT_PLATFORM_COMPANY_ID = '00000000-0000-7000-8000-000000000000';

/**
 * Repository for Platform Emergency Liquidity Buffer.
 */
export class PlatformLiquidityBufferRepository extends AbstractRepository<PlatformLiquidityBufferEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<PlatformLiquidityBufferEntity> | undefined;
  }) {
    super('PlatformLiquidityBuffer', {
      defaultCompanyId: options?.defaultCompanyId ?? DEFAULT_PLATFORM_COMPANY_ID,
      driver: options?.driver ?? sharedLiquidityDriver,
    });
  }

  public override async create(input: CreateLiquidityBufferInput): Promise<PlatformLiquidityBufferEntity> {
    const now = new Date().toISOString();
    return super.create({
      buffer_balance: input.buffer_balance,
      minimum_threshold: input.minimum_threshold,
      peak_chargeback_30d: input.peak_chargeback_30d ?? '0.0000',
      delayed_settlements_pending: input.delayed_settlements_pending ?? '0.0000',
      reserve_allocations: input.reserve_allocations ?? {},
      status: input.status ?? 'healthy',
      last_evaluated_at: input.last_evaluated_at ?? now,
      last_alert_sent_at: input.last_alert_sent_at ?? null,
      id: input.id,
      company_id: input.company_id,
    });
  }

  public override async update(
    id: string,
    expectedVersion: number,
    input: UpdateEntityInput<PlatformLiquidityBufferEntity>
  ): Promise<PlatformLiquidityBufferEntity> {
    const current = await this.driver.findById(id);
    if (!current) {
      throw new EntityNotFoundError(this.entityName, id);
    }
    if (current.version !== expectedVersion) {
      throw new OptimisticLockError(id, expectedVersion, current.version);
    }
    const now = new Date().toISOString();
    const updatedRecord = {
      ...current,
      ...input,
      id: current.id,
      company_id: current.company_id,
      created_at: current.created_at,
      updated_at: now,
      version: current.version + 1,
    } as PlatformLiquidityBufferEntity;
    return await this.driver.update(updatedRecord);
  }

  /**
   * Retrieves or initializes the default platform liquidity buffer.
   */
  public async getOrCreatePlatformBuffer(
    companyId: string = DEFAULT_PLATFORM_COMPANY_ID
  ): Promise<PlatformLiquidityBufferEntity> {
    const existing = await this.findMany({ includeDeleted: false });
    const buffer = existing.find((b) => b.company_id === companyId);
    if (buffer) {
      return buffer;
    }

    // Initialize platform default buffer with $250,000.00 capitalization
    return await this.create({
      company_id: companyId,
      buffer_balance: '250000.0000',
      minimum_threshold: '50000.0000',
      peak_chargeback_30d: '20000.0000',
      delayed_settlements_pending: '0.0000',
      reserve_allocations: {
        settlement_delays: '150000.0000',
        chargeback_spikes: '100000.0000',
      },
      status: 'healthy',
    });
  }
}

const defaultLiquidityRepo = new PlatformLiquidityBufferRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Step 080.2: Evaluates 30-day peak chargeback exposure and sets the minimum liquidity floor.
 * Formula: floor = max(baseFloor, (1.5 * peak30DayChargeback) + delayedSettlementsPending)
 */
export function calculateMinimumLiquidityFloor(params: {
  readonly baseFloorUsd?: string | number | undefined;
  readonly peakChargeback30dUsd: string | number;
  readonly delayedSettlementsPendingUsd?: string | number | undefined;
}): string {
  const baseFloor = Money.from(params.baseFloorUsd ?? '50000.0000');
  const peakCb = Money.from(params.peakChargeback30dUsd);
  const pendingDelayed = Money.from(params.delayedSettlementsPendingUsd ?? '0.0000');

  // 150% of peak 30-day chargeback exposure
  const cbBuffer = peakCb.multiply('1.5');
  const calculatedFloor = cbBuffer.add(pendingDelayed);

  const floor = calculatedFloor.greaterThan(baseFloor) ? calculatedFloor : baseFloor;
  return floor.toNumericString();
}

/**
 * Evaluates liquidity health status based on balance vs minimum threshold.
 * - 'healthy': balance >= 1.20 * minimumThreshold (ratio >= 1.20)
 * - 'warning': 1.00 <= ratio < 1.20
 * - 'critical_deficit': ratio < 1.00
 */
export function evaluateLiquidityHealthStatus(
  bufferBalanceUsd: string | number,
  minimumThresholdUsd: string | number
): {
  readonly status: LiquidityHealthStatus;
  readonly ratio: number;
  readonly bufferBalanceUsd: string;
  readonly minimumThresholdUsd: string;
  readonly surplusDeficitUsd: string;
  readonly healthPercentage: number;
} {
  const balance = Money.from(bufferBalanceUsd);
  const threshold = Money.from(minimumThresholdUsd);

  if (threshold.isZero()) {
    return {
      status: 'healthy',
      ratio: 999,
      bufferBalanceUsd: balance.toNumericString(),
      minimumThresholdUsd: '0.0000',
      surplusDeficitUsd: balance.toNumericString(),
      healthPercentage: 100,
    };
  }

  const ratioDecimal = balance.div(threshold);
  const ratio = ratioDecimal.value.toNumber();
  const surplusDeficit = balance.subtract(threshold);
  const healthPercentage = Math.round(ratio * 100);

  let status: LiquidityHealthStatus = 'healthy';
  if (ratio < 1.0) {
    status = 'critical_deficit';
  } else if (ratio < 1.2) {
    status = 'warning';
  }

  return {
    status,
    ratio,
    bufferBalanceUsd: balance.toNumericString(),
    minimumThresholdUsd: threshold.toNumericString(),
    surplusDeficitUsd: surplusDeficit.toNumericString(),
    healthPercentage,
  };
}

export interface DispatchedLiquidityAlert {
  readonly bufferId: string;
  readonly companyId: string;
  readonly bufferBalanceUsd: string;
  readonly minimumThresholdUsd: string;
  readonly ratio: number;
  readonly severity: 'HIGH' | 'CRITICAL';
  readonly recipientRoles: readonly Role[];
  readonly dispatchedAt: string;
  readonly message: string;
}

const liquidityAlertsQueue: DispatchedLiquidityAlert[] = [];

export function clearDispatchedLiquidityAlerts(): void {
  liquidityAlertsQueue.length = 0;
}

export function getDispatchedLiquidityAlerts(): readonly DispatchedLiquidityAlert[] {
  return [...liquidityAlertsQueue];
}

/**
 * Step 080.4: Dispatches urgent escalation alerts to CEO and Finance Ops if buffer drops below 120% of minimum threshold.
 */
export async function evaluateLiquidityHealthAndAlert(
  buffer: PlatformLiquidityBufferEntity,
  options?: {
    readonly repo?: PlatformLiquidityBufferRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<DispatchedLiquidityAlert | null> {
  const repo = options?.repo ?? defaultLiquidityRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const evaluation = evaluateLiquidityHealthStatus(buffer.buffer_balance, buffer.minimum_threshold);

  if (evaluation.ratio >= 1.2) {
    return null;
  }

  const severity: 'HIGH' | 'CRITICAL' = evaluation.ratio < 1.0 ? 'CRITICAL' : 'HIGH';
  const recipientRoles: Role[] =
    severity === 'CRITICAL'
      ? [Role.FINANCE_OPS, Role.CEO, Role.SUPER_ADMIN]
      : [Role.FINANCE_OPS, Role.CEO];

  const now = new Date().toISOString();
  const message = `[PLATFORM LIQUIDITY ALERT - ${severity}] Emergency buffer ratio at ${(evaluation.ratio * 100).toFixed(1)}% (Balance: $${evaluation.bufferBalanceUsd}, Min Threshold: $${evaluation.minimumThresholdUsd}). Minimum coverage is 120%. Immediate capitalization required.`;

  const alert: DispatchedLiquidityAlert = {
    bufferId: buffer.id,
    companyId: buffer.company_id,
    bufferBalanceUsd: evaluation.bufferBalanceUsd,
    minimumThresholdUsd: evaluation.minimumThresholdUsd,
    ratio: evaluation.ratio,
    severity,
    recipientRoles,
    dispatchedAt: now,
    message,
  };

  liquidityAlertsQueue.push(alert);

  logger.warn(message, {
    bufferId: buffer.id,
    balance: evaluation.bufferBalanceUsd,
    threshold: evaluation.minimumThresholdUsd,
    ratio: evaluation.ratio,
  });

  // Persist last_alert_sent_at and status
  await repo.update(buffer.id, buffer.version, {
    status: evaluation.status,
    last_evaluated_at: now,
    last_alert_sent_at: now,
  });

  // Audit log alert dispatch
  try {
    await auditRepo.createLog({
      company_id: buffer.company_id,
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'PLATFORM_LIQUIDITY_ALERT',
      entity_type: 'platform_liquidity_buffers',
      entity_id: buffer.id,
      payload: {
        severity,
        ratio: evaluation.ratio,
        bufferBalanceUsd: evaluation.bufferBalanceUsd,
        minimumThresholdUsd: evaluation.minimumThresholdUsd,
        recipientRoles,
      },
    });
  } catch (err) {
    logger.error('Failed to audit log platform liquidity alert', { error: err });
  }

  return alert;
}

/**
 * Step 080.3: Simulates processor settlement delay and draws down liquidity buffer
 * to cover merchant payouts without disruption.
 */
export async function absorbDelayedSettlement(
  params: {
    readonly companyId?: string | undefined;
    readonly settlementAmountUsd: string | number;
    readonly merchantId: string;
    readonly batchId: string;
    readonly actorId?: string | undefined;
    readonly notes?: string | undefined;
  },
  options?: {
    readonly repo?: PlatformLiquidityBufferRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<{
  readonly success: boolean;
  readonly buffer: PlatformLiquidityBufferEntity;
  readonly drawdownAmountUsd: string;
  readonly remainingBufferUsd: string;
  readonly status: LiquidityHealthStatus;
  readonly alert: DispatchedLiquidityAlert | null;
}> {
  const repo = options?.repo ?? defaultLiquidityRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const companyId = params.companyId ?? DEFAULT_PLATFORM_COMPANY_ID;
  const drawdownMoney = Money.from(params.settlementAmountUsd);

  const buffer = await repo.getOrCreatePlatformBuffer(companyId);
  const currentBalance = Money.from(buffer.buffer_balance);

  if (currentBalance.lessThan(drawdownMoney)) {
    throw new InsufficientLiquidityBufferError(
      drawdownMoney.toNumericString(),
      currentBalance.toNumericString()
    );
  }

  const remainingBalance = currentBalance.subtract(drawdownMoney);
  const currentPending = Money.from(buffer.delayed_settlements_pending);
  const updatedPending = currentPending.add(drawdownMoney);

  // Recalculate minimum threshold floor with newly pending delayed settlements
  const updatedFloor = calculateMinimumLiquidityFloor({
    baseFloorUsd: '50000.0000',
    peakChargeback30dUsd: buffer.peak_chargeback_30d,
    delayedSettlementsPendingUsd: updatedPending.toNumericString(),
  });

  const evaluation = evaluateLiquidityHealthStatus(
    remainingBalance.toNumericString(),
    updatedFloor
  );

  const now = new Date().toISOString();
  const updatedBuffer = await repo.update(buffer.id, buffer.version, {
    buffer_balance: remainingBalance.toNumericString(),
    delayed_settlements_pending: updatedPending.toNumericString(),
    minimum_threshold: updatedFloor,
    status: evaluation.status,
    last_evaluated_at: now,
  });

  // Audit log drawdown
  try {
    await auditRepo.createLog({
      company_id: companyId,
      actor_id: params.actorId ?? '00000000-0000-0000-0000-000000000000',
      action: 'PLATFORM_LIQUIDITY_DRAWDOWN',
      entity_type: 'platform_liquidity_buffers',
      entity_id: buffer.id,
      payload: {
        drawdownAmountUsd: drawdownMoney.toNumericString(),
        merchantId: params.merchantId,
        batchId: params.batchId,
        remainingBufferUsd: remainingBalance.toNumericString(),
        status: evaluation.status,
        notes: params.notes ?? 'Company buffer deployed to cover delayed processor settlement.',
      },
    });
  } catch (err) {
    logger.error('Failed to log liquidity drawdown audit', { error: err });
  }

  // Trigger alert if health drops below 120%
  let alert: DispatchedLiquidityAlert | null = null;
  if (evaluation.ratio < 1.2) {
    alert = await evaluateLiquidityHealthAndAlert(updatedBuffer, { repo, auditRepo });
  }

  logger.info('Platform liquidity buffer deployed for delayed settlement', {
    drawdownAmount: drawdownMoney.toNumericString(),
    remainingBuffer: remainingBalance.toNumericString(),
    status: evaluation.status,
    merchantId: params.merchantId,
  });

  return {
    success: true,
    buffer: updatedBuffer,
    drawdownAmountUsd: drawdownMoney.toNumericString(),
    remainingBufferUsd: remainingBalance.toNumericString(),
    status: evaluation.status,
    alert,
  };
}

/**
 * Injects company capitalization funds into the liquidity buffer or settles recovered processor payouts.
 */
export async function replenishLiquidityBuffer(
  params: {
    readonly companyId?: string | undefined;
    readonly amountUsd: string | number;
    readonly source: string;
    readonly recoveredDelayedSettlementUsd?: string | number | undefined;
    readonly actorId?: string | undefined;
  },
  options?: {
    readonly repo?: PlatformLiquidityBufferRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<{
  readonly success: boolean;
  readonly buffer: PlatformLiquidityBufferEntity;
  readonly newBufferBalanceUsd: string;
  readonly status: LiquidityHealthStatus;
}> {
  const repo = options?.repo ?? defaultLiquidityRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const companyId = params.companyId ?? DEFAULT_PLATFORM_COMPANY_ID;
  const depositMoney = Money.from(params.amountUsd);

  const buffer = await repo.getOrCreatePlatformBuffer(companyId);
  const currentBalance = Money.from(buffer.buffer_balance);
  const newBalance = currentBalance.add(depositMoney);

  // If delayed settlements were recovered
  let updatedPending = Money.from(buffer.delayed_settlements_pending);
  if (params.recoveredDelayedSettlementUsd) {
    const recovered = Money.from(params.recoveredDelayedSettlementUsd);
    updatedPending = updatedPending.greaterThan(recovered)
      ? updatedPending.subtract(recovered)
      : Money.zero();
  }

  const updatedFloor = calculateMinimumLiquidityFloor({
    baseFloorUsd: '50000.0000',
    peakChargeback30dUsd: buffer.peak_chargeback_30d,
    delayedSettlementsPendingUsd: updatedPending.toNumericString(),
  });

  const evaluation = evaluateLiquidityHealthStatus(newBalance.toNumericString(), updatedFloor);
  const now = new Date().toISOString();

  const updatedBuffer = await repo.update(buffer.id, buffer.version, {
    buffer_balance: newBalance.toNumericString(),
    delayed_settlements_pending: updatedPending.toNumericString(),
    minimum_threshold: updatedFloor,
    status: evaluation.status,
    last_evaluated_at: now,
  });

  try {
    await auditRepo.createLog({
      company_id: companyId,
      actor_id: params.actorId ?? '00000000-0000-0000-0000-000000000000',
      action: 'PLATFORM_LIQUIDITY_REPLENISHED',
      entity_type: 'platform_liquidity_buffers',
      entity_id: buffer.id,
      payload: {
        depositAmountUsd: depositMoney.toNumericString(),
        source: params.source,
        newBufferBalanceUsd: newBalance.toNumericString(),
        status: evaluation.status,
      },
    });
  } catch (err) {
    logger.error('Failed to log liquidity replenishment audit', { error: err });
  }

  return {
    success: true,
    buffer: updatedBuffer,
    newBufferBalanceUsd: newBalance.toNumericString(),
    status: evaluation.status,
  };
}
