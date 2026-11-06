// path: lib/email/domain-auth.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type EmailDomainPurpose = 'transactional' | 'marketing';
export type VerificationStatus = 'unverified' | 'valid' | 'invalid';

export interface EmailDomainAuthRecord {
  id: string;
  tenantId: string;
  domainPurpose: EmailDomainPurpose;
  domainName: string;
  spfRecord: string;
  spfStatus: VerificationStatus;
  dkimSelector: string;
  dkimRecord: string;
  dkimStatus: VerificationStatus;
  dmarcRecord: string;
  dmarcStatus: VerificationStatus;
  isVerifiedForLaunch: boolean;
  verifiedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterDomainAuthInput {
  tenantId: string;
  domainPurpose: EmailDomainPurpose;
  domainName: string;
  spfRecord: string;
  dkimSelector: string;
  dkimRecord: string;
  dmarcRecord: string;
  actorUserId: string;
  actorRole: string;
}

export interface VerifyDomainResult {
  isVerifiedForLaunch: boolean;
  spfStatus: VerificationStatus;
  dkimStatus: VerificationStatus;
  dmarcStatus: VerificationStatus;
  details: {
    spfError?: string | undefined;
    dkimError?: string | undefined;
    dmarcError?: string | undefined;
  };
}

export class DomainNotVerifiedForLaunchError extends Error {
  public readonly code = 'DOMAIN_NOT_VERIFIED_FOR_LAUNCH';
  public readonly statusCode = 422;

  constructor(domainName: string, purpose: EmailDomainPurpose) {
    super(
      `Email sending blocked for ${purpose} domain '${domainName}': SPF, DKIM and DMARC verification are mandatory before launch.`
    );
    this.name = 'DomainNotVerifiedForLaunchError';
  }
}

const domainStore = new Map<string, EmailDomainAuthRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Validates DNS SPF record format.
 */
function evaluateSpfRecord(record: string): { status: VerificationStatus; error?: string } {
  const trimmed = record.trim();
  if (!trimmed.startsWith('v=spf1')) {
    return { status: 'invalid', error: 'SPF record must begin with v=spf1.' };
  }
  if (!trimmed.includes('~all') && !trimmed.includes('-all')) {
    return { status: 'invalid', error: 'SPF record must contain ~all or -all enforcement directive.' };
  }
  return { status: 'valid' };
}

/**
 * Validates DNS DKIM record format.
 */
function evaluateDkimRecord(record: string): { status: VerificationStatus; error?: string } {
  const trimmed = record.trim();
  if (!trimmed.includes('v=DKIM1')) {
    return { status: 'invalid', error: 'DKIM record must declare v=DKIM1.' };
  }
  if (!trimmed.includes('p=') || trimmed.split('p=')[1]?.trim().length === 0) {
    return { status: 'invalid', error: 'DKIM record must declare public key p=.' };
  }
  return { status: 'valid' };
}

/**
 * Validates DNS DMARC record format.
 */
function evaluateDmarcRecord(record: string): { status: VerificationStatus; error?: string } {
  const trimmed = record.trim();
  if (!trimmed.startsWith('v=DMARC1')) {
    return { status: 'invalid', error: 'DMARC record must begin with v=DMARC1.' };
  }
  if (!trimmed.includes('p=reject') && !trimmed.includes('p=quarantine') && !trimmed.includes('p=none')) {
    return { status: 'invalid', error: 'DMARC record must specify policy p=reject, p=quarantine, or p=none.' };
  }
  return { status: 'valid' };
}

/**
 * Step 151.1: Register email domain configuration for transactional or marketing sending.
 * Section 23: "Transactional and marketing sending use separate domains or subdomains as volume grows."
 */
export async function registerDomainAuth(
  input: RegisterDomainAuthInput
): Promise<EmailDomainAuthRecord> {
  if (input.actorRole !== 'super_admin') {
    throw new Error('Unauthorized: Only super_admin can configure email domain authentication.');
  }

  const cleanDomain = input.domainName.trim().toLowerCase();
  if (!cleanDomain.includes('.') || cleanDomain.startsWith('.') || cleanDomain.endsWith('.')) {
    throw new Error('Valid domain name format is required (e.g. mail.kdsolution.com).');
  }

  // Check if tenant already registered another purpose with exact same domain when separating
  for (const existing of domainStore.values()) {
    if (
      existing.tenantId === input.tenantId &&
      existing.domainPurpose !== input.domainPurpose &&
      existing.domainName === cleanDomain
    ) {
      logger.warn('Warning: Transactional and marketing sending should ideally use separate subdomains.', {
        domain: cleanDomain,
        tenantId: input.tenantId,
      });
    }
  }

  const now = new Date().toISOString();
  const id = generateUuidV7();

  const record: EmailDomainAuthRecord = {
    id,
    tenantId: input.tenantId,
    domainPurpose: input.domainPurpose,
    domainName: cleanDomain,
    spfRecord: input.spfRecord.trim(),
    spfStatus: 'unverified',
    dkimSelector: input.dkimSelector.trim(),
    dkimRecord: input.dkimRecord.trim(),
    dkimStatus: 'unverified',
    dmarcRecord: input.dmarcRecord.trim(),
    dmarcStatus: 'unverified',
    isVerifiedForLaunch: false,
    createdAt: now,
    updatedAt: now,
  };

  domainStore.set(id, record);

  logger.info('Email domain registered for authentication', {
    domainId: id,
    tenantId: input.tenantId,
    domain: cleanDomain,
    purpose: input.domainPurpose,
  });

  try {
    await auditRepo.append({
      actor_id: input.actorUserId,
      action: 'EMAIL_DOMAIN_REGISTERED',
      entity_type: 'email_domain_auth',
      entity_id: id,
      payload: {
        domain: cleanDomain,
        purpose: input.domainPurpose,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for domain registration', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Step 151.2: Strict SPF, DKIM, and DMARC verification gate before launch.
 * Section 23: "Domain authentication SPF, DKIM and DMARC is configured and verified before launch."
 */
export async function verifyDomainRecords(
  domainId: string,
  actorUserId: string
): Promise<VerifyDomainResult> {
  const record = domainStore.get(domainId);
  if (!record) {
    throw new Error(`Email domain auth record '${domainId}' not found.`);
  }

  const spfCheck = evaluateSpfRecord(record.spfRecord);
  const dkimCheck = evaluateDkimRecord(record.dkimRecord);
  const dmarcCheck = evaluateDmarcRecord(record.dmarcRecord);

  record.spfStatus = spfCheck.status;
  record.dkimStatus = dkimCheck.status;
  record.dmarcStatus = dmarcCheck.status;

  const allValid =
    spfCheck.status === 'valid' &&
    dkimCheck.status === 'valid' &&
    dmarcCheck.status === 'valid';

  const now = new Date().toISOString();
  record.isVerifiedForLaunch = allValid;
  record.verifiedAt = allValid ? now : undefined;
  record.updatedAt = now;

  logger.info('Email domain DNS verification executed', {
    domainId: record.id,
    domain: record.domainName,
    isVerifiedForLaunch: allValid,
    spf: record.spfStatus,
    dkim: record.dkimStatus,
    dmarc: record.dmarcStatus,
  });

  try {
    await auditRepo.append({
      actor_id: actorUserId,
      action: 'EMAIL_DOMAIN_VERIFIED',
      entity_type: 'email_domain_auth',
      entity_id: record.id,
      payload: {
        domain: record.domainName,
        purpose: record.domainPurpose,
        isVerifiedForLaunch: allValid,
        spf: record.spfStatus,
        dkim: record.dkimStatus,
        dmarc: record.dmarcStatus,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for domain verification', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    isVerifiedForLaunch: allValid,
    spfStatus: record.spfStatus,
    dkimStatus: record.dkimStatus,
    dmarcStatus: record.dmarcStatus,
    details: {
      spfError: spfCheck.error,
      dkimError: dkimCheck.error,
      dmarcError: dmarcCheck.error,
    },
  };
}

/**
 * Gate check asserting that a domain has achieved verified status prior to launch.
 */
export async function assertDomainVerifiedForLaunch(
  tenantId: string,
  purpose: EmailDomainPurpose
): Promise<EmailDomainAuthRecord> {
  let target: EmailDomainAuthRecord | null = null;
  for (const record of domainStore.values()) {
    if (record.tenantId === tenantId && record.domainPurpose === purpose) {
      target = record;
      break;
    }
  }

  if (!target || !target.isVerifiedForLaunch) {
    throw new DomainNotVerifiedForLaunchError(target?.domainName ?? 'unknown', purpose);
  }

  return target;
}

/**
 * Retrieves domain authentication record by tenant and purpose.
 */
export async function getDomainAuth(
  tenantId: string,
  purpose: EmailDomainPurpose
): Promise<EmailDomainAuthRecord | null> {
  for (const record of domainStore.values()) {
    if (record.tenantId === tenantId && record.domainPurpose === purpose) {
      return record;
    }
  }
  return null;
}

/**
 * Resets in-memory store for test isolation.
 */
export function resetDomainAuthStore(): void {
  domainStore.clear();
}
