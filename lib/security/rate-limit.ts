// path: lib/security/rate-limit.ts

/**
 * Result returned by rate limit evaluation.
 */
export interface RateLimitResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: number; // Unix timestamp in seconds
  readonly retryAfterSeconds: number;
}

/**
 * Options configuring rate limit boundaries.
 */
export interface RateLimitOptions {
  readonly limit?: number | undefined; // Maximum permitted requests in window
  readonly windowSeconds?: number | undefined; // Window duration in seconds
}

/**
 * In-memory sliding window bucket store.
 * Maps key -> Array of Unix millisecond timestamps.
 */
const inMemoryBuckets = new Map<string, number[]>();

/**
 * Default registration limits: Maximum 5 attempts per 3600 seconds (1 hour) per IP.
 * Mandated by Step 046.3.
 */
export const DEFAULT_REGISTRATION_RATE_LIMIT = 5;
export const DEFAULT_REGISTRATION_WINDOW_SECONDS = 3600;

/**
 * Resets the in-memory rate limit store (primarily for unit test isolation).
 */
export function resetRateLimits(): void {
  inMemoryBuckets.clear();
}

/**
 * Step 046.3: Enforces strict IP-based sliding window rate limiting.
 * Default policy: maximum 5 registration attempts per hour per IP address.
 */
export function checkRateLimit(
  key: string,
  options?: RateLimitOptions
): RateLimitResult {
  const limit = options?.limit ?? DEFAULT_REGISTRATION_RATE_LIMIT;
  const windowSeconds =
    options?.windowSeconds ?? DEFAULT_REGISTRATION_WINDOW_SECONDS;

  const nowMs = Date.now();
  const windowStartMs = nowMs - windowSeconds * 1000;

  // Retrieve or create timestamp bucket
  const existingTimestamps = inMemoryBuckets.get(key) ?? [];

  // Filter out timestamps outside the active sliding window
  const activeTimestamps = existingTimestamps.filter((ts) => ts > windowStartMs);

  const isAllowed = activeTimestamps.length < limit;

  if (isAllowed) {
    activeTimestamps.push(nowMs);
    inMemoryBuckets.set(key, activeTimestamps);
  }

  const remaining = Math.max(0, limit - activeTimestamps.length);

  // Compute reset timestamp in seconds
  const earliestTs = activeTimestamps[0] ?? nowMs;
  const resetAtMs = earliestTs + windowSeconds * 1000;
  const resetAt = Math.ceil(resetAtMs / 1000);

  const retryAfterSeconds = isAllowed
    ? 0
    : Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));

  return {
    allowed: isAllowed,
    limit,
    remaining,
    resetAt,
    retryAfterSeconds,
  };
}

/**
 * Constructs standard rate limit HTTP response headers.
 */
export function getRateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetAt),
  };

  if (!result.allowed) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }

  return headers;
}
