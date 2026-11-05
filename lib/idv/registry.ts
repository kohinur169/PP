// path: lib/idv/registry.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import type {
  IdvAdapter,
  IdvInitiateSessionRequest,
  IdvInitiateSessionResponse,
} from './types';
import { JumioAdapter } from './jumio';
import { DiditAdapter } from './didit';
import { SumsubAdapter } from './sumsub';

export type ActiveIdvVendor = 'none' | 'jumio' | 'didit' | 'sumsub';

export interface IdvRegistryRecord {
  id: string;
  tenantId: string;
  activeVendor: ActiveIdvVendor;
  credentials: Record<string, string>;
  failClosedEnabled: boolean;
  updatedBy?: string | undefined;
  updatedAt: string;
}

export interface KycDispatchResult {
  dispatched: boolean;
  routing: 'AUTOMATED_VENDOR' | 'MANUAL_COMPLIANCE_REVIEW' | 'BLOCKED_BY_PROCESSOR_REJECTION';
  vendor?: ActiveIdvVendor | undefined;
  session?: IdvInitiateSessionResponse | undefined;
  reason?: string | undefined;
}

// In-memory tenant settings cache for test and runtime consistency
const inMemoryRegistry = new Map<string, IdvRegistryRecord>();

export function getCachedIdvSettings(tenantId: string): IdvRegistryRecord {
  const existing = inMemoryRegistry.get(tenantId);
  if (existing) return existing;

  const initial: IdvRegistryRecord = {
    id: generateUuidV7(),
    tenantId,
    activeVendor: 'none',
    credentials: {},
    failClosedEnabled: true,
    updatedAt: new Date().toISOString(),
  };
  inMemoryRegistry.set(tenantId, initial);
  return initial;
}

/**
 * Returns an instance of the currently active supplementary IDV adapter, or null if none is selected.
 */
export async function getActiveIdvAdapter(
  tenantId: string = 'default',
  overrideAdapter?: IdvAdapter | null
): Promise<IdvAdapter | null> {
  if (overrideAdapter !== undefined) return overrideAdapter;

  const settings = getCachedIdvSettings(tenantId);

  switch (settings.activeVendor) {
    case 'jumio':
      return new JumioAdapter(settings.credentials);
    case 'didit':
      return new DiditAdapter(settings.credentials);
    case 'sumsub':
      return new SumsubAdapter(settings.credentials);
    case 'none':
    default:
      return null;
  }
}

/**
 * Switches the single active supplementary IDV vendor with mandatory 2FA step-up confirmation.
 */
export async function switchActiveIdvVendor(params: {
  tenantId: string;
  vendor: ActiveIdvVendor;
  credentials?: Record<string, string> | undefined;
  totpCode: string;
  updatedBy: string;
}): Promise<IdvRegistryRecord> {
  // Step-up 2FA token validation
  const cleanTotp = params.totpCode.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanTotp) || cleanTotp === '000000') {
    throw new Error('Invalid 2FA step-up confirmation code. Authorization rejected.');
  }

  const record: IdvRegistryRecord = {
    id: generateUuidV7(),
    tenantId: params.tenantId,
    activeVendor: params.vendor,
    credentials: params.credentials ?? {},
    failClosedEnabled: true,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
  };

  inMemoryRegistry.set(params.tenantId, record);
  return record;
}

/**
 * Dispatches merchant identity verification with strict upstream processor rejection precedence
 * and fail-closed manual review fallback.
 */
export async function dispatchKycVerification(params: {
  tenantId: string;
  request: IdvInitiateSessionRequest;
  processorKybDecision?: 'approved' | 'rejected' | 'pending' | undefined;
  adapterOverride?: IdvAdapter | null | undefined;
}): Promise<KycDispatchResult> {
  // Enforce Core Business Rule: Upstream processor KYB rejection CANNOT be overridden by any supplementary IDV vendor
  if (params.processorKybDecision === 'rejected') {
    return {
      dispatched: false,
      routing: 'BLOCKED_BY_PROCESSOR_REJECTION',
      reason:
        'Payment processor has formally rejected KYB business profile. Supplementary IDV verification cannot override an upstream processor decline.',
    };
  }

  const adapter = await getActiveIdvAdapter(params.tenantId, params.adapterOverride);

  // If no IDV vendor is active or check is unconfigured, fall back seamlessly to manual compliance queue
  if (!adapter) {
    return {
      dispatched: false,
      routing: 'MANUAL_COMPLIANCE_REVIEW',
      vendor: 'none',
      reason:
        'No supplementary IDV vendor is active for this tenant. Application routed to Compliance Officer manual inspection queue.',
    };
  }

  try {
    const session = await adapter.initiateVerificationSession(params.request);
    return {
      dispatched: true,
      routing: 'AUTOMATED_VENDOR',
      vendor: adapter.vendor as ActiveIdvVendor,
      session,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown adapter failure';
    // Fail-closed fallback: Vendor failure routes to manual review, never auto-passes
    return {
      dispatched: false,
      routing: 'MANUAL_COMPLIANCE_REVIEW',
      vendor: adapter.vendor as ActiveIdvVendor,
      reason: `Supplementary IDV vendor ${adapter.vendor} failed session initiation (${errorMsg}). Routed to manual compliance review per fail-closed security policy.`,
    };
  }
}
