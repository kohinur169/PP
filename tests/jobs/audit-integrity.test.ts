// path: tests/jobs/audit-integrity.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  runAuditIntegrityHashJob,
  computeEntryHash,
  computeMerkleRoot,
  seedAuditChain,
  resetAuditIntegrityStore,
  AuditLogItem,
} from '@/lib/jobs/audit-integrity';

describe('Audit Hash Integrity Worker & Tamper Detection Engine (Step 160)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const genesisHash = '0000000000000000000000000000000000000000000000000000000000000000';

  beforeEach(() => {
    resetAuditIntegrityStore();
  });

  describe('Valid Hash Chain Verification & Merkle Root Signing (Step 160.1)', () => {
    it('verifies sequential hash-chained audit logs and computes signed Merkle root', async () => {
      // Entry 1
      const e1CreatedAt = '2026-11-05T10:00:00Z';
      const e1Hash = computeEntryHash(
        genesisHash,
        'user_1',
        'MERCHANT_LOGIN',
        'user',
        'user_1',
        'hash_p1',
        e1CreatedAt
      );
      const entry1: AuditLogItem = {
        id: 'log_001',
        tenantId,
        actorId: 'user_1',
        action: 'MERCHANT_LOGIN',
        entityType: 'user',
        entityId: 'user_1',
        payloadHash: 'hash_p1',
        prevHash: genesisHash,
        currentHash: e1Hash,
        createdAt: e1CreatedAt,
      };

      // Entry 2
      const e2CreatedAt = '2026-11-05T10:05:00Z';
      const e2Hash = computeEntryHash(
        e1Hash,
        'user_1',
        'PAYMENT_INTENT_CREATED',
        'payment_intent',
        'pi_88',
        'hash_p2',
        e2CreatedAt
      );
      const entry2: AuditLogItem = {
        id: 'log_002',
        tenantId,
        actorId: 'user_1',
        action: 'PAYMENT_INTENT_CREATED',
        entityType: 'payment_intent',
        entityId: 'pi_88',
        payloadHash: 'hash_p2',
        prevHash: e1Hash,
        currentHash: e2Hash,
        createdAt: e2CreatedAt,
      };

      seedAuditChain(tenantId, [entry1, entry2]);

      const summary = await runAuditIntegrityHashJob(tenantId, '2026-11-05');

      expect(summary.inspectedCount).toBe(2);
      expect(summary.isValidChain).toBe(true);
      expect(summary.tamperedEntryId).toBeUndefined();
      expect(summary.merkleRoot).toHaveLength(64); // SHA-256 hex
      expect(summary.signature).toBeDefined();
    });
  });

  describe('Tamper Detection Invariants (Step 160.2)', () => {
    it('detects altered payload in middle entry and breaks the chain', async () => {
      // Entry 1
      const e1CreatedAt = '2026-11-05T10:00:00Z';
      const e1Hash = computeEntryHash(genesisHash, 'user_1', 'LOGIN', 'user', 'user_1', 'h1', e1CreatedAt);
      const entry1: AuditLogItem = {
        id: 'log_001',
        tenantId,
        actorId: 'user_1',
        action: 'LOGIN',
        entityType: 'user',
        entityId: 'user_1',
        payloadHash: 'h1',
        prevHash: genesisHash,
        currentHash: e1Hash,
        createdAt: e1CreatedAt,
      };

      // Entry 2 - Tampered: payloadHash changed to 'h2_tampered' but currentHash not updated
      const entry2: AuditLogItem = {
        id: 'log_002',
        tenantId,
        actorId: 'user_1',
        action: 'PAYMENT',
        entityType: 'payment',
        entityId: 'p_1',
        payloadHash: 'h2_tampered', // TAMPERED!
        prevHash: e1Hash,
        currentHash: 'e2_original_hash',
        createdAt: '2026-11-05T10:05:00Z',
      };

      seedAuditChain(tenantId, [entry1, entry2]);

      const summary = await runAuditIntegrityHashJob(tenantId, '2026-11-05');

      expect(summary.isValidChain).toBe(false);
      expect(summary.tamperedEntryId).toBe('log_002');
      expect(summary.merkleRoot).toBe('TAMPERED_INVALID_ROOT');
    });

    it('detects broken previous hash pointer link', async () => {
      const entry1: AuditLogItem = {
        id: 'log_001',
        tenantId,
        actorId: 'user_1',
        action: 'LOGIN',
        entityType: 'user',
        entityId: 'user_1',
        payloadHash: 'h1',
        prevHash: 'corrupted_prev_hash', // Corrupted genesis pointer
        currentHash: 'some_hash',
        createdAt: '2026-11-05T10:00:00Z',
      };

      seedAuditChain(tenantId, [entry1]);

      const summary = await runAuditIntegrityHashJob(tenantId, '2026-11-05');
      expect(summary.isValidChain).toBe(false);
      expect(summary.tamperedEntryId).toBe('log_001');
    });
  });

  describe('Merkle Root Tree Logic (Step 160.3)', () => {
    it('computes consistent Merkle roots for odd and even leaf counts', () => {
      const leafA = 'a'.repeat(64);
      const leafB = 'b'.repeat(64);
      const leafC = 'c'.repeat(64);

      const root2 = computeMerkleRoot([leafA, leafB]);
      const root3 = computeMerkleRoot([leafA, leafB, leafC]);

      expect(root2).toHaveLength(64);
      expect(root3).toHaveLength(64);
      expect(root2).not.toBe(root3);
    });
  });
});
