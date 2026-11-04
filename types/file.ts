// path: types/file.ts

import { z } from 'zod';
import { BaseEntity, CreateEntityInput, UpdateEntityInput } from './entity';

/**
 * Platform classifications for stored file assets.
 */
export type FileCategory =
  | 'kyc'
  | 'dispute'
  | 'logo'
  | 'invoice'
  | 'export'
  | 'general';

/**
 * Underlying cloud object storage provider where the binary payload resides.
 */
export type FileStorageProvider = 'supabase' | 's3' | 'mock';

/**
 * Full File Metadata entity tracking uploaded assets, company ownership,
 * storage provider references, and encryption state.
 */
export interface FileEntity extends BaseEntity {
  readonly company_id: string;
  readonly category: FileCategory;
  readonly original_name: string;
  readonly storage_provider: FileStorageProvider;
  readonly storage_path: string;
  readonly file_hash: string;
  readonly encrypted_hash?: string | null | undefined;
  readonly size_bytes: number;
  readonly mime_type: string;
  readonly is_encrypted: boolean;
  readonly encryption_version: number;
}

/**
 * Input type for creating a new file metadata record.
 */
export type CreateFileInput = CreateEntityInput<FileEntity>;

/**
 * Input type for mutating an existing file metadata record.
 */
export type UpdateFileInput = UpdateEntityInput<FileEntity>;

/**
 * Zod validation schema for file metadata registration.
 */
export const FileCreateSchema = z.object({
  company_id: z.string().uuid('Valid company UUID is required'),
  category: z.enum(['kyc', 'dispute', 'logo', 'invoice', 'export', 'general']).default('general'),
  original_name: z.string().min(1, 'Original file name is required').max(255),
  storage_provider: z.enum(['supabase', 's3', 'mock']).default('supabase'),
  storage_path: z.string().min(1, 'Storage path is required'),
  file_hash: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Valid 64-char SHA-256 file hash is required'),
  encrypted_hash: z.string().regex(/^[0-9a-fA-F]{64}$/).optional().nullable(),
  size_bytes: z.number().int().min(0, 'Size must be non-negative'),
  mime_type: z.string().min(1, 'MIME type is required').max(100),
  is_encrypted: z.boolean().default(true),
  encryption_version: z.number().int().min(1).default(1),
});

/**
 * Zod schema for updating file metadata.
 */
export const FileUpdateSchema = FileCreateSchema.partial();
