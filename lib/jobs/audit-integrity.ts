// path: lib/jobs/audit-integrity.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { signAuditEntry } from '@/lib/security/audit-signer';

export interface AuditLogItem {
  id: string;
  tenantId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  payloadHash: string;
  prevHash: string;
  currentHash: string;
  createdAt: string;
}

export interface MerkleRootPublishRecord {
  id: string;
  tenantId: string;
  dateStr: string; // YYYY-MM-DD
  leafCount: number;
  merkleRoot: string;
  ed25519Signature: string;
  isTampered: boolean;
  tamperedEntryId?: string | undefined;
  publishedAt: string;
}

export interface AuditIntegrityJobSummary {
  inspectedCount: number;
  isValidChain: boolean;
  merkleRoot: string;
  signature: string;
  tamperedEntryId?: string | undefined;
}

const auditChainStore = new Map<string, AuditLogItem[]>();
const publishedRootsStore = new Map<string, MerkleRootPublishRecord>();

/**
 * Computes canonical hash for an audit log entry.
 */
export function computeEntryHash(
  prevHash: string,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  payloadHash: string,
  createdAt: string
): string {
  const content = `${prevHash}|${actorId}|${action}|${entityType}|${entityId}|${payloadHash}|${createdAt}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively computes a Merkle root from an array of SHA-256 leaf hashes.
 */
export function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    return '0000000000000000000000000000000000000000000000000000000000000000';
  }

  let currentLevel = [...leaves];

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]!;
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1]! : left; // Duplicate last if odd count
      const combined = crypto
        .createHash('sha256')
        .update(left + right)
        .digest('hex');
      nextLevel.push(combined);
    }
    currentLevel = nextLevel;
  }

  return currentLevel[0]!;
}

/**
 * Step 160.1: Background Worker - Audit log integrity hash generation and daily Merkle root signing.
 * Section 27: "Audit log integrity hash generation."
 * Section 2: "Tamper detection: changing any entry breaks the hash chain. A daily cryptographic hash is generated and published externally."
 */
export async function runAuditIntegrityHashJob(
  tenantId: string,
  dateStr: string
): Promise<AuditIntegrityJobSummary> {
  const entries = auditChainStore.get(tenantId) ?? [];
  let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000'; // Genesis hash
  let tamperedEntryId: string | undefined;

  const leafHashes: string[] = [];

  // Verify hash-chain integrity
  for (const entry of entries) {
    if (entry.prevHash !== expectedPrevHash) {
      tamperedEntryId = entry.id;
      logger.error('CRITICAL: Audit log hash-chain tamper detected - previous hash mismatch!', {
        entryId: entry.id,
        expectedPrevHash,
        actualPrevHash: entry.prevHash,
      });
      break;
    }

    const recomputedHash = computeEntryHash(
      entry.prevHash,
      entry.actorId,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.payloadHash,
      entry.createdAt
    );

    if (recomputedHash !== entry.currentHash) {
      tamperedEntryId = entry.id;
      logger.error('CRITICAL: Audit log content tamper detected - current hash recompute mismatch!', {
        entryId: entry.id,
        expectedHash: recomputedHash,
        storedHash: entry.currentHash,
      });
      break;
    }

    leafHashes.push(entry.currentHash);
    expectedPrevHash = entry.currentHash;
  }

  const isValidChain = tamperedEntryId === undefined;
  const merkleRoot = isValidChain ? computeMerkleRoot(leafHashes) : 'TAMPERED_INVALID_ROOT';

  // Sign daily Merkle root with platform Ed25519 key
  const signature = signAuditEntry(merkleRoot);

  const now = new Date().toISOString();
  const publishRecord: MerkleRootPublishRecord = {
    id: generateUuidV7(),
    tenantId,
    dateStr,
    leafCount: leafHashes.length,
    merkleRoot,
    ed25519Signature: signature,
    isTampered: !isValidChain,
    tamperedEntryId,
    publishedAt: now,
  };

  publishedRootsStore.set(`${tenantId}:${dateStr}`, publishRecord);

  logger.info('Daily audit log Merkle root generated and published', {
    tenantId,
    dateStr,
    leafCount: leafHashes.length,
    isValidChain,
    merkleRoot,
  });

  return {
    inspectedCount: entries.length,
    isValidChain,
    merkleRoot,
    signature,
    tamperedEntryId,
  };
}

/**
 * Seed helper for test suites.
 */
export function seedAuditChain(tenantId: string, entries: AuditLogItem[]): void {
  auditChainStore.set(tenantId, entries);
}

/**
 * Resets stores for test isolation.
 */
export function resetAuditIntegrityStore(): void {
  auditChainStore.clear();
  publishedRootsStore.clear();
}
