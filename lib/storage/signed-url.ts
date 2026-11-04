// path: lib/storage/signed-url.ts

import crypto from 'node:crypto';
import type { FileEntity } from '../../types/file';
import { FileRepository } from '../db/files';
import { AuditLogRepository } from '../db/audit';
import { CompanyMemberRepository } from '../db/memberships';
import type { StorageAdapter } from './types';
import { getStorageAdapter } from './index';
import { decryptFileBuffer } from './file-encryption';
import { logger } from '../logger';

/**
 * Standard expiration window for signed download URLs (15 minutes).
 * Mandated by KD Solution IT Security Policy LR-022 and PCI DSS storage isolation.
 */
export const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 900;

/**
 * Maximum permitted expiration window (15 minutes / 900 seconds).
 * Requests exceeding this threshold are clamped to prevent persistent url leakage.
 */
export const MAX_SIGNED_URL_EXPIRY_SECONDS = 900;

/**
 * Compliance roles granted cross-tenant document audit & review privileges.
 */
export const COMPLIANCE_ROLES = new Set<string>([
  'super_admin',
  'compliance_kyc',
  'compliance_officer',
]);

/**
 * Thrown when a requested file does not exist or has been soft-deleted.
 */
export class FileNotFoundError extends Error {
  public readonly fileId: string;

  constructor(fileId: string) {
    super(`[Secure Storage] File with ID "${fileId}" not found or has been deleted.`);
    this.name = 'FileNotFoundError';
    this.fileId = fileId;
  }
}

/**
 * Thrown when an actor fails tenant isolation or role-based access checks for a file.
 */
export class FileAccessDeniedError extends Error {
  public readonly fileId: string;
  public readonly userId: string;
  public readonly reason: string;

  constructor(fileId: string, userId: string, reason: string) {
    super(`[Secure Storage] Access denied to file "${fileId}" for user "${userId}": ${reason}`);
    this.name = 'FileAccessDeniedError';
    this.fileId = fileId;
    this.userId = userId;
    this.reason = reason;
  }
}

/**
 * Thrown when an issued signed download URL or token has expired.
 */
export class SignedUrlExpiredError extends Error {
  public readonly expiresAt: string;

  constructor(expiresAt: string) {
    super(`[Secure Storage] Signed download URL has expired at "${expiresAt}". (Maximum lifetime: 15 minutes)`);
    this.name = 'SignedUrlExpiredError';
    this.expiresAt = expiresAt;
  }
}

/**
 * Thrown when a signed URL signature is invalid or tampered with.
 */
export class SignedUrlInvalidError extends Error {
  constructor(message = 'Invalid or tampered signed download URL signature.') {
    super(`[Secure Storage] ${message}`);
    this.name = 'SignedUrlInvalidError';
  }
}

/**
 * Options for generating a secure, short-lived signed download URL.
 */
export interface GenerateSecureDownloadUrlRequest {
  readonly fileId: string;
  readonly userId: string;
  readonly userRole?: string | undefined;
  readonly userCompanyId?: string | undefined;
  readonly isSuperadmin?: boolean | undefined;
  readonly expiresInSeconds?: number | undefined;
  readonly ipAddress?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
  readonly downloadFilename?: string | undefined;
}

/**
 * Injectable dependencies for unit testing and modular execution.
 */
export interface SecureDownloadUrlDependencies {
  readonly fileRepo?: FileRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly memberRepo?: CompanyMemberRepository | undefined;
  readonly storageAdapter?: StorageAdapter | undefined;
  readonly secretKey?: string | undefined;
}

/**
 * Output envelope for secure signed download URL generation.
 */
export interface SecureDownloadUrlResult {
  readonly fileId: string;
  readonly companyId: string;
  readonly originalName: string;
  readonly category: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly isEncrypted: boolean;
  readonly signedUrl: string;
  readonly platformSignedUrl: string;
  readonly downloadToken: string;
  readonly expiresAt: string;
  readonly expiresInSeconds: number;
}

/**
 * Result of validating an issued signed download token.
 */
export interface SignedTokenVerificationResult {
  readonly valid: boolean;
  readonly reason?: 'EXPIRED' | 'INVALID_SIGNATURE' | 'MALFORMED' | undefined;
  readonly payload?: {
    readonly fileId: string;
    readonly companyId: string;
    readonly userId: string;
    readonly expiresAt: number;
    readonly nonce: string;
  } | undefined;
}

/**
 * Secret signing key used for platform-level download token generation and verification.
 */
function getSigningSecret(customSecret?: string): string {
  return (
    customSecret ||
    process.env.STORAGE_SIGNED_URL_SECRET ||
    process.env.CEO_MASTER_KEY ||
    'kdsolution-fallback-secure-signed-url-secret-key-32b'
  );
}

/**
 * Creates an HMAC-SHA256 signed download token encoding access claims and 15-minute expiration.
 */
export function createSignedDownloadToken(
  params: {
    readonly fileId: string;
    readonly companyId: string;
    readonly userId: string;
    readonly expiresAt: number; // Unix timestamp in milliseconds
  },
  customSecret?: string
): string {
  const secret = getSigningSecret(customSecret);
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = {
    fileId: params.fileId,
    companyId: params.companyId,
    userId: params.userId,
    expiresAt: params.expiresAt,
    nonce,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload, 'utf8')
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 signed download token, asserting cryptographic validity and expiration.
 * Fulfills Step 043.4: verifies expired tokens (>15 minutes) cannot be reused.
 */
export function verifySignedDownloadToken(
  token: string,
  customSecret?: string,
  now = Date.now()
): SignedTokenVerificationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'MALFORMED' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'MALFORMED' };
  }

  const [encodedPayload, providedSignature] = parts;
  const secret = getSigningSecret(customSecret);

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload, 'utf8')
    .digest('base64url');

  // Constant-time signature comparison to mitigate timing attacks
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }

  try {
    const rawPayload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    );

    if (
      !rawPayload ||
      typeof rawPayload !== 'object' ||
      !rawPayload.fileId ||
      !rawPayload.expiresAt
    ) {
      return { valid: false, reason: 'MALFORMED' };
    }

    // Step 043.4: Verify expired signed URLs cannot be reused after 15 minutes
    if (now > Number(rawPayload.expiresAt)) {
      return {
        valid: false,
        reason: 'EXPIRED',
        payload: rawPayload,
      };
    }

    return {
      valid: true,
      payload: rawPayload,
    };
  } catch {
    return { valid: false, reason: 'MALFORMED' };
  }
}

/**
 * Asserts whether a user is authorized to access a file record.
 * Step 043.2: Enforce tenant and role check: verify user owns file or holds compliance_kyc / super_admin role.
 */
export async function assertFileAccessAuthorized(
  file: FileEntity,
  request: {
    readonly userId: string;
    readonly userRole?: string | undefined;
    readonly userCompanyId?: string | undefined;
    readonly isSuperadmin?: boolean | undefined;
  },
  memberRepo?: CompanyMemberRepository
): Promise<void> {
  const isSuperadmin = Boolean(
    request.isSuperadmin || request.userRole?.toLowerCase() === 'super_admin'
  );

  const isCompliance = Boolean(
    request.userRole && COMPLIANCE_ROLES.has(request.userRole.toLowerCase().trim())
  );

  // Super admins and Compliance Officers hold global cross-tenant inspection authority
  if (isSuperadmin || isCompliance) {
    return;
  }

  // Standard tenant actors must belong to the file's owning company
  if (request.userCompanyId && request.userCompanyId === file.company_id) {
    return;
  }

  // If member repository is supplied, check active company membership record
  if (memberRepo) {
    const membership = await memberRepo.findByCompanyAndUser(
      file.company_id,
      request.userId
    );
    if (
      membership &&
      membership.deleted_at === null &&
      membership.status === 'active'
    ) {
      return;
    }
  }

  throw new FileAccessDeniedError(
    file.id,
    request.userId,
    `Actor company (${request.userCompanyId ?? 'none'}) does not match file tenant (${file.company_id}), and role (${request.userRole ?? 'none'}) lacks compliance privileges.`
  );
}

/**
 * Step 043.1: Generates a short-lived, 15-minute expiring signed download URL.
 * Step 043.2: Enforces tenant isolation and role permissions.
 * Step 043.3: Records FILE_ACCESSED in the cryptographic audit log.
 */
export async function generateSecureDownloadUrl(
  request: GenerateSecureDownloadUrlRequest,
  deps?: SecureDownloadUrlDependencies
): Promise<SecureDownloadUrlResult> {
  if (!request.fileId || typeof request.fileId !== 'string') {
    throw new Error('A valid fileId is required to generate a download URL.');
  }
  if (!request.userId || typeof request.userId !== 'string') {
    throw new Error('A valid userId is required to generate a download URL.');
  }

  const fileRepo = deps?.fileRepo ?? new FileRepository();
  const auditRepo = deps?.auditRepo ?? new AuditLogRepository();

  // 1. Fetch file metadata
  const file = await fileRepo.findById(request.fileId);
  if (!file || file.deleted_at !== null) {
    throw new FileNotFoundError(request.fileId);
  }

  // 2. Step 043.2: Enforce tenant and role check
  await assertFileAccessAuthorized(file, request, deps?.memberRepo);

  // 3. Enforce 15-minute maximum lifetime
  const expiresInSeconds = Math.min(
    Math.max(request.expiresInSeconds ?? DEFAULT_SIGNED_URL_EXPIRY_SECONDS, 1),
    MAX_SIGNED_URL_EXPIRY_SECONDS
  );

  const expiresTimestamp = Date.now() + expiresInSeconds * 1000;
  const expiresAt = new Date(expiresTimestamp).toISOString();

  // 4. Resolve storage adapter
  const storageAdapter =
    deps?.storageAdapter ?? getStorageAdapter(file.storage_provider);

  const providerResult = await storageAdapter.getSignedUrl(
    file.storage_path,
    {
      expiresInSeconds,
      downloadFilename: request.downloadFilename ?? file.original_name,
    },
    file.company_id
  );

  // 5. Generate signed platform token and URL
  const downloadToken = createSignedDownloadToken(
    {
      fileId: file.id,
      companyId: file.company_id,
      userId: request.userId,
      expiresAt: expiresTimestamp,
    },
    deps?.secretKey
  );

  const platformSignedUrl = `/api/files/${file.id}/download?token=${downloadToken}`;

  // Helper to validate UUID format for audit log actor_id
  const isUuid = (val?: string | null): boolean => {
    if (!val) return false;
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);
  };

  // 6. Step 043.3: Record FILE_ACCESSED in audit_logs
  await auditRepo.append({
    action: 'FILE_ACCESSED',
    entity_type: 'file',
    entity_id: file.id,
    actor_id: isUuid(request.userId) ? request.userId : null,
    company_id: file.company_id,
    ip_address: request.ipAddress ?? null,
    user_agent: request.userAgent ?? null,
    payload: {
      fileId: file.id,
      actorUserId: request.userId,
      originalName: file.original_name,
      category: file.category,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      storageProvider: file.storage_provider,
      storagePath: file.storage_path,
      isEncrypted: file.is_encrypted,
      actorRole: request.userRole ?? 'authenticated_user',
      isSuperadmin: Boolean(
        request.isSuperadmin || request.userRole?.toLowerCase() === 'super_admin'
      ),
      expiresInSeconds,
      accessType: 'signed_url',
    },
  });

  logger.info('Short-lived secure file download URL issued', {
    fileId: file.id,
    actorId: request.userId,
    companyId: file.company_id,
    expiresInSeconds,
  });

  return {
    fileId: file.id,
    companyId: file.company_id,
    originalName: file.original_name,
    category: file.category,
    mimeType: file.mime_type,
    sizeBytes: file.size_bytes,
    isEncrypted: file.is_encrypted,
    signedUrl: providerResult.signedUrl,
    platformSignedUrl,
    downloadToken,
    expiresAt,
    expiresInSeconds,
  };
}

/**
 * Downloads a file from storage and decrypts it on the fly if encrypted.
 * Automatically verifies tenant ownership and logs FILE_ACCESSED / FILE_DECRYPTED events.
 */
export async function downloadAndDecryptFile(
  request: GenerateSecureDownloadUrlRequest,
  deps?: SecureDownloadUrlDependencies
): Promise<{
  readonly data: Buffer;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly isEncrypted: boolean;
}> {
  const fileRepo = deps?.fileRepo ?? new FileRepository();
  const auditRepo = deps?.auditRepo ?? new AuditLogRepository();

  const file = await fileRepo.findById(request.fileId);
  if (!file || file.deleted_at !== null) {
    throw new FileNotFoundError(request.fileId);
  }

  await assertFileAccessAuthorized(file, request, deps?.memberRepo);

  const storageAdapter =
    deps?.storageAdapter ?? getStorageAdapter(file.storage_provider);

  const rawDownload = await storageAdapter.downloadFile(
    file.storage_path,
    file.company_id
  );

  let finalBuffer = rawDownload.data;

  const isUuid = (val?: string | null): boolean => {
    if (!val) return false;
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);
  };

  if (file.is_encrypted) {
    const decrypted = decryptFileBuffer(rawDownload.data, file.company_id);
    finalBuffer = decrypted.fileBuffer;

    await auditRepo.append({
      action: 'FILE_DECRYPTED',
      entity_type: 'file',
      entity_id: file.id,
      actor_id: isUuid(request.userId) ? request.userId : null,
      company_id: file.company_id,
      ip_address: request.ipAddress ?? null,
      user_agent: request.userAgent ?? null,
      payload: {
        fileId: file.id,
        actorUserId: request.userId,
        filename: file.original_name,
        sizeBytes: finalBuffer.length,
        encryptionVersion: file.encryption_version,
      },
    });
  }

  await auditRepo.append({
    action: 'FILE_ACCESSED',
    entity_type: 'file',
    entity_id: file.id,
    actor_id: isUuid(request.userId) ? request.userId : null,
    company_id: file.company_id,
    ip_address: request.ipAddress ?? null,
    user_agent: request.userAgent ?? null,
    payload: {
      fileId: file.id,
      actorUserId: request.userId,
      filename: file.original_name,
      accessType: 'direct_stream',
      isEncrypted: file.is_encrypted,
    },
  });

  return {
    data: finalBuffer,
    filename: file.original_name,
    mimeType: file.mime_type,
    sizeBytes: finalBuffer.length,
    isEncrypted: file.is_encrypted,
  };
}
