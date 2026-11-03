// path: lib/audit/hasher.ts

import crypto from 'node:crypto';
import { GENESIS_HASH } from '../../types/audit';

/**
 * Deterministically canonicalizes an arbitrary JSON-compatible object or value.
 * Sorts object keys recursively to ensure bit-level reproducibility of hashes.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalizeJson(item)).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalizeJson((value as Record<string, unknown>)[key])}`
  );
  return '{' + entries.join(',') + '}';
}

/**
 * Computes a cryptographic SHA-256 hash chaining an audit entry to the prior log hash.
 * Formula: SHA256(prev_hash + ":" + sequence_id + ":" + canonicalJson(payload))
 *
 * @param prevHash - SHA-256 hex string of the prior entry or GENESIS_HASH for first entry
 * @param sequenceId - Monotonic sequence ID number
 * @param payload - Structured contextual payload object or canonical string
 * @returns 64-character lowercase hexadecimal SHA-256 hash
 */
export function computeAuditHash(
  prevHash: string,
  sequenceId: number | bigint,
  payload: Record<string, unknown> | string
): string {
  const canonicalPayload = typeof payload === 'string' ? payload : canonicalizeJson(payload);
  const message = `${prevHash}:${sequenceId.toString()}:${canonicalPayload}`;
  return crypto.createHash('sha256').update(message, 'utf8').digest('hex');
}

/**
 * Verifies that a given audit log entry's current_hash matches the cryptographic
 * hash of its prev_hash, sequence_id, and payload.
 *
 * @param entry - Audit log entry with prev_hash, sequence_id, payload, and current_hash
 * @returns true if the hash matches, false if tampered
 */
export function verifyAuditHash(entry: {
  readonly prev_hash: string;
  readonly sequence_id: number | bigint;
  readonly payload: Record<string, unknown> | string;
  readonly current_hash: string;
}): boolean {
  if (!entry.current_hash || !entry.prev_hash) {
    return false;
  }
  const calculated = computeAuditHash(entry.prev_hash, entry.sequence_id, entry.payload);
  return calculated.toLowerCase() === entry.current_hash.toLowerCase();
}
