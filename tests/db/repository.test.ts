// path: tests/db/repository.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { AbstractRepository, InMemoryStorageDriver } from '../../lib/db/repository';
import { isValidUuidV7 } from '../../lib/db/uuidv7';
import {
  BaseEntity,
  OptimisticLockError,
  EntityNotFoundError,
  CreateEntityInput,
} from '../../types/entity';

interface TestProductEntity extends BaseEntity {
  name: string;
  sku: string;
  price_usd: number;
}

class TestProductRepository extends AbstractRepository<TestProductEntity> {
  constructor(options?: { defaultCompanyId?: string }) {
    super('Product', options);
  }
}

describe('Step 018: Base Table Standard Columns & Timestamp Triggers Migration', () => {
  const defaultCompanyId = '018f6c4c-3500-7fa1-b1e2-123456789abc';
  let repository: TestProductRepository;

  beforeEach(() => {
    repository = new TestProductRepository({ defaultCompanyId });
  });

  describe('Standard Base Columns Initialization', () => {
    it('initializes new entity with UUIDv7 id, version = 1, timestamps, and deleted_at = null', async () => {
      const input: CreateEntityInput<TestProductEntity> = {
        name: 'Enterprise Gateway Terminal',
        sku: 'EGT-1001',
        price_usd: 499.0,
      };

      const entity = await repository.create(input);

      // 1. Mandatory RFC 9562 UUIDv7 Primary Key
      expect(isValidUuidV7(entity.id)).toBe(true);

      // 2. Multi-tenant company partition
      expect(entity.company_id).toBe(defaultCompanyId);

      // 3. Optimistic concurrency version initialized to 1
      expect(entity.version).toBe(1);

      // 4. Timestamps initialized
      expect(entity.created_at).toBeDefined();
      expect(entity.updated_at).toBeDefined();
      expect(new Date(entity.created_at).getTime()).toBeGreaterThan(0);
      expect(entity.created_at).toBe(entity.updated_at);

      // 5. Soft-deletion initialized to null
      expect(entity.deleted_at).toBeNull();

      // 6. Domain attributes preserved
      expect(entity.name).toBe('Enterprise Gateway Terminal');
      expect(entity.sku).toBe('EGT-1001');
      expect(entity.price_usd).toBe(499.0);
    });

    it('rejects entity creation if mandatory company_id is missing', async () => {
      const noCompanyRepo = new TestProductRepository();
      const input: CreateEntityInput<TestProductEntity> = {
        name: 'Orphaned Product',
        sku: 'ORP-001',
        price_usd: 10.0,
      };

      await expect(noCompanyRepo.create(input)).rejects.toThrow(/missing mandatory company_id/);
    });
  });

  describe('Row Mutation & Automated Timestamp / Version Advancement', () => {
    it('automatically advances updated_at and increments version from 1 to 2 on mutation', async () => {
      const created = await repository.create({
        name: 'Original Widget',
        sku: 'WDG-001',
        price_usd: 25.0,
      });

      expect(created.version).toBe(1);
      const initialUpdatedAt = created.updated_at;

      // Small delay to ensure timestamp advancement
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Mutate sample row
      const updated = await repository.update(created.id, 1, {
        name: 'Mutated Widget',
        price_usd: 29.99,
      });

      // Confirm version incremented to 2
      expect(updated.version).toBe(2);

      // Confirm updated_at timestamp advanced
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(initialUpdatedAt).getTime()
      );

      // Confirm immutable attributes remain unchanged
      expect(updated.id).toBe(created.id);
      expect(updated.company_id).toBe(created.company_id);
      expect(updated.created_at).toBe(created.created_at);

      // Confirm domain mutations applied
      expect(updated.name).toBe('Mutated Widget');
      expect(updated.price_usd).toBe(29.99);
      expect(updated.sku).toBe('WDG-001');
    });

    it('increments version successively across multiple sequential mutations', async () => {
      const created = await repository.create({
        name: 'Item A',
        sku: 'SKU-A',
        price_usd: 10.0,
      });

      const update1 = await repository.update(created.id, 1, { price_usd: 15.0 });
      expect(update1.version).toBe(2);

      const update2 = await repository.update(created.id, 2, { price_usd: 20.0 });
      expect(update2.version).toBe(3);

      const update3 = await repository.update(created.id, 3, { price_usd: 25.0 });
      expect(update3.version).toBe(4);
    });
  });

  describe('Optimistic Concurrency Control (Version Conflict Detection)', () => {
    it('throws OptimisticLockError when expectedVersion does not match current version', async () => {
      const created = await repository.create({
        name: 'Conflict Item',
        sku: 'CONF-01',
        price_usd: 100.0,
      });

      // User A updates entity from version 1 -> 2
      await repository.update(created.id, 1, { price_usd: 110.0 });

      // User B attempts to update with stale version 1
      await expect(
        repository.update(created.id, 1, { price_usd: 120.0 })
      ).rejects.toThrow(OptimisticLockError);

      try {
        await repository.update(created.id, 1, { price_usd: 120.0 });
      } catch (err) {
        expect(err).toBeInstanceOf(OptimisticLockError);
        const lockErr = err as OptimisticLockError;
        expect(lockErr.entityId).toBe(created.id);
        expect(lockErr.expectedVersion).toBe(1);
        expect(lockErr.actualVersion).toBe(2);
      }
    });

    it('throws EntityNotFoundError when updating a non-existent entity', async () => {
      await expect(
        repository.update('018f6c4c-3500-7fa1-b1e2-999999999999', 1, { price_usd: 50.0 })
      ).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('Soft Deletion and Restoration Cycle', () => {
    it('soft-deletes entity, populates deleted_at timestamp, and increments version', async () => {
      const created = await repository.create({
        name: 'Soft Delete Item',
        sku: 'SD-100',
        price_usd: 50.0,
      });

      const softDeleted = await repository.softDelete(created.id, 1);

      expect(softDeleted.deleted_at).not.toBeNull();
      expect(new Date(softDeleted.deleted_at!).getTime()).toBeGreaterThan(0);
      expect(softDeleted.version).toBe(2);

      // By default, findById should not return soft-deleted records
      const defaultLookup = await repository.findById(created.id);
      expect(defaultLookup).toBeNull();

      // When includeDeleted is true, record is retrievable
      const withDeleted = await repository.findById(created.id, { includeDeleted: true });
      expect(withDeleted).not.toBeNull();
      expect(withDeleted!.id).toBe(created.id);
    });

    it('restores soft-deleted entity, clears deleted_at, and increments version', async () => {
      const created = await repository.create({
        name: 'Restorable Item',
        sku: 'RST-100',
        price_usd: 75.0,
      });

      await repository.softDelete(created.id, 1);

      // Restore entity (expected version 2 -> 3)
      const restored = await repository.restore(created.id, 2);

      expect(restored.deleted_at).toBeNull();
      expect(restored.version).toBe(3);

      // Should now be retrievable by normal findById
      const normalLookup = await repository.findById(created.id);
      expect(normalLookup).not.toBeNull();
      expect(normalLookup!.id).toBe(created.id);
    });

    it('rejects softDelete on already soft-deleted entity with EntityNotFoundError', async () => {
      const created = await repository.create({
        name: 'Item',
        sku: 'ITM-1',
        price_usd: 10.0,
      });

      await repository.softDelete(created.id, 1);

      // Subsequent attempt without includeDeleted
      await expect(repository.softDelete(created.id, 2)).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('Multi-Tenant Isolation and Filtering', () => {
    it('isolates entity lookups strictly by company_id', async () => {
      const companyA = '018f6c4c-3500-7fa1-b1e2-aaaaaaaaaaaa';
      const companyB = '018f6c4c-3500-7fa1-b1e2-bbbbbbbbbbbb';

      const repoA = new TestProductRepository({ defaultCompanyId: companyA });
      const repoB = new TestProductRepository({ defaultCompanyId: companyB });

      const itemA = await repoA.create({
        name: 'Company A Secret Product',
        sku: 'SEC-A',
        price_usd: 1000.0,
      });

      // Tenant A can find its item
      expect(await repoA.findById(itemA.id)).not.toBeNull();

      // Tenant B cannot find Tenant A item (cross-tenant leak prevention)
      expect(await repoB.findById(itemA.id)).toBeNull();
    });

    it('paginates query results with limit, offset, and total metadata', async () => {
      for (let i = 1; i <= 5; i++) {
        await repository.create({
          name: `Batch Product ${i}`,
          sku: `SKU-${i}`,
          price_usd: i * 10,
        });
      }

      const page1 = await repository.findPaginated({ limit: 2, offset: 0 });
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.hasMore).toBe(true);

      const page2 = await repository.findPaginated({ limit: 2, offset: 2 });
      expect(page2.items).toHaveLength(2);
      expect(page2.offset).toBe(2);
      expect(page2.hasMore).toBe(true);

      const page3 = await repository.findPaginated({ limit: 2, offset: 4 });
      expect(page3.items).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
    });
  });

  describe('SQL Migration Files & Trigger Definitions Integrity', () => {
    it('verifies db/migrations/003_base_columns_and_triggers.sql contains trigger and validation functions', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'db/migrations/003_base_columns_and_triggers.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION update_timestamp_and_version()');
      expect(sql).toContain('NEW.updated_at = clock_timestamp();');
      expect(sql).toContain('NEW.version = OLD.version + 1;');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION attach_standard_table_triggers');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION validate_table_has_base_columns');
    });

    it('verifies supabase/migrations/20261103000007_base_columns_and_triggers.sql contains immutable column guards', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261103000007_base_columns_and_triggers.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('NEW.id = OLD.id;');
      expect(sql).toContain('NEW.company_id = OLD.company_id;');
      expect(sql).toContain('NEW.created_at = OLD.created_at;');
    });
  });
});
