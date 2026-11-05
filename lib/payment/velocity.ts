// path: lib/payment/velocity.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';

export class CardVelocityLimitExceededError extends Error {
  readonly code = 'CARD_VELOCITY_LIMIT_EXCEEDED';
  readonly httpStatus = 429;
  readonly context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(`[Card Velocity Rate Limit Exceeded] ${message}`);
    this.name = 'CardVelocityLimitExceededError';
    this.context = context;
  }
}

export interface VelocityCheckParams {
  cardFingerprint?: string | undefined;
  ipAddress: string;
  tenantId?: string | undefined;
  now?: Date | undefined;
}

export interface VelocityCheckResult {
  allowed: boolean;
  blockedReason?: string | undefined;
  retryAfterSeconds?: number | undefined;
  cardHourlyCount: number;
  cardDailyCount: number;
  ipHourlyCount: number;
  isIpBlocked: boolean;
  evaluatedAt: string;
}

export interface VelocityLimitsConfig {
  maxCardAttemptsPerHour: number; // Default 3
  maxCardAttemptsPerDay: number; // Default 5
  maxIpAttemptsPerHour: number; // Default 10
  ipBlockDurationSeconds: number; // Default 3600 (1 hour)
}

export const DEFAULT_VELOCITY_LIMITS: VelocityLimitsConfig = {
  maxCardAttemptsPerHour: 3,
  maxCardAttemptsPerDay: 5,
  maxIpAttemptsPerHour: 10,
  ipBlockDurationSeconds: 3600,
};

interface AttemptRecord {
  timestamp: number;
  tenantId?: string | undefined;
}

interface IpBlockRecord {
  ipAddress: string;
  blockedUntil: number;
  reason: string;
}

// In-memory sliding window stores for card fingerprints, IPs, and temporary blocks
const cardAttempts = new Map<string, AttemptRecord[]>();
const ipAttempts = new Map<string, AttemptRecord[]>();
const ipBlocks = new Map<string, IpBlockRecord>();

/**
 * Step 136.2: Checks payment velocity against sliding window limits.
 * - Per card fingerprint: max 3 attempts per hour, max 5 per day.
 * - Per IP address: max 10 attempts per hour.
 *
 * Step 136.3: If velocity limits are exceeded, blocks transaction with CardVelocityLimitExceededError
 * and triggers temporary IP block.
 */
export async function checkPaymentVelocity(
  cardFingerprint: string | undefined,
  ip: string,
  options?: {
    tenantId?: string | undefined;
    limits?: Partial<VelocityLimitsConfig> | undefined;
    now?: Date | undefined;
    recordAttempt?: boolean | undefined;
  }
): Promise<VelocityCheckResult> {
  const limits: VelocityLimitsConfig = {
    ...DEFAULT_VELOCITY_LIMITS,
    ...options?.limits,
  };

  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const oneHourAgo = nowMs - 60 * 60 * 1000;
  const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;
  const cleanIp = ip.trim();

  // 1. Check if IP address is actively blocked
  const activeBlock = ipBlocks.get(cleanIp);
  if (activeBlock && activeBlock.blockedUntil > nowMs) {
    const remainingSeconds = Math.ceil((activeBlock.blockedUntil - nowMs) / 1000);
    logger.warn('Blocked payment attempt from banned IP', {
      ip: cleanIp,
      blockedUntil: new Date(activeBlock.blockedUntil).toISOString(),
      remainingSeconds,
    });

    throw new CardVelocityLimitExceededError(
      `IP address ${cleanIp} is temporarily blocked due to excessive payment velocity. Please retry after ${remainingSeconds} seconds.`,
      {
        ip: cleanIp,
        remainingSeconds,
        reason: activeBlock.reason,
      }
    );
  }

  // 2. Evaluate IP hourly attempts
  const ipList = (ipAttempts.get(cleanIp) ?? []).filter((rec) => rec.timestamp > oneHourAgo);
  ipAttempts.set(cleanIp, ipList);
  const ipHourlyCount = ipList.length;

  if (ipHourlyCount >= limits.maxIpAttemptsPerHour) {
    const blockUntil = nowMs + limits.ipBlockDurationSeconds * 1000;
    ipBlocks.set(cleanIp, {
      ipAddress: cleanIp,
      blockedUntil: blockUntil,
      reason: `Exceeded ${limits.maxIpAttemptsPerHour} attempts per hour`,
    });

    logger.warn('IP payment velocity limit exceeded; imposing temporary IP ban', {
      ip: cleanIp,
      ipHourlyCount,
      blockUntil: new Date(blockUntil).toISOString(),
    });

    throw new CardVelocityLimitExceededError(
      `Payment velocity exceeded for IP ${cleanIp} (max ${limits.maxIpAttemptsPerHour}/hour). IP has been temporarily blocked for security.`,
      {
        ip: cleanIp,
        ipHourlyCount,
        limit: limits.maxIpAttemptsPerHour,
        retryAfterSeconds: limits.ipBlockDurationSeconds,
      }
    );
  }

  // 3. Evaluate Card Fingerprint hourly and daily attempts (if fingerprint provided)
  let cardHourlyCount = 0;
  let cardDailyCount = 0;

  if (cardFingerprint && cardFingerprint.trim().length > 0) {
    const cleanFingerprint = cardFingerprint.trim();
    const cardList = (cardAttempts.get(cleanFingerprint) ?? []).filter(
      (rec) => rec.timestamp > oneDayAgo
    );
    cardAttempts.set(cleanFingerprint, cardList);

    cardDailyCount = cardList.length;
    cardHourlyCount = cardList.filter((rec) => rec.timestamp > oneHourAgo).length;

    // Check hourly cap (max 3)
    if (cardHourlyCount >= limits.maxCardAttemptsPerHour) {
      // Impose IP ban to stop automated card testing bots
      const blockUntil = nowMs + limits.ipBlockDurationSeconds * 1000;
      ipBlocks.set(cleanIp, {
        ipAddress: cleanIp,
        blockedUntil: blockUntil,
        reason: 'Automated card testing detected: card hourly velocity exceeded',
      });

      logger.warn('Card testing velocity exceeded: card hourly limit breached', {
        cardFingerprint: cleanFingerprint,
        cardHourlyCount,
        ip: cleanIp,
      });

      throw new CardVelocityLimitExceededError(
        `Card velocity limit exceeded: maximum ${limits.maxCardAttemptsPerHour} payment attempts per hour reached for this card. Card testing attack prevention triggered.`,
        {
          cardFingerprint: cleanFingerprint,
          cardHourlyCount,
          limit: limits.maxCardAttemptsPerHour,
          ip: cleanIp,
        }
      );
    }

    // Check daily cap (max 5)
    if (cardDailyCount >= limits.maxCardAttemptsPerDay) {
      logger.warn('Card daily velocity exceeded', {
        cardFingerprint: cleanFingerprint,
        cardDailyCount,
      });

      throw new CardVelocityLimitExceededError(
        `Card velocity limit exceeded: maximum ${limits.maxCardAttemptsPerDay} payment attempts per day reached for this card.`,
        {
          cardFingerprint: cleanFingerprint,
          cardDailyCount,
          limit: limits.maxCardAttemptsPerDay,
          ip: cleanIp,
        }
      );
    }
  }

  // Record attempt (defaults to true)
  if (options?.recordAttempt !== false) {
    const attempt: AttemptRecord = {
      timestamp: nowMs,
      tenantId: options?.tenantId,
    };

    ipList.push(attempt);
    ipAttempts.set(cleanIp, ipList);

    if (cardFingerprint && cardFingerprint.trim().length > 0) {
      const cleanFingerprint = cardFingerprint.trim();
      const existing = cardAttempts.get(cleanFingerprint) ?? [];
      existing.push(attempt);
      cardAttempts.set(cleanFingerprint, existing);
    }
  }

  return {
    allowed: true,
    cardHourlyCount: (options?.recordAttempt !== false ? cardHourlyCount + 1 : cardHourlyCount),
    cardDailyCount: (options?.recordAttempt !== false ? cardDailyCount + 1 : cardDailyCount),
    ipHourlyCount: (options?.recordAttempt !== false ? ipHourlyCount + 1 : ipHourlyCount),
    isIpBlocked: false,
    evaluatedAt: now.toISOString(),
  };
}

/**
 * Checks if an IP is currently banned under a velocity block.
 */
export function isIpTemporarilyBlocked(ip: string, now = new Date()): boolean {
  const block = ipBlocks.get(ip.trim());
  if (!block) return false;
  return block.blockedUntil > now.getTime();
}

/**
 * Manually clears an IP block (e.g. by Super Admin action).
 */
export function unblockIp(ip: string): void {
  ipBlocks.delete(ip.trim());
}

/**
 * Resets in-memory velocity tracking stores for test isolation.
 */
export function resetVelocityStore(): void {
  cardAttempts.clear();
  ipAttempts.clear();
  ipBlocks.clear();
}
