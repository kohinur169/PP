// path: tests/database/client.test.ts
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getSupabaseClient,
  withTenantTransaction,
  checkDatabaseHealth,
} from '@/lib/database';
import type { TenantContext } from '@/lib/database';

describe('Database Connection Pooling & Edge-Compatible Client (Step 010)', () => {
  describe('Supabase Client Singleton', () => {
    it('should initialize and return an edge-compatible Supabase client instance', () => {
      const client = getSupabaseClient();
      expect(client).toBeDefined();
      expect(client.from).toBeTypeOf('function');
      expect(client.auth).toBeDefined();
    });

    it('should return the same singleton instance on consecutive calls', () => {
      const client1 = getSupabaseClient();
      const client2 = getSupabaseClient();
      expect(client1).toBe(client2);
    });
  });

  describe('withTenantTransaction Transaction Wrapper', () => {
    it('should execute callback with injected sessionSql matching the tenant context', async () => {
      const context: TenantContext = {
        tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
        userId: '018f6c4c-4500-7fa1-b1e2-987654321def',
      };

      let capturedSessionSql = '';

      const result = await withTenantTransaction(context, async (tx) => {
        capturedSessionSql = tx.sessionSql;
        return { processed: true, rowsUpdated: 1 };
      });

      expect(result.processed).toBe(true);
      expect(result.rowsUpdated).toBe(1);
      expect(capturedSessionSql).toContain(
        "SET LOCAL app.current_tenant_id = '018f6c4c-3500-7fa1-b1e2-123456789abc';"
      );
      expect(capturedSessionSql).toContain(
        "SET LOCAL app.current_user_id = '018f6c4c-4500-7fa1-b1e2-987654321def';"
      );
    });

    it('should bubble up error on transaction failure allowing caller rollback handling', async () => {
      const context: TenantContext = {
        tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      };

      await expect(
        withTenantTransaction(context, async () => {
          throw new Error('Deadlock detected / Unique constraint failed');
        })
      ).rejects.toThrowError('Deadlock detected / Unique constraint failed');
    });
  });

  describe('Database Health Check Utility', () => {
    it('should report healthy status when database responds successfully', async () => {
      const mockClient = {
        from: () => ({
          select: () => ({
            limit: () => Promise.resolve({ data: [{ id: '018f6c4c' }], error: null }),
          }),
        }),
      } as unknown as SupabaseClient;

      const health = await checkDatabaseHealth({ client: mockClient });

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.version).toContain('PostgreSQL');
      expect(health.error).toBeUndefined();
      expect(new Date(health.timestamp).toISOString()).toBe(health.timestamp);
    });

    it('should report unhealthy status and error message when database query fails or times out', async () => {
      const mockFailingClient = {
        from: () => ({
          select: () => ({
            limit: () =>
              Promise.resolve({
                data: null,
                error: { message: 'connection refused / network unreachable' },
              }),
          }),
        }),
      } as unknown as SupabaseClient;

      const health = await checkDatabaseHealth({ client: mockFailingClient });

      expect(health.healthy).toBe(false);
      expect(health.error).toBe('connection refused / network unreachable');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
