// path: tests/security/merkle.test.ts

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  calculateMerkleRoot,
  generateProof,
  generateMerkleProof,
  verifyMerkleProof,
  hashMerklePair,
} from '../../lib/security/merkle';
import { GENESIS_HASH } from '../../types/audit';
import { AuditMerkleRootRepository } from '../../lib/db/merkle';

describe('Step 027: Merkle Tree Audit Batch Aggregation Engine', () => {
  const generateHash = (input: string): string =>
    crypto.createHash('sha256').update(input, 'utf8').digest('hex');

  describe('Merkle Root Computation Across Varying Leaf Counts', () => {
    it('returns GENESIS_HASH for an empty leaf array', () => {
      const root = calculateMerkleRoot([]);
      expect(root).toBe(GENESIS_HASH);
    });

    it('returns the leaf itself for a single leaf', () => {
      const leaf = generateHash('single_entry');
      const root = calculateMerkleRoot([leaf]);
      expect(root).toBe(leaf);
    });

    it('calculates root for even leaf counts (2 leaves)', () => {
      const leaf0 = generateHash('entry_0');
      const leaf1 = generateHash('entry_1');
      const expectedRoot = hashMerklePair(leaf0, leaf1);

      const root = calculateMerkleRoot([leaf0, leaf1]);
      expect(root).toBe(expectedRoot);
    });

    it('calculates root for odd leaf counts (3 leaves) by duplicating the last node', () => {
      const leaf0 = generateHash('entry_0');
      const leaf1 = generateHash('entry_1');
      const leaf2 = generateHash('entry_2');

      const parent0 = hashMerklePair(leaf0, leaf1);
      const parent1 = hashMerklePair(leaf2, leaf2);
      const expectedRoot = hashMerklePair(parent0, parent1);

      const root = calculateMerkleRoot([leaf0, leaf1, leaf2]);
      expect(root).toBe(expectedRoot);
    });

    it('calculates root for power-of-two leaf count (4 leaves)', () => {
      const leaves = Array.from({ length: 4 }, (_, i) => generateHash(`log_${i}`));
      const parent0 = hashMerklePair(leaves[0]!, leaves[1]!);
      const parent1 = hashMerklePair(leaves[2]!, leaves[3]!);
      const expectedRoot = hashMerklePair(parent0, parent1);

      const root = calculateMerkleRoot(leaves);
      expect(root).toBe(expectedRoot);
    });
  });

  describe('Merkle Proof Generation & Verification', () => {
    it('generates empty proof for single leaf and verifies successfully', () => {
      const leaf = generateHash('single_leaf');
      const root = calculateMerkleRoot([leaf]);
      const proof = generateProof([leaf], 0);

      expect(proof).toHaveLength(0);
      expect(verifyMerkleProof(root, leaf, proof)).toBe(true);
    });

    it('generates valid proofs for all leaves in an odd-sized tree (5 leaves)', () => {
      const leaves = Array.from({ length: 5 }, (_, i) => generateHash(`log_odd_${i}`));
      const root = calculateMerkleRoot(leaves);

      for (let i = 0; i < leaves.length; i++) {
        const proof = generateProof(leaves, i);
        expect(proof.length).toBeGreaterThan(0);
        const isValid = verifyMerkleProof(root, leaves[i]!, proof);
        expect(isValid).toBe(true);
      }
    });

    it('generates valid proofs for all leaves in an even-sized tree (6 leaves)', () => {
      const leaves = Array.from({ length: 6 }, (_, i) => generateHash(`log_even_${i}`));
      const root = calculateMerkleRoot(leaves);

      for (let i = 0; i < leaves.length; i++) {
        const proof = generateProof(leaves, i);
        const isValid = verifyMerkleProof(root, leaves[i]!, proof);
        expect(isValid).toBe(true);
      }
    });

    it('throws error when generating proof for out-of-bounds index', () => {
      const leaves = [generateHash('a'), generateHash('b')];
      expect(() => generateProof(leaves, -1)).toThrow(/out of bounds/);
      expect(() => generateProof(leaves, 2)).toThrow(/out of bounds/);
    });

    it('verifies using generateMerkleProof wrapper object', () => {
      const leaves = Array.from({ length: 8 }, (_, i) => generateHash(`leaf_${i}`));
      const merkleProof = generateMerkleProof(leaves, 3);

      expect(merkleProof.leaf).toBe(leaves[3]);
      expect(merkleProof.index).toBe(3);
      expect(verifyMerkleProof(merkleProof.root, merkleProof.leaf, merkleProof)).toBe(true);
    });
  });

  describe('Quality Gate Verification: 1,000 Sample Audit Logs', () => {
    it('generates Merkle tree for 1,000 sample audit logs; verifies valid proof accepts and altered leaf rejects', () => {
      // 1. Generate 1,000 distinct pseudo-random SHA-256 hashes representing a day of audit logs
      const sampleCount = 1000;
      const leaves = Array.from({ length: sampleCount }, (_, i) =>
        generateHash(`audit_log_sample_payload_sequence_${i}_timestamp_20261103`)
      );

      // 2. Compute 32-byte Merkle root
      const root = calculateMerkleRoot(leaves);
      expect(root).toHaveLength(64);
      expect(root).toMatch(/^[a-f0-9]{64}$/);

      // 3. Test verification across diverse boundary and interior indices
      const testIndices = [0, 1, 249, 500, 750, 998, 999];

      for (const idx of testIndices) {
        const targetLeaf = leaves[idx]!;
        const proof = generateProof(leaves, idx);

        // Valid proof MUST accept
        const accepted = verifyMerkleProof(root, targetLeaf, proof);
        expect(accepted).toBe(true);

        // Altered leaf MUST reject (mutate by replacing 1 character)
        const alteredLeaf =
          targetLeaf.slice(0, -1) + (targetLeaf.endsWith('0') ? '1' : '0');
        const rejectedAlteredLeaf = verifyMerkleProof(root, alteredLeaf, proof);
        expect(rejectedAlteredLeaf).toBe(false);

        // Corrupted proof step MUST reject
        if (proof.length > 0) {
          const corruptedProof = [
            {
              ...proof[0]!,
              hash: 'f'.repeat(64),
            },
            ...proof.slice(1),
          ];
          const rejectedCorruptedProof = verifyMerkleProof(root, targetLeaf, corruptedProof);
          expect(rejectedCorruptedProof).toBe(false);
        }
      }
    });
  });

  describe('Database Schema & Repository Operations', () => {
    it('verifies db/migrations/011_audit_merkle_roots.sql defines schema, indexes, and RLS', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'db/migrations/011_audit_merkle_roots.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Table definition
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.audit_merkle_roots');
      expect(sql).toContain('batch_date date NOT NULL');
      expect(sql).toContain('merkle_root varchar(64) NOT NULL');
      expect(sql).toContain('entry_count int NOT NULL');
      expect(sql).toContain('first_sequence_id bigint NOT NULL');
      expect(sql).toContain('last_sequence_id bigint NOT NULL');

      // Indexes
      expect(sql).toContain('uq_audit_merkle_roots_batch_date');
      expect(sql).toContain('idx_audit_merkle_roots_batch_date');
      expect(sql).toContain('idx_audit_merkle_roots_company_id');
      expect(sql).toContain('idx_audit_merkle_roots_merkle_root');
      expect(sql).toContain('idx_audit_merkle_roots_sequences');

      // RLS
      expect(sql).toContain('ALTER TABLE public.audit_merkle_roots ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE public.audit_merkle_roots FORCE ROW LEVEL SECURITY');
      expect(sql).toContain('pol_audit_merkle_roots_tenant_isolation');
    });

    it('records and queries daily batch Merkle roots via AuditMerkleRootRepository', async () => {
      const repository = new AuditMerkleRootRepository();
      const mockRoot = 'a'.repeat(64);

      const record = await repository.recordBatchRoot({
        batch_date: '2026-11-03',
        merkle_root: mockRoot,
        entry_count: 1000,
        first_sequence_id: 1,
        last_sequence_id: 1000,
      });

      expect(record.id).toBeDefined();
      expect(record.batch_date).toBe('2026-11-03');
      expect(record.merkle_root).toBe(mockRoot);
      expect(record.entry_count).toBe(1000);

      const fetched = await repository.findByDate('2026-11-03');
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(record.id);

      const latest = await repository.getLatestRoot();
      expect(latest).not.toBeNull();
      expect(latest?.batch_date).toBe('2026-11-03');
    });
  });
});
