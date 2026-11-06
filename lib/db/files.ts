// path: lib/db/files.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import {
  FileEntity,
  CreateFileInput,
  UpdateFileInput,
  FileCategory,
  FileCreateSchema,
} from '../../types/file';

export interface FileQueryOptions {
  readonly category?: FileCategory | undefined;
  readonly includeDeleted?: boolean | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

/**
 * Enterprise File Metadata Repository.
 * Enforces KD Solution IT storage governance:
 * - RFC 9562 UUIDv7 Primary Keys
 * - Company-level tenant isolation
 * - SHA-256 integrity hash tracking
 * - Optimistic concurrency control and safe soft-deletion
 */
export class FileRepository extends AbstractRepository<FileEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<FileEntity> | undefined;
  }) {
    super('File', options);
  }

  /**
   * Registers a new uploaded file metadata record with schema validation.
   */
  public async createFile(input: CreateFileInput): Promise<FileEntity> {
    const validated = FileCreateSchema.parse({
      company_id: input.company_id ?? this.defaultCompanyId,
      category: input.category ?? 'general',
      original_name: input.original_name,
      storage_provider: input.storage_provider ?? 'supabase',
      storage_path: input.storage_path,
      file_hash: input.file_hash,
      encrypted_hash: input.encrypted_hash ?? null,
      size_bytes: input.size_bytes,
      mime_type: input.mime_type,
      is_encrypted: input.is_encrypted ?? true,
      encryption_version: input.encryption_version ?? 1,
    });

    return await this.create({
      ...input,
      ...validated,
      company_id: validated.company_id,
      encrypted_hash: validated.encrypted_hash ?? null,
    });
  }

  /**
   * Retrieves a file metadata record by ID with optional tenant access verification.
   */
  public async findFileById(
    id: string,
    companyId?: string
  ): Promise<FileEntity | null> {
    const file = await this.findById(id);
    if (!file) return null;

    if (companyId && file.company_id !== companyId) {
      // Tenant isolation guard: deny access if belonging to a different tenant
      return null;
    }

    return file;
  }

  /**
   * Retrieves all file metadata records belonging to a company, optionally filtered by category.
   */
  public async findFilesByCompany(
    companyId: string,
    options?: FileQueryOptions
  ): Promise<FileEntity[]> {
    const all = await this.findMany({
      companyId,
      includeDeleted: options?.includeDeleted ?? false,
      limit: options?.limit,
      offset: options?.offset,
    });

    if (options?.category) {
      return all.filter((f) => f.category === options.category);
    }

    return all;
  }

  /**
   * Finds an active file record by its original SHA-256 hash (e.g. for deduplication or audit).
   */
  public async findFileByHash(
    fileHash: string,
    companyId?: string
  ): Promise<FileEntity | null> {
    const normalizedHash = fileHash.toLowerCase().trim();
    const files = await this.findMany({
      companyId,
      includeDeleted: false,
    });

    const found = files.find(
      (f) => f.file_hash.toLowerCase() === normalizedHash
    );
    return found ?? null;
  }

  /**
   * Safely soft-deletes a file record with optimistic locking.
   */
  public async softDeleteFile(
    id: string,
    expectedVersion: number
  ): Promise<FileEntity> {
    return await this.softDelete(id, expectedVersion);
  }
}
