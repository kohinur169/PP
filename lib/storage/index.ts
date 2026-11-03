// path: lib/storage/index.ts

import type { StorageAdapter } from './types';
import { StorageError } from './types';
import { MockStorageAdapter } from './mock';
import { SupabaseStorageAdapter } from './supabase';
import { S3StorageAdapter } from './s3';

export * from './types';
export * from './mock';
export * from './supabase';
export * from './s3';
export * from './validator';

export type StorageProviderType = 'supabase' | 's3' | 'mock';

let activeStorageInstance: StorageAdapter | null = null;

/**
 * Resets the active cached storage singleton (primarily for test suite isolation).
 */
export function resetStorageAdapter(): void {
  activeStorageInstance = null;
}

/**
 * Strictly forbids local server disk storage (/tmp, local folders) to ensure
 * stateless execution across Vercel, Netlify, and containerized deployments.
 */
export function assertNoLocalStorage(pathToCheck?: string): void {
  if (!pathToCheck) return;
  const normalized = pathToCheck.toLowerCase().trim();

  const forbiddenLocalPrefixes = [
    '/tmp',
    './tmp',
    '../',
    './uploads',
    '/var',
    '/usr',
    'c:\\',
    'd:\\',
  ];

  for (const prefix of forbiddenLocalPrefixes) {
    if (normalized.startsWith(prefix)) {
      throw new StorageError(
        `Local filesystem storage is strictly forbidden in production. Target path "${pathToCheck}" violates the Zero-Local-Disk architecture rule.`
      );
    }
  }
}

/**
 * Validates configuration and credentials for the specified or environment-selected storage provider.
 */
export function validateStorageConfig(
  providerOverride?: string
): { valid: boolean; provider: StorageProviderType; bucket: string } {
  const provider = (
    providerOverride ??
    process.env.STORAGE_PROVIDER ??
    'supabase'
  ).toLowerCase() as StorageProviderType;

  if (!['supabase', 's3', 'mock'].includes(provider)) {
    throw new StorageError(
      `Unsupported STORAGE_PROVIDER: "${provider}". Must be "supabase", "s3", or "mock".`
    );
  }

  let bucket = 'kd-solution-secure-vault';

  if (provider === 'supabase') {
    bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'kd-solution-secure-vault';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (process.env.NODE_ENV === 'production' && !supabaseUrl) {
      throw new StorageError(
        'Supabase Storage requires NEXT_PUBLIC_SUPABASE_URL in production.'
      );
    }
  } else if (provider === 's3') {
    bucket = process.env.AWS_S3_BUCKET ?? 'kd-solution-secure-vault';
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new StorageError(
          'Amazon S3 Storage requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in production.'
        );
      }
    }
  }

  return {
    valid: true,
    provider,
    bucket,
  };
}

/**
 * Factory returning the active unified StorageAdapter singleton based on STORAGE_PROVIDER.
 * Enables zero-core-rewrite portability between Supabase Storage, Amazon S3, and Mock storage.
 */
export function getStorageAdapter(
  providerOverride?: StorageProviderType,
  options?: { readonly forceNew?: boolean | undefined }
): StorageAdapter {
  if (activeStorageInstance && !providerOverride && !options?.forceNew) {
    return activeStorageInstance;
  }

  const { provider, bucket } = validateStorageConfig(providerOverride);

  let adapter: StorageAdapter;

  switch (provider) {
    case 's3':
      adapter = new S3StorageAdapter({ bucketName: bucket });
      break;
    case 'supabase':
      adapter = new SupabaseStorageAdapter({ bucketName: bucket });
      break;
    case 'mock':
    default:
      adapter = new MockStorageAdapter(bucket);
      break;
  }

  if (!providerOverride && !options?.forceNew) {
    activeStorageInstance = adapter;
  }

  return adapter;
}
