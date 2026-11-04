// path: lib/storage/file-encryption.ts

import crypto from 'node:crypto';
import { deriveDomainKey, withSecureBuffer } from '../crypto/keys';

/**
 * 4-byte Magic header identifying KD Solution IT Encrypted File Format (KDFE = 0x4B 0x44 0x46 0x45)
 */
export const FILE_ENCRYPTION_MAGIC = Buffer.from([0x4b, 0x44, 0x46, 0x45]);
export const CURRENT_FILE_ENCRYPTION_VERSION = 1;

// Binary Header Layout (65 bytes total):
// Offset 0-3   (4 bytes):  Magic Bytes (KDFE)
// Offset 4     (1 byte):   Version (0x01)
// Offset 5-16  (12 bytes): Initialization Vector (IV)
// Offset 17-32 (16 bytes): GCM Authentication Tag
// Offset 33-64 (32 bytes): SHA-256 Hash of original unencrypted payload (binary)
// Offset 65+   (N bytes):  AES-256-GCM Ciphertext
export const HEADER_LENGTH = 65;

export interface EncryptedFilePayload {
  readonly encryptedBuffer: Buffer;
  readonly originalHash: string;
  readonly encryptedHash: string;
  readonly iv: string;
  readonly authTag: string;
  readonly version: number;
  readonly originalSizeBytes: number;
  readonly encryptedSizeBytes: number;
}

export interface DecryptedFilePayload {
  readonly fileBuffer: Buffer;
  readonly originalHash: string;
  readonly version: number;
  readonly sizeBytes: number;
}

export class FileEncryptionError extends Error {
  constructor(message: string) {
    super(`[File Encryption Pipeline] ${message}`);
    this.name = 'FileEncryptionError';
  }
}

export class FileDecryptionError extends Error {
  constructor(reason: string = 'Decryption failed or integrity verification failed.') {
    super(`[File Decryption Pipeline] ${reason}`);
    this.name = 'FileDecryptionError';
  }
}

/**
 * Computes a SHA-256 hexadecimal digest of arbitrary binary buffer.
 */
export function computeFileSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Derives a cryptographically isolated AES-256 key for a specific company's files
 * using HKDF-SHA256 rooted in the CEO Master Encryption Key.
 */
export function deriveCompanyFileKey(companyId: string): Buffer {
  if (!companyId || typeof companyId !== 'string') {
    throw new FileEncryptionError('A valid company identifier is required to derive file encryption key.');
  }
  return deriveDomainKey('files', { context: companyId });
}

/**
 * Resolves a 32-byte key buffer from either an explicit Buffer or a companyId string.
 */
function resolveKeyBuffer(companyKeyOrId: Buffer | string): Buffer {
  if (Buffer.isBuffer(companyKeyOrId)) {
    if (companyKeyOrId.length !== 32) {
      throw new FileEncryptionError(
        `AES-256-GCM requires a 32-byte (256-bit) key. Provided: ${companyKeyOrId.length} bytes.`
      );
    }
    return Buffer.from(companyKeyOrId);
  }

  if (typeof companyKeyOrId === 'string' && companyKeyOrId.length > 0) {
    // If it's a 64-char hex string representing a 32-byte raw key, parse it
    if (/^[0-9a-fA-F]{64}$/.test(companyKeyOrId)) {
      return Buffer.from(companyKeyOrId, 'hex');
    }
    // Otherwise treat as company UUID / tenant ID and derive via HKDF
    return deriveCompanyFileKey(companyKeyOrId);
  }

  throw new FileEncryptionError('Invalid key specification: must provide 32-byte Buffer, 64-char hex, or company ID.');
}

/**
 * Checks whether a buffer begins with the KD Solution IT Encrypted File magic header.
 */
export function isFileEncrypted(buffer: Buffer): boolean {
  if (!buffer || buffer.length < HEADER_LENGTH) {
    return false;
  }
  return buffer.subarray(0, 4).equals(FILE_ENCRYPTION_MAGIC);
}

/**
 * Step 041.1 & Step 041.3: Pre-Upload File Encryption Pipeline.
 * Encrypts arbitrary file buffer using AES-256-GCM with a unique 96-bit IV, GCM auth tag,
 * and packages it with binary header and original SHA-256 integrity hash.
 *
 * @param fileBuffer - Unencrypted raw file buffer
 * @param companyKeyOrId - 32-byte binary key, 64-char hex key, or company UUID
 * @param options - Additional Authenticated Data (AAD) or custom parameters
 * @returns EncryptedFilePayload containing self-contained ciphertext buffer and audit metadata
 */
export function encryptFileBuffer(
  fileBuffer: Buffer,
  companyKeyOrId: Buffer | string,
  options?: {
    readonly aad?: string | Buffer | undefined;
  }
): EncryptedFilePayload {
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new FileEncryptionError('Expected fileBuffer to be a binary Buffer.');
  }

  const keyBuffer = resolveKeyBuffer(companyKeyOrId);

  return withSecureBuffer(keyBuffer, (key) => {
    // 1. Compute SHA-256 hash of original unencrypted file (Step 041.3)
    const originalHash = computeFileSha256(fileBuffer);
    const originalHashBytes = Buffer.from(originalHash, 'hex');

    // 2. Generate cryptographically secure random 96-bit IV
    const iv = crypto.randomBytes(12);

    // 3. Initialize AES-256-GCM cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    // 4. Attach AAD if supplied
    if (options?.aad) {
      const aadBuf = Buffer.isBuffer(options.aad)
        ? options.aad
        : Buffer.from(options.aad, 'utf8');
      cipher.setAAD(aadBuf);
    }

    // 5. Encrypt payload
    const ciphertext = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // 6. Assemble standardized binary header
    const header = Buffer.alloc(HEADER_LENGTH);
    FILE_ENCRYPTION_MAGIC.copy(header, 0); // Bytes 0-3
    header.writeUInt8(CURRENT_FILE_ENCRYPTION_VERSION, 4); // Byte 4
    iv.copy(header, 5); // Bytes 5-16 (12 bytes IV)
    authTag.copy(header, 17); // Bytes 17-32 (16 bytes Tag)
    originalHashBytes.copy(header, 33); // Bytes 33-64 (32 bytes Hash)

    // 7. Combine header and ciphertext into self-contained storage buffer
    const encryptedBuffer = Buffer.concat([header, ciphertext]);
    const encryptedHash = computeFileSha256(encryptedBuffer);

    return {
      encryptedBuffer,
      originalHash,
      encryptedHash,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      version: CURRENT_FILE_ENCRYPTION_VERSION,
      originalSizeBytes: fileBuffer.length,
      encryptedSizeBytes: encryptedBuffer.length,
    };
  });
}

/**
 * Step 041.2: Retrieval File Decryption Pipeline.
 * Extracts binary header, validates GCM authentication tag, decrypts payload with AES-256-GCM,
 * and asserts that the decrypted buffer exactly matches the embedded original SHA-256 hash.
 *
 * @param encryptedBuffer - Self-contained encrypted file buffer with KDFE header
 * @param companyKeyOrId - 32-byte binary key, 64-char hex key, or company UUID
 * @param options - Additional Authenticated Data (AAD) if supplied during encryption
 * @returns DecryptedFilePayload containing original byte-for-byte fidelity file buffer
 */
export function decryptFileBuffer(
  encryptedBuffer: Buffer,
  companyKeyOrId: Buffer | string,
  options?: {
    readonly aad?: string | Buffer | undefined;
  }
): DecryptedFilePayload {
  if (!Buffer.isBuffer(encryptedBuffer)) {
    throw new FileDecryptionError('Expected encryptedBuffer to be a binary Buffer.');
  }

  if (encryptedBuffer.length < HEADER_LENGTH) {
    throw new FileDecryptionError('Corrupted file: buffer length is shorter than encryption header.');
  }

  // 1. Validate magic bytes
  const magic = encryptedBuffer.subarray(0, 4);
  if (!magic.equals(FILE_ENCRYPTION_MAGIC)) {
    throw new FileDecryptionError('File header magic bytes mismatch. File is not encrypted or format unrecognized.');
  }

  // 2. Extract header components
  const version = encryptedBuffer.readUInt8(4);
  if (version !== CURRENT_FILE_ENCRYPTION_VERSION) {
    throw new FileDecryptionError(`Unsupported encryption version: ${version}. Expected version 1.`);
  }

  const iv = encryptedBuffer.subarray(5, 17);
  const authTag = encryptedBuffer.subarray(17, 33);
  const expectedOriginalHash = encryptedBuffer.subarray(33, 65).toString('hex');
  const ciphertext = encryptedBuffer.subarray(65);

  const keyBuffer = resolveKeyBuffer(companyKeyOrId);

  return withSecureBuffer(keyBuffer, (key) => {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      if (options?.aad) {
        const aadBuf = Buffer.isBuffer(options.aad)
          ? options.aad
          : Buffer.from(options.aad, 'utf8');
        decipher.setAAD(aadBuf);
      }

      const decryptedBuffer = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      // 3. Bit-level integrity verification against embedded SHA-256 hash
      const actualHash = computeFileSha256(decryptedBuffer);
      if (actualHash.toLowerCase() !== expectedOriginalHash.toLowerCase()) {
        throw new FileDecryptionError('Integrity breach: decrypted file SHA-256 hash does not match original digest.');
      }

      return {
        fileBuffer: decryptedBuffer,
        originalHash: actualHash,
        version,
        sizeBytes: decryptedBuffer.length,
      };
    } catch (err) {
      if (err instanceof FileDecryptionError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new FileDecryptionError(`AES-256-GCM authentication verification failed: ${message}`);
    }
  });
}
