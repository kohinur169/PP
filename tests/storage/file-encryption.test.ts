// path: tests/storage/file-encryption.test.ts

import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  encryptFileBuffer,
  decryptFileBuffer,
  isFileEncrypted,
  computeFileSha256,
  deriveCompanyFileKey,
  FILE_ENCRYPTION_MAGIC,
  HEADER_LENGTH,
  FileEncryptionError,
  FileDecryptionError,
} from '../../lib/storage/file-encryption';

describe('Step 041: Pre-Upload File Encryption Pipeline (AES-256-GCM)', () => {
  const companyA = '018f6c4c-3500-7fa1-b1e2-123456789abc';
  const companyB = '018f6c4c-3500-7fa1-b1e2-987654321def';

  // Sample payloads representing real uploaded documents
  const samplePdf = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Title (KYC Corporate Registration Document) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
    'utf8'
  );
  const sampleBinary = crypto.randomBytes(16384); // 16 KB random binary asset

  describe('Step 041.1 & Step 041.2: Round-Trip Buffer Encryption & Decryption', () => {
    it('encrypts and decrypts PDF buffer with byte-for-byte fidelity', () => {
      const encrypted = encryptFileBuffer(samplePdf, companyA);

      expect(encrypted.encryptedBuffer).toBeDefined();
      expect(encrypted.originalSizeBytes).toBe(samplePdf.length);
      expect(encrypted.encryptedSizeBytes).toBe(HEADER_LENGTH + samplePdf.length);
      expect(encrypted.version).toBe(1);
      expect(encrypted.iv).toHaveLength(24); // 12 bytes in hex
      expect(encrypted.authTag).toHaveLength(32); // 16 bytes in hex

      // Decrypt
      const decrypted = decryptFileBuffer(encrypted.encryptedBuffer, companyA);
      expect(decrypted.fileBuffer.equals(samplePdf)).toBe(true);
      expect(decrypted.fileBuffer.toString('utf8')).toBe(samplePdf.toString('utf8'));
      expect(decrypted.sizeBytes).toBe(samplePdf.length);
    });

    it('encrypts and decrypts large binary data preserving full integrity', () => {
      const encrypted = encryptFileBuffer(sampleBinary, companyA);
      const decrypted = decryptFileBuffer(encrypted.encryptedBuffer, companyA);

      expect(decrypted.fileBuffer.equals(sampleBinary)).toBe(true);
      expect(decrypted.sizeBytes).toBe(16384);
    });

    it('accepts raw 32-byte Buffer key or 64-char hex key directly', () => {
      const rawKey = crypto.randomBytes(32);
      const hexKey = rawKey.toString('hex');

      // With Buffer key
      const enc1 = encryptFileBuffer(samplePdf, rawKey);
      const dec1 = decryptFileBuffer(enc1.encryptedBuffer, rawKey);
      expect(dec1.fileBuffer.equals(samplePdf)).toBe(true);

      // With Hex key
      const enc2 = encryptFileBuffer(samplePdf, hexKey);
      const dec2 = decryptFileBuffer(enc2.encryptedBuffer, hexKey);
      expect(dec2.fileBuffer.equals(samplePdf)).toBe(true);
    });

    it('rejects invalid key sizes', () => {
      const shortKey = crypto.randomBytes(16);
      expect(() => encryptFileBuffer(samplePdf, shortKey)).toThrow(FileEncryptionError);
    });
  });

  describe('Step 041.3: Integrity Hashing & Binary Header Inspection', () => {
    it('computes accurate SHA-256 hash of original unencrypted payload for audit logging', () => {
      const expectedHash = crypto.createHash('sha256').update(samplePdf).digest('hex');
      const directHash = computeFileSha256(samplePdf);
      expect(directHash).toBe(expectedHash);

      const encrypted = encryptFileBuffer(samplePdf, companyA);
      expect(encrypted.originalHash).toBe(expectedHash);
      expect(encrypted.encryptedHash).toBe(computeFileSha256(encrypted.encryptedBuffer));
    });

    it('packages standardized KDFE binary header in encrypted payload', () => {
      const encrypted = encryptFileBuffer(samplePdf, companyA);
      const buf = encrypted.encryptedBuffer;

      // Verify Magic Bytes
      expect(buf.subarray(0, 4).equals(FILE_ENCRYPTION_MAGIC)).toBe(true);
      expect(isFileEncrypted(buf)).toBe(true);
      expect(isFileEncrypted(samplePdf)).toBe(false);

      // Verify Version
      expect(buf.readUInt8(4)).toBe(1);

      // Verify embedded original SHA-256 hash
      const embeddedHash = buf.subarray(33, 65).toString('hex');
      expect(embeddedHash).toBe(encrypted.originalHash);
    });
  });

  describe('Tenant Key Isolation & Multi-Tenant Boundaries', () => {
    it('derives distinct cryptographic keys for different companies', () => {
      const keyA = deriveCompanyFileKey(companyA);
      const keyB = deriveCompanyFileKey(companyB);

      expect(keyA).toHaveLength(32);
      expect(keyB).toHaveLength(32);
      expect(keyA.equals(keyB)).toBe(false);
    });

    it('fails decryption when attempting to decrypt Company A payload with Company B key', () => {
      const encryptedA = encryptFileBuffer(samplePdf, companyA);

      expect(() => {
        decryptFileBuffer(encryptedA.encryptedBuffer, companyB);
      }).toThrow(FileDecryptionError);
    });
  });

  describe('Tamper Resistance & Anti-Corruption Guards', () => {
    it('rejects decryption when ciphertext payload is modified in transit', () => {
      const encrypted = encryptFileBuffer(samplePdf, companyA);
      const tampered = Buffer.from(encrypted.encryptedBuffer);

      // Flip a bit in the ciphertext section
      tampered[HEADER_LENGTH + 5] = (tampered[HEADER_LENGTH + 5]! ^ 0xff);

      expect(() => {
        decryptFileBuffer(tampered, companyA);
      }).toThrow(FileDecryptionError);
    });

    it('rejects decryption when GCM authentication tag is corrupted', () => {
      const encrypted = encryptFileBuffer(samplePdf, companyA);
      const tampered = Buffer.from(encrypted.encryptedBuffer);

      // Tag is located at offset 17-32
      tampered[20] = (tampered[20]! ^ 0xaa);

      expect(() => {
        decryptFileBuffer(tampered, companyA);
      }).toThrow(FileDecryptionError);
    });

    it('rejects decryption when embedded original hash is forged', () => {
      const encrypted = encryptFileBuffer(samplePdf, companyA);
      const tampered = Buffer.from(encrypted.encryptedBuffer);

      // Modify hash bytes at offset 33-64
      tampered[40] = (tampered[40]! ^ 0x11);

      expect(() => {
        decryptFileBuffer(tampered, companyA);
      }).toThrow(FileDecryptionError);
    });

    it('rejects truncated buffer shorter than header length', () => {
      const truncated = Buffer.from([0x4b, 0x44, 0x46, 0x45, 0x01]);
      expect(() => {
        decryptFileBuffer(truncated, companyA);
      }).toThrow(FileDecryptionError);
    });

    it('rejects non-encrypted raw buffers without KDFE magic header', () => {
      expect(() => {
        decryptFileBuffer(samplePdf, companyA);
      }).toThrow(FileDecryptionError);
    });
  });

  describe('Additional Authenticated Data (AAD) Protection', () => {
    it('enforces AAD consistency between encryption and decryption', () => {
      const aad = 'document-id:doc_9999;tenant:018f6c4c';
      const encrypted = encryptFileBuffer(samplePdf, companyA, { aad });

      // Succeeds with identical AAD
      const decrypted = decryptFileBuffer(encrypted.encryptedBuffer, companyA, { aad });
      expect(decrypted.fileBuffer.equals(samplePdf)).toBe(true);

      // Fails with missing or mismatched AAD
      expect(() => {
        decryptFileBuffer(encrypted.encryptedBuffer, companyA);
      }).toThrow(FileDecryptionError);

      expect(() => {
        decryptFileBuffer(encrypted.encryptedBuffer, companyA, { aad: 'wrong-aad' });
      }).toThrow(FileDecryptionError);
    });
  });
});
