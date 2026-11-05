// path: lib/processors/circuit-breaker.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { PaymentProcessorId } from '@/lib/processors/routing-waterfall';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerStateRecord {
  id: string;
  tenantId: string;
  processorId: PaymentProcessorId;
  state: CircuitState;
  consecutiveFailures: number;
  failureRatePct: number;
  lastFailureAt?: string | undefined;
  trippedAt?: string | undefined;
  cooldownSeconds: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  totalVolumeUsd: number;
  updatedAt: string;
}

const breakersStore = new Map<string, CircuitBreakerStateRecord>();
const auditRepo = new AuditLogRepository();

export const CONSECUTIVE_FAILURE_THRESHOLD = 5;
export const FAILURE_RATE_THRESHOLD_PCT = 50.0;
export const DEFAULT_COOLDOWN_SECONDS = 60;

function getStoreKey(tenantId: string, processorId: PaymentProcessorId): string {
  return `${tenantId}:${processorId}`;
}

function getOrCreateBreaker(
  tenantId: string,
  processorId: PaymentProcessorId
): CircuitBreakerStateRecord {
  const key = getStoreKey(tenantId, processorId);
  let rec = breakersStore.get(key);
  if (!rec) {
    rec = {
      id: generateUuidV7(),
      tenantId,
      processorId,
      state: 'closed',
      consecutiveFailures: 0,
      failureRatePct: 0.0,
      cooldownSeconds: DEFAULT_COOLDOWN_SECONDS,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatencyMs: 0.0,
      totalVolumeUsd: 0.0,
      updatedAt: new Date().toISOString(),
    };
    breakersStore.set(key, rec);
  }
  return rec;
}

/**
 * Step 179.1: Retrieves processor circuit breaker state, evaluating cooldown transition to 'half_open'.
 * Section 30: "Circuit breaker pattern: automatic processor health checks and failure rate tracking..."
 */
export function getProcessorHealthState(
  tenantId: string,
  processorId: PaymentProcessorId
): CircuitBreakerStateRecord {
  const breaker = getOrCreateBreaker(tenantId, processorId);

  // If circuit is 'open', check if cooldown timer has elapsed
  if (breaker.state === 'open' && breaker.trippedAt) {
    const elapsedSeconds = (Date.now() - new Date(breaker.trippedAt).getTime()) / 1000;
    if (elapsedSeconds >= breaker.cooldownSeconds) {
      breaker.state = 'half_open';
      breaker.updatedAt = new Date().toISOString();
      logger.info('Processor circuit breaker entered half_open canary state', {
        tenantId,
        processorId,
        elapsedSeconds,
      });
    }
  }

  return breaker;
}

/**
 * Step 179.2: Records a successful processor execution.
 */
export async function recordProcessorSuccess(
  tenantId: string,
  processorId: PaymentProcessorId,
  latencyMs: number,
  volumeUsd = 0.0
): Promise<CircuitBreakerStateRecord> {
  const breaker = getProcessorHealthState(tenantId, processorId);
  const now = new Date().toISOString();

  breaker.totalRequests++;
  breaker.successfulRequests++;
  breaker.consecutiveFailures = 0;
  breaker.totalVolumeUsd = Number((breaker.totalVolumeUsd + volumeUsd).toFixed(4));

  // Recalculate average latency
  const prevSum = breaker.averageLatencyMs * (breaker.totalRequests - 1);
  breaker.averageLatencyMs = Number(((prevSum + latencyMs) / breaker.totalRequests).toFixed(2));

  // Recalculate failure rate
  breaker.failureRatePct = Number(
    ((breaker.failedRequests / breaker.totalRequests) * 100).toFixed(2)
  );

  // If in 'half_open' canary state, success resets circuit to 'closed'
  if (breaker.state === 'half_open') {
    breaker.state = 'closed';
    breaker.trippedAt = undefined;
    logger.info('Canary succeeded: Processor circuit breaker reset to closed (healthy)', {
      tenantId,
      processorId,
    });

    try {
      await auditRepo.append({
        actor_id: '00000000-0000-4000-8000-000000000000',
        action: 'CIRCUIT_BREAKER_RESET',
        entity_type: 'processor_circuit_breaker',
        entity_id: breaker.id,
        payload: { processorId, state: 'closed' },
      });
    } catch {}
  }

  breaker.updatedAt = now;
  return breaker;
}

/**
 * Step 179.3: Records a processor gateway failure (timeout, 5xx, socket error).
 */
export async function recordProcessorFailure(
  tenantId: string,
  processorId: PaymentProcessorId,
  latencyMs: number,
  isGatewayOutage = true
): Promise<CircuitBreakerStateRecord> {
  const breaker = getProcessorHealthState(tenantId, processorId);
  const now = new Date().toISOString();

  breaker.totalRequests++;
  breaker.failedRequests++;
  breaker.lastFailureAt = now;

  if (isGatewayOutage) {
    breaker.consecutiveFailures++;
  }

  // Recalculate failure rate
  breaker.failureRatePct = Number(
    ((breaker.failedRequests / breaker.totalRequests) * 100).toFixed(2)
  );

  // Check trip conditions:
  // 1. Consecutive failures >= CONSECUTIVE_FAILURE_THRESHOLD (5)
  // 2. High failure rate (>= 50%) after at least 10 requests
  // 3. Any failure while in 'half_open' canary immediately trips back to 'open'
  const shouldTrip =
    breaker.state === 'half_open' ||
    breaker.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD ||
    (breaker.totalRequests >= 10 && breaker.failureRatePct >= FAILURE_RATE_THRESHOLD_PCT);

  if (shouldTrip && breaker.state !== 'open') {
    breaker.state = 'open';
    breaker.trippedAt = now;

    logger.warn('Processor circuit breaker TRIPPED to open state', {
      tenantId,
      processorId,
      consecutiveFailures: breaker.consecutiveFailures,
      failureRatePct: breaker.failureRatePct,
    });

    try {
      await auditRepo.append({
        actor_id: '00000000-0000-4000-8000-000000000000',
        action: 'CIRCUIT_BREAKER_TRIPPED',
        entity_type: 'processor_circuit_breaker',
        entity_id: breaker.id,
        payload: {
          processorId,
          consecutiveFailures: breaker.consecutiveFailures,
          failureRatePct: breaker.failureRatePct,
        },
      });
    } catch {}
  }

  breaker.updatedAt = now;
  return breaker;
}

/**
 * Step 179.4: Filters processor waterfall, bypassing processors whose circuit breaker is open.
 */
export function filterHealthyWaterfall(
  tenantId: string,
  waterfall: PaymentProcessorId[]
): PaymentProcessorId[] {
  return waterfall.filter((p) => {
    const breaker = getProcessorHealthState(tenantId, p);
    return breaker.state !== 'open';
  });
}

/**
 * Manual administrative reset for circuit breaker.
 */
export function resetCircuitBreaker(
  tenantId: string,
  processorId: PaymentProcessorId
): CircuitBreakerStateRecord {
  const breaker = getOrCreateBreaker(tenantId, processorId);
  breaker.state = 'closed';
  breaker.consecutiveFailures = 0;
  breaker.trippedAt = undefined;
  breaker.updatedAt = new Date().toISOString();
  return breaker;
}

export function resetAllCircuitBreakers(): void {
  breakersStore.clear();
}
