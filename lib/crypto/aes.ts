// path: lib/crypto/aes.ts

import crypto from 'node:crypto';
import { withDerivedKey, CryptoDomain } from './keys';

export interface EncryptedEnvelope {
  readonly version: number;
  readonly iv: string;
  readonly authTag: string;
  readonly ciphertext: string;
  readonly serialized: string;
}

export interface AesEncryptionOptions {
  readonly aad?: string | Buffer | undefined;
  readonly encoding?: 'hex' | 'base64' | undefined;
  readonly version?: number | undefined;
}

export interface AesDecryptionOptions {
  readonly aad?: string | Buffer | undefined;
}

/**
 * Standard error thrown when AES-256-GCM authenticated decryption fails.
 * Guarantees zero leakage of key material, plaintext, or internal OpenSSL states.
 */
export class DecryptionError extends Error {
  constructor(reason: string = 'Integrity authentication tag verification failed.') {
    super(`[Crypto AES-256-GCM] Decryption failed: ${reason}`);
    this.name = 'DecryptionError';
  }
}

/**
 * Serializes an EncryptedEnvelope into a compact storage string:
 * Format: "v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>"
 */
export function serializeEnvelope(
  envelope: Omit<EncryptedEnvelope, 'serialized'>
): string {
  return `v${envelope.version}:${envelope.iv}:${envelope.authTag}:${envelope.ciphertext}`;
}

/**
 * Parses a serialized encryption string into an EncryptedEnvelope.
 */
export function parseEnvelope(serialized: string): EncryptedEnvelope {
  const trimmed = serialized.trim();
  const parts = trimmed.split(':');

  if (parts.length !== 4) {
    throw new DecryptionError('Malformed ciphertext envelope format.');
  }

  const [versionPart, iv, authTag, ciphertext] = parts;
  if (!versionPart || !iv || !authTag || !ciphertext) {
    throw new DecryptionError('Malformed ciphertext envelope: missing required component.');
  }

  const versionMatch = versionPart.match(/^v(\d+)$/);
  if (!versionMatch || !versionMatch[1]) {
    throw new DecryptionError(`Unsupported ciphertext envelope version: ${versionPart}`);
  }

  const version = parseInt(versionMatch[1], 10);
  if (isNaN(version) || version < 1) {
    throw new DecryptionError(`Unsupported envelope version: ${versionPart}`);
  }

  return {
    version,
    iv,
    authTag,
    ciphertext,
    serialized: trimmed,
  };
}

/**
 * Encrypts arbitrary plaintext using AES-256-GCM with a unique 96-bit (12-byte) IV
 * and 128-bit (16-byte) authentication tag.
 */
export function encryptAesGcm(
  plaintext: string | Buffer,
  key: Buffer,
  options?: AesEncryptionOptions
): EncryptedEnvelope {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('AES-256-GCM requires a 32-byte (256-bit) binary encryption key.');
  }

  // 1. Generate unique 96-bit (12-byte) IV for GCM mode per NIST SP 800-38D
  const iv = crypto.randomBytes(12);

  // 2. Initialize cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  // 3. Attach Additional Authenticated Data (AAD) if supplied
  if (options?.aad) {
    const aadBuffer = Buffer.isBuffer(options.aad)
      ? options.aad
      : Buffer.from(options.aad, 'utf8');
    cipher.setAAD(aadBuffer);
  }

  // 4. Encrypt data
  const plainBuffer = Buffer.isBuffer(plaintext)
    ? plaintext
    : Buffer.from(plaintext, 'utf8');

  const ciphertext = Buffer.concat([
    cipher.update(plainBuffer),
    cipher.final(),
  ]);

  // 5. Extract 128-bit (16-byte) GCM authentication tag
  const authTag = cipher.getAuthTag();

  const ivHex = iv.toString('hex');
  const authTagHex = authTag.toString('hex');
  const ciphertextHex = ciphertext.toString('hex');
  const version = options?.version ?? 1;

  const serialized = `v${version}:${ivHex}:${authTagHex}:${ciphertextHex}`;

  return {
    version,
    iv: ivHex,
    authTag: authTagHex,
    ciphertext: ciphertextHex,
    serialized,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload and verifies its authentication tag.
 * Throws DecryptionError if any bit of the ciphertext, IV, auth tag, or AAD has been tampered with.
 */
export function decryptAesGcm(
  payload: string | EncryptedEnvelope,
  key: Buffer,
  options?: AesDecryptionOptions
): string {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('AES-256-GCM requires a 32-byte (256-bit) binary encryption key.');
  }

  const envelope =
    typeof payload === 'string' ? parseEnvelope(payload) : payload;

  try {
    const iv = Buffer.from(envelope.iv, 'hex');
    const authTag = Buffer.from(envelope.authTag, 'hex');
    const ciphertext = Buffer.from(envelope.ciphertext, 'hex');

    if (iv.length !== 12) {
      throw new DecryptionError('Invalid IV length. Expected 12 bytes.');
    }
    if (authTag.length !== 16) {
      throw new DecryptionError('Invalid authentication tag length. Expected 16 bytes.');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    if (options?.aad) {
      const aadBuffer = Buffer.isBuffer(options.aad)
        ? options.aad
        : Buffer.from(options.aad, 'utf8');
      decipher.setAAD(aadBuffer);
    }

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (err: unknown) {
    if (err instanceof DecryptionError) {
      throw err;
    }
    // Conceal internal OpenSSL errors to prevent side-channel / padding / tag oracle leaks
    throw new DecryptionError('Authentication tag mismatch or corrupted ciphertext.');
  }
}

/**
 * Convenience helper to encrypt data using a domain-specific derived key.
 * Memory is automatically zeroized after encryption.
 */
export function encryptWithDomainKey(
  domain: CryptoDomain,
  plaintext: string,
  options?: { context?: string | undefined; aad?: string | Buffer | undefined }
): string {
  return withDerivedKey(
    domain,
    (key) => {
      const envelope = encryptAesGcm(plaintext, key, { aad: options?.aad });
      return envelope.serialized;
    },
    { context: options?.context }
  );
}

/**
 * Convenience helper to decrypt data using a domain-specific derived key.
 * Memory is automatically zeroized after decryption.
 */
export function decryptWithDomainKey(
  domain: CryptoDomain,
  serializedEnvelope: string,
  options?: { context?: string | undefined; aad?: string | Buffer | undefined }
): string {
  return withDerivedKey(
    domain,
    (key) => {
      return decryptAesGcm(serializedEnvelope, key, { aad: options?.aad });
    },
    { context: options?.context }
  );
}
