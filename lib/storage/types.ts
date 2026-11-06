// path: lib/storage/types.ts

/**
 * Standard Storage Categories supported across KD Solution IT object storage.
 */
export type StorageCategory =
  | 'kyc'
  | 'invoices'
  | 'disputes'
  | 'logos'
  | 'exports'
  | 'receipts';

/**
 * Options required when uploading a file to unified object storage.
 */
export interface StorageUploadOptions {
  readonly companyId: string;
  readonly category: StorageCategory;
  readonly filename: string;
  readonly fileId?: string | undefined;
  readonly contentType?: string | undefined;
  readonly metadata?: Record<string, string> | undefined;
  readonly encrypt?: boolean | undefined;
}

/**
 * Metadata returned after a successful file upload.
 */
export interface StorageUploadResult {
  readonly key: string;
  readonly fileId: string;
  readonly companyId: string;
  readonly category: StorageCategory;
  readonly sizeBytes: number;
  readonly contentType: string;
  readonly sha256: string;
  readonly encrypted: boolean;
  readonly uploadedAt: string;
}

/**
 * Options for generating short-lived signed URLs for temporary asset access.
 */
export interface StorageSignedUrlOptions {
  readonly expiresInSeconds?: number | undefined;
  readonly downloadFilename?: string | undefined;
}

/**
 * Signed URL response envelope.
 */
export interface StorageSignedUrlResult {
  readonly signedUrl: string;
  readonly key: string;
  readonly expiresAt: string;
}

/**
 * Health check result for object storage providers.
 */
export interface StorageHealthResult {
  readonly healthy: boolean;
  readonly latencyMs: number;
  readonly provider: string;
  readonly bucket: string;
}

/**
 * Base storage error class.
 */
export class StorageError extends Error {
  constructor(message: string) {
    super(`[Object Storage] ${message}`);
    this.name = 'StorageError';
  }
}

/**
 * Thrown when an object requested by key cannot be found in storage.
 */
export class StorageFileNotFoundError extends StorageError {
  public readonly key: string;

  constructor(key: string) {
    super(`File not found at storage path: ${key}`);
    this.name = 'StorageFileNotFoundError';
    this.key = key;
  }
}

/**
 * Thrown when an actor attempts to access or modify a file belonging to a different tenant company.
 */
export class StorageTenantAccessViolationError extends StorageError {
  public readonly key: string;
  public readonly requestedCompanyId: string;
  public readonly actualCompanyId: string;

  constructor(key: string, requestedCompanyId: string, actualCompanyId: string) {
    super(
      `Tenant Isolation Violation: Requested company "${requestedCompanyId}" cannot access asset "${key}" owned by company "${actualCompanyId}".`
    );
    this.name = 'StorageTenantAccessViolationError';
    this.key = key;
    this.requestedCompanyId = requestedCompanyId;
    this.actualCompanyId = actualCompanyId;
  }
}

/**
 * Unified Object Storage Adapter Interface.
 * Implemented identically by Supabase Storage, Amazon S3, and Mock Storage adapters.
 */
export interface StorageAdapter {
  readonly providerName: string;
  readonly bucketName: string;

  uploadFile(
    data: Buffer | Uint8Array | string,
    options: StorageUploadOptions
  ): Promise<StorageUploadResult>;

  downloadFile(
    key: string,
    enforceCompanyId?: string | undefined
  ): Promise<{
    data: Buffer;
    contentType: string;
    metadata?: Record<string, string> | undefined;
  }>;

  getSignedUrl(
    key: string,
    options?: StorageSignedUrlOptions,
    enforceCompanyId?: string | undefined
  ): Promise<StorageSignedUrlResult>;

  deleteFile(
    key: string,
    enforceCompanyId?: string | undefined
  ): Promise<{ success: boolean; key: string }>;

  checkHealth(): Promise<StorageHealthResult>;
}

/**
 * Sanitizes a filename to prevent path traversal, spaces, or illegal filesystem characters.
 */
export function sanitizeStorageFilename(rawFilename: string): string {
  const base = rawFilename.replace(/\\/g, '/').split('/').pop() ?? 'file';
  const clean = base
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
  return clean.length > 0 ? clean : 'unnamed_file';
}

/**
 * Builds standard, strictly tenant-isolated object storage path:
 * Pattern: "companies/{companyId}/{category}/{fileId}_{filename}"
 */
export function buildStoragePath(
  companyId: string,
  category: StorageCategory,
  fileId: string,
  filename: string
): string {
  const cleanCompanyId = companyId.trim().toLowerCase();
  const cleanFileId = fileId.trim().toLowerCase();
  const cleanFilename = sanitizeStorageFilename(filename);

  return `companies/${cleanCompanyId}/${category}/${cleanFileId}_${cleanFilename}`;
}

/**
 * Extracts owning tenant companyId from a canonical storage path.
 */
export function extractCompanyIdFromPath(key: string): string | null {
  const match = key.match(/^companies\/([a-zA-Z0-9-]+)\//);
  return match?.[1] ?? null;
}
