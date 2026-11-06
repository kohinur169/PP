// path: lib/security/audit-signer.ts

import crypto from 'node:crypto';
import { computeAuditHash, verifyAuditHash } from '../audit/hasher';
import {
  AuditLogEntity,
  CreateAuditLogInput,
  GENESIS_HASH,
} from '../../types/audit';
import { generateUuidV7 } from '../db/uuidv7';

/**
 * Keypair representation in PEM encoding.
 */
export interface AuditKeyPairPem {
  readonly privateKey: string;
  readonly publicKey: string;
}

/**
 * Cached fallback platform keypair for development/test environments.
 */
let cachedDevelopmentKeyPair: {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
} | null = null;

/**
 * Generates a fresh Ed25519 asymmetric cryptographic keypair.
 * Returns standard PEM-encoded PKCS#8 private key and SPKI public key.
 */
export function generateAuditKeyPair(): AuditKeyPairPem {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    privateKey,
    publicKey,
  };
}

/**
 * Parses a flexible private key input (PEM string, base64 DER string, or KeyObject).
 */
export function parsePrivateKey(keyInput: string | crypto.KeyObject): crypto.KeyObject {
  if (typeof keyInput !== 'string') {
    return keyInput;
  }
  const trimmed = keyInput.trim();
  if (trimmed.includes('-----BEGIN')) {
    return crypto.createPrivateKey(trimmed);
  }
  try {
    return crypto.createPrivateKey({
      key: Buffer.from(trimmed, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
  } catch {
    return crypto.createPrivateKey(trimmed);
  }
}

/**
 * Parses a flexible public key input (PEM string, base64 DER string, or KeyObject).
 */
export function parsePublicKey(keyInput: string | crypto.KeyObject): crypto.KeyObject {
  if (typeof keyInput !== 'string') {
    return keyInput;
  }
  const trimmed = keyInput.trim();
  if (trimmed.includes('-----BEGIN')) {
    return crypto.createPublicKey(trimmed);
  }
  try {
    return crypto.createPublicKey({
      key: Buffer.from(trimmed, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch {
    return crypto.createPublicKey(trimmed);
  }
}

/**
 * Resolves the platform Ed25519 signing keypair from environment variables
 * or initializes an ephemeral keypair for non-production environments.
 */
export function getPlatformAuditSigningKeyPair(): {
  readonly privateKey: crypto.KeyObject;
  readonly publicKey: crypto.KeyObject;
} {
  const envPrivate = process.env.AUDIT_SIGNING_PRIVATE_KEY;
  const envPublic = process.env.AUDIT_SIGNING_PUBLIC_KEY;

  if (envPrivate) {
    const privateKey = parsePrivateKey(envPrivate);
    const publicKey = envPublic
      ? parsePublicKey(envPublic)
      : crypto.createPublicKey(privateKey);
    return { privateKey, publicKey };
  }

  // Fallback for test/development environments
  if (!cachedDevelopmentKeyPair) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    cachedDevelopmentKeyPair = { privateKey, publicKey };
  }

  return cachedDevelopmentKeyPair;
}

/**
 * Step 026.1: Asymmetrically signs an audit entry hash using the Ed25519 algorithm.
 *
 * @param entryHash - 64-character SHA-256 hex string of the audit entry.
 * @param privateKeyInput - Optional private key (defaults to platform signing key).
 * @returns Base64-encoded 64-byte Ed25519 signature.
 */
export function signAuditEntry(
  entryHash: string,
  privateKeyInput?: string | crypto.KeyObject
): string {
  if (!entryHash || typeof entryHash !== 'string') {
    throw new Error('Invalid audit entry hash provided for signing.');
  }

  const privateKey = privateKeyInput
    ? parsePrivateKey(privateKeyInput)
    : getPlatformAuditSigningKeyPair().privateKey;

  const data = Buffer.from(entryHash, 'utf8');
  const signatureBuffer = crypto.sign(null, data, privateKey);
  return signatureBuffer.toString('base64');
}

/**
 * Step 026.2: Verifies an Ed25519 asymmetric cryptographic signature for an audit entry hash.
 *
 * @param entryHash - 64-character SHA-256 hex string of the audit entry.
 * @param signature - Base64-encoded signature to verify.
 * @param publicKeyInput - Optional public key (defaults to platform public key).
 * @returns true if valid, false if invalid or tampered.
 */
export function verifyAuditSignature(
  entryHash: string,
  signature: string,
  publicKeyInput?: string | crypto.KeyObject
): boolean {
  if (!entryHash || !signature) {
    return false;
  }

  try {
    const publicKey = publicKeyInput
      ? parsePublicKey(publicKeyInput)
      : getPlatformAuditSigningKeyPair().publicKey;

    const data = Buffer.from(entryHash, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'base64');

    // Ed25519 signatures are exactly 64 bytes
    if (signatureBuffer.length !== 64) {
      return false;
    }

    return crypto.verify(null, data, publicKey, signatureBuffer);
  } catch {
    return false;
  }
}

/**
 * Step 026.3: Automated factory creating an audit entry with computed SHA-256 hash and Ed25519 signature.
 * Formula: current_hash = SHA256(prev_hash + ":" + sequence_id + ":" + canonicalJson(payload))
 * Signature: Ed25519(current_hash)
 */
export function createSignedAuditEntry(
  input: {
    readonly id?: string | undefined;
    readonly sequence_id: number;
    readonly prev_hash?: string | undefined;
    readonly company_id?: string | null | undefined;
    readonly actor_id?: string | null | undefined;
    readonly action: string;
    readonly entity_type: string;
    readonly entity_id?: string | null | undefined;
    readonly diff_payload?: Record<string, unknown> | null | undefined;
    readonly payload?: Record<string, unknown> | undefined;
    readonly ip_address?: string | null | undefined;
    readonly user_agent?: string | null | undefined;
  },
  options?: {
    readonly privateKey?: string | crypto.KeyObject | undefined;
  }
): AuditLogEntity {
  const prevHash = input.prev_hash ?? GENESIS_HASH;
  const payload = input.payload ?? {};
  const currentHash = computeAuditHash(prevHash, input.sequence_id, payload);
  const signature = signAuditEntry(currentHash, options?.privateKey);
  const now = new Date().toISOString();

  return {
    id: input.id ?? generateUuidV7(),
    sequence_id: input.sequence_id,
    company_id: input.company_id ?? '00000000-0000-0000-0000-000000000000',
    actor_id: input.actor_id ?? null,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    diff_payload: (input.diff_payload as any) ?? null,
    payload,
    prev_hash: prevHash,
    current_hash: currentHash,
    entry_hash: currentHash,
    signature,
    ip_address: input.ip_address ?? null,
    user_agent: input.user_agent ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    version: 1,
  };
}

/**
 * Verifies both the hash chain calculation and the Ed25519 asymmetric signature of an audit entry.
 */
export function verifySignedAuditEntry(
  entry: AuditLogEntity,
  publicKeyInput?: string | crypto.KeyObject
): boolean {
  // 1. Verify hash integrity
  const isHashValid = verifyAuditHash({
    prev_hash: entry.prev_hash,
    sequence_id: entry.sequence_id,
    payload: entry.payload,
    current_hash: entry.current_hash,
  });

  if (!isHashValid) {
    return false;
  }

  // 2. Verify cryptographic signature if present
  if (!entry.signature) {
    return false;
  }

  return verifyAuditSignature(entry.current_hash, entry.signature, publicKeyInput);
}
