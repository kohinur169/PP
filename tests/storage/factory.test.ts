// path: tests/storage/factory.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getStorageAdapter,
  resetStorageAdapter,
  validateStorageConfig,
  assertNoLocalStorage,
  StorageError,
  MockStorageAdapter,
  SupabaseStorageAdapter,
  S3StorageAdapter,
} from '../../lib/storage';

describe('Step 039: Zero-Core-Rewrite Storage Provider Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetStorageAdapter();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetStorageAdapter();
  });

  describe('Storage Configuration Validation & Local Disk Ban', () => {
    it('validates supported storage providers (supabase, s3, mock)', () => {
      expect(validateStorageConfig('supabase').valid).toBe(true);
      expect(validateStorageConfig('s3').valid).toBe(true);
      expect(validateStorageConfig('mock').valid).toBe(true);
    });

    it('rejects unsupported storage providers with StorageError', () => {
      expect(() => validateStorageConfig('local-disk')).toThrow(StorageError);
      expect(() => validateStorageConfig('ftp')).toThrow(StorageError);
      expect(() => validateStorageConfig('gcp')).toThrow(StorageError);
    });

    it('enforces architectural ban on local server disk storage', () => {
      expect(() => assertNoLocalStorage('/tmp/uploaded_passport.jpg')).toThrow(StorageError);
      expect(() => assertNoLocalStorage('./uploads/invoice.pdf')).toThrow(StorageError);
      expect(() => assertNoLocalStorage('/var/data/logos/brand.png')).toThrow(StorageError);

      // Cloud object keys pass cleanly
      expect(() =>
        assertNoLocalStorage('companies/018f6c4c/kyc/doc.pdf')
      ).not.toThrow();
    });
  });

  describe('Dynamic Provider Selection via STORAGE_PROVIDER', () => {
    it('verifies quality gate: toggles between supabase and s3 adapters seamlessly', () => {
      // 1. Supabase Storage Provider
      process.env.STORAGE_PROVIDER = 'supabase';
      resetStorageAdapter();
      const supabaseAdapter = getStorageAdapter();
      expect(supabaseAdapter).toBeInstanceOf(SupabaseStorageAdapter);
      expect(supabaseAdapter.providerName).toBe('supabase-storage');

      // 2. Amazon S3 Storage Provider
      process.env.STORAGE_PROVIDER = 's3';
      resetStorageAdapter();
      const s3Adapter = getStorageAdapter();
      expect(s3Adapter).toBeInstanceOf(S3StorageAdapter);
      expect(s3Adapter.providerName).toBe('amazon-s3');

      // 3. Mock Storage Provider
      process.env.STORAGE_PROVIDER = 'mock';
      resetStorageAdapter();
      const mockAdapter = getStorageAdapter();
      expect(mockAdapter).toBeInstanceOf(MockStorageAdapter);
      expect(mockAdapter.providerName).toBe('mock-in-memory');
    });

    it('maintains singleton instance across repeated calls unless forceNew is specified', () => {
      process.env.STORAGE_PROVIDER = 'mock';
      const instance1 = getStorageAdapter();
      const instance2 = getStorageAdapter();

      expect(instance1).toBe(instance2);

      const forcedNew = getStorageAdapter('mock', { forceNew: true });
      expect(forcedNew).not.toBe(instance1);
      expect(forcedNew).toBeInstanceOf(MockStorageAdapter);
    });

    it('allows explicit runtime provider override without mutating environment', () => {
      process.env.STORAGE_PROVIDER = 's3';
      const adapter = getStorageAdapter('mock');

      expect(adapter).toBeInstanceOf(MockStorageAdapter);
      expect(process.env.STORAGE_PROVIDER).toBe('s3');
    });
  });
});
