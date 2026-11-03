// path: tests/audit/signer.test.ts

import { describe, it, expect } from 'vitest';
import {
  generateAuditKeyPair,
  signAuditEntry,
  verifyAuditSignature,
  createSignedAuditEntry,
  verifySignedAuditEntry,
  getPlatformAuditSigningKeyPair,
  parsePrivateKey,
  parsePublicKey,
} from '../../lib/security/audit-signer';
import { computeAuditHash } from '../../lib/audit/hasher';
import { GENESIS_HASH } from '../../types/audit';
import { AuditLogRepository } from '../../lib/db/audit';

describe('Step 026: Ed25519 Cryptographic Audit Log Signing Engine', () => {
  describe('Key Generation & Key Parsing', () => {
    it('generates standard PKCS#8 private key and SPKI public key in PEM format', () => {
      const keypair = generateAuditKeyPair();

      expect(keypair.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
      expect(keypair.privateKey).toContain('-----END PRIVATE KEY-----');
      expect(keypair.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(keypair.publicKey).toContain('-----END PUBLIC KEY-----');
    });

    it('parses PEM strings and KeyObjects interchangeably', () => {
      const { privateKey, publicKey } = generateAuditKeyPair();

      const privObj = parsePrivateKey(privateKey);
      const pubObj = parsePublicKey(publicKey);

      expect(privObj).toBeDefined();
      expect(pubObj).toBeDefined();
      expect(privObj.asymmetricKeyType).toBe('ed25519');
      expect(pubObj.asymmetricKeyType).toBe('ed25519');
    });

    it('resolves platform signing keypair singleton from environment or fallback', () => {
      const platformKey = getPlatformAuditSigningKeyPair();

      expect(platformKey.privateKey).toBeDefined();
      expect(platformKey.publicKey).toBeDefined();
      expect(platformKey.privateKey.asymmetricKeyType).toBe('ed25519');
      expect(platformKey.publicKey.asymmetricKeyType).toBe('ed25519');
    });
  });

  describe('Step 026.1 & 026.2: Sign & Verify Engine', () => {
    it('signs an audit hash with Ed25519 and produces an 88-character base64 signature', () => {
      const { privateKey } = generateAuditKeyPair();
      const testHash = 'a'.repeat(64);

      const signature = signAuditEntry(testHash, privateKey);

      expect(typeof signature).toBe('string');
      // 64-byte Ed25519 signature in base64 is 88 characters (including padding)
      expect(signature).toHaveLength(88);
    });

    it('verifies valid signature against the matching public key', () => {
      const { privateKey, publicKey } = generateAuditKeyPair();
      const testHash = 'b'.repeat(64);

      const signature = signAuditEntry(testHash, privateKey);
      const isValid = verifyAuditSignature(testHash, signature, publicKey);

      expect(isValid).toBe(true);
    });

    it('rejects signature if verified against a different public key', () => {
      const keypairA = generateAuditKeyPair();
      const keypairB = generateAuditKeyPair();
      const testHash = 'c'.repeat(64);

      const signature = signAuditEntry(testHash, keypairA.privateKey);
      const isValid = verifyAuditSignature(testHash, signature, keypairB.publicKey);

      expect(isValid).toBe(false);
    });

    it('rejects tampered or corrupt signature strings', () => {
      const { publicKey } = generateAuditKeyPair();
      const testHash = 'd'.repeat(64);

      expect(verifyAuditSignature(testHash, 'corrupted_sig', publicKey)).toBe(false);
      expect(verifyAuditSignature(testHash, '', publicKey)).toBe(false);
      expect(verifyAuditSignature(testHash, 'A'.repeat(88), publicKey)).toBe(false);
    });

    it('throws error when attempting to sign with empty or invalid hash', () => {
      expect(() => signAuditEntry('')).toThrow(/Invalid audit entry hash/);
      expect(() => signAuditEntry(null as any)).toThrow(/Invalid audit entry hash/);
    });
  });

  describe('Quality Gate: 1-Character Modification Rejection', () => {
    it('signs test audit payload and returns false when payload is modified by 1 character', () => {
      const { privateKey, publicKey } = generateAuditKeyPair();
      const sequenceId = 1;
      const prevHash = GENESIS_HASH;

      const originalPayload = {
        action: 'PAYMENT_CAPTURED',
        amount: '500.0000',
        currency: 'USD',
        submerchant_id: 'sub_001',
      };

      // 1. Compute original hash and sign it
      const originalHash = computeAuditHash(prevHash, sequenceId, originalPayload);
      const signature = signAuditEntry(originalHash, privateKey);

      // Verify original succeeds
      expect(verifyAuditSignature(originalHash, signature, publicKey)).toBe(true);

      // 2. Modify payload by exactly 1 character (change '500.0000' to '500.0001')
      const tamperedPayload = {
        action: 'PAYMENT_CAPTURED',
        amount: '500.0001', // exactly 1 character mutated
        currency: 'USD',
        submerchant_id: 'sub_001',
      };

      const tamperedHash = computeAuditHash(prevHash, sequenceId, tamperedPayload);

      // Hashes must differ
      expect(tamperedHash).not.toBe(originalHash);

      // 3. Verifying the original signature against the tampered hash MUST return false
      const isTamperedValid = verifyAuditSignature(tamperedHash, signature, publicKey);
      expect(isTamperedValid).toBe(false);
    });
  });

  describe('Step 026.3: Automated Audit Entry Factory', () => {
    it('creates an audit entry computing current_hash and generating Ed25519 signature', () => {
      const { privateKey, publicKey } = generateAuditKeyPair();
      const entry = createSignedAuditEntry(
        {
          sequence_id: 1,
          action: 'KYC_VERIFICATION_DECISION',
          entity_type: 'company',
          entity_id: '018f6c4c-3500-7fa1-b1e2-aaaaaaaaaaaa',
          payload: {
            reviewer: 'compliance_officer_1',
            decision: 'approved',
          },
        },
        { privateKey }
      );

      expect(entry.sequence_id).toBe(1);
      expect(entry.prev_hash).toBe(GENESIS_HASH);
      expect(entry.current_hash).toHaveLength(64);
      expect(entry.signature).toBeDefined();
      expect(entry.signature).toHaveLength(88);

      // Verify the entire signed entry
      const isVerified = verifySignedAuditEntry(entry, publicKey);
      expect(isVerified).toBe(true);
    });

    it('rejects signed audit entry if payload is altered after generation', () => {
      const { privateKey, publicKey } = generateAuditKeyPair();
      const entry = createSignedAuditEntry(
        {
          sequence_id: 2,
          prev_hash: '1'.repeat(64),
          action: 'RISK_TIER_CHANGED',
          entity_type: 'company',
          payload: {
            old_tier: 'tier_1',
            new_tier: 'tier_2',
          },
        },
        { privateKey }
      );

      // Tamper with payload
      const tamperedEntry = {
        ...entry,
        payload: {
          old_tier: 'tier_1',
          new_tier: 'tier_3', // tampered
        },
      };

      const isValid = verifySignedAuditEntry(tamperedEntry, publicKey);
      expect(isValid).toBe(false);
    });
  });

  describe('Repository Integration: Automatic Signing', () => {
    it('automatically generates verifiable Ed25519 signature on AuditLogRepository.append()', async () => {
      const repository = new AuditLogRepository();
      const entry = await repository.append({
        action: 'COMPANY_CREATED',
        entity_type: 'company',
        payload: {
          legal_name: 'Acme Global Ltd',
          country: 'BGD',
        },
      });

      expect(entry.signature).toBeDefined();
      expect(entry.signature).toHaveLength(88);

      // Verify using platform public key
      const platformKey = getPlatformAuditSigningKeyPair();
      const isSignatureValid = verifyAuditSignature(
        entry.current_hash,
        entry.signature!,
        platformKey.publicKey
      );
      expect(isSignatureValid).toBe(true);
    });
  });
});
