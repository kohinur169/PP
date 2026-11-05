// path: lib/api/auth.ts

import { NextRequest } from 'next/server';
import { authenticateApiKey, MerchantApiKeyRecord, InvalidApiKeyAuthenticationError } from '@/lib/api/api-keys';
import { checkStoreApiRateLimit, StoreApiRateLimitExceededError } from '@/lib/api/store-payments';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger/logger';

export interface AuthenticatedApiContext {
  keyRecord: MerchantApiKeyRecord;
  tenantId: string;
  companyId: string;
  environment: 'live' | 'test';
}

const auditRepo = new AuditLogRepository();

/**
 * Step 212.1 - 212.3: Authenticates incoming API requests with Bearer Token, enforces rate limit, and injects context.
 */
export async function authenticateApiRequest(req: NextRequest | Request): Promise<AuthenticatedApiContext> {
  const authHeader = req.headers.get('authorization') ?? '';

  if (!authHeader.startsWith('Bearer ')) {
    throw new InvalidApiKeyAuthenticationError('Missing or malformed Authorization header. Expected "Bearer sk_..."');
  }

  const token = authHeader.slice(7).trim();
  const startTime = Date.now();

  try {
    const keyRecord = await authenticateApiKey(token);

    // Apply sliding window rate limit
    const rateCheck = checkStoreApiRateLimit(keyRecord.companyId);
    if (!rateCheck.allowed) {
      throw new StoreApiRateLimitExceededError(rateCheck.resetSeconds);
    }

    const latencyMs = Date.now() - startTime;
    logger.info('API request authenticated', {
      companyId: keyRecord.companyId,
      environment: keyRecord.environment,
      latencyMs,
    });

    try {
      await auditRepo.append({
        actor_id: keyRecord.createdBy,
        action: 'API_REQUEST_AUTHENTICATED',
        entity_type: 'merchant_api_key',
        entity_id: keyRecord.id,
        payload: {
          companyId: keyRecord.companyId,
          environment: keyRecord.environment,
          latencyMs,
        },
      });
    } catch {}

    return {
      keyRecord,
      tenantId: keyRecord.tenantId,
      companyId: keyRecord.companyId,
      environment: keyRecord.environment,
    };
  } catch (error) {
    logger.warn('API request authentication rejected', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
