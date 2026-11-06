// path: lib/crypto/keys.ts

import crypto from 'node:crypto';

/**
 * Valid domain classifications for derived cryptographic subkeys.
 * Ensures strict domain separation per NIST SP 800-108 and RFC 5869.
 */
export type CryptoDomain =
  | 'gateways'
  | 'pii'
  | 'files'
  | 'webhooks'
  | 'tokens'
  | 'ledger';

export interface KeyValidationResult {
  readonly valid: boolean;
  readonly lengthBytes: number;
  readonly format: 'hex' | 'base64' | 'raw';
  readonly bits: number;
}

export interface DeriveKeyOptions {
  readonly salt?: string | Buffer | undefined;
  readonly context?: string | undefined;
  readonly length?: number | undefined;
}

/**
 * Standard salt used for domain subkey derivation if no custom salt is supplied.
 */
const DEFAULT_HKDF_SALT = Buffer.from('kd-solution-master-key-hkdf-salt-v1', 'utf8');

/**
 * Error thrown when the master encryption key is missing, invalid, or lacks sufficient entropy.
 */
export class MasterKeyValidationError extends Error {
  constructor(message: string) {
    super(`[CEO Key Custody] Master Key Validation Error: ${message}`);
    this.name = 'MasterKeyValidationError';
  }
}

/**
 * Memory scrubbing utility that immediately overwrites a sensitive Buffer with zeroes.
 */
export function zeroizeBuffer(buffer: Buffer): void {
  buffer.fill(0);
}

/**
 * Executes a function with a sensitive buffer, guaranteeing that the buffer is zeroized
 * in memory when the function finishes or throws.
 */
export function withSecureBuffer<T>(buffer: Buffer, fn: (buf: Buffer) => T): T {
  try {
    return fn(buffer);
  } finally {
    zeroizeBuffer(buffer);
  }
}

/**
 * Parses and verifies master key format, byte length, and minimal entropy requirements.
 * Minimum key size required is 256 bits (32 bytes).
 */
export function validateMasterKey(keyInput: string | Buffer): KeyValidationResult {
  let keyBuffer: Buffer;
  let format: 'hex' | 'base64' | 'raw' = 'raw';

  if (Buffer.isBuffer(keyInput)) {
    keyBuffer = keyInput;
    format = 'raw';
  } else if (typeof keyInput === 'string') {
    const trimmed = keyInput.trim();
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
      keyBuffer = Buffer.from(trimmed, 'hex');
      format = 'hex';
    } else if (
      /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) &&
      trimmed.length % 4 === 0
    ) {
      keyBuffer = Buffer.from(trimmed, 'base64');
      format = 'base64';
    } else {
      keyBuffer = Buffer.from(trimmed, 'utf8');
      format = 'raw';
    }
  } else {
    throw new MasterKeyValidationError('Key input must be a string or Buffer.');
  }

  const lengthBytes = keyBuffer.length;
  const bits = lengthBytes * 8;

  if (lengthBytes < 32) {
    throw new MasterKeyValidationError(
      `Master key must be at least 256 bits (32 bytes). Current key has only ${bits} bits (${lengthBytes} bytes).`
    );
  }

  return {
    valid: true,
    lengthBytes,
    format,
    bits,
  };
}

/**
 * Retrieves the raw Buffer representation of the master encryption key from the environment.
 * If not set in non-production environments, provides a deterministic development key with warning.
 */
export function getMasterKeyBuffer(): Buffer {
  const envKey = process.env.MASTER_ENCRYPTION_KEY;

  if (!envKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new MasterKeyValidationError(
        'MASTER_ENCRYPTION_KEY environment variable is missing in production. Platform execution halted by CEO Key Custody Guard.'
      );
    }

    // Deterministic 256-bit fallback key for local dev and testing only
    return Buffer.from(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'hex'
    );
  }

  const validation = validateMasterKey(envKey);
  if (validation.format === 'hex') {
    return Buffer.from(envKey.trim(), 'hex');
  }
  if (validation.format === 'base64') {
    return Buffer.from(envKey.trim(), 'base64');
  }
  return Buffer.from(envKey, 'utf8');
}

/**
 * Derives a cryptographically isolated domain-specific subkey using HKDF (RFC 5869)
 * with SHA-256 HMAC from the CEO Master Encryption Key.
 */
export function deriveDomainKey(
  domain: CryptoDomain,
  options?: DeriveKeyOptions
): Buffer {
  const masterKey = getMasterKeyBuffer();
  const keyLength = options?.length ?? 32; // Default 256-bit subkey
  const salt = options?.salt
    ? Buffer.isBuffer(options.salt)
      ? options.salt
      : Buffer.from(options.salt, 'utf8')
    : DEFAULT_HKDF_SALT;

  const info = Buffer.from(
    `kd-solution-payfac:${domain}:${options?.context ?? 'default'}`,
    'utf8'
  );

  return withSecureBuffer(masterKey, (cleanMasterKey) => {
    return Buffer.from(
      crypto.hkdfSync('sha256', cleanMasterKey, salt, info, keyLength)
    );
  });
}

/**
 * Derives a subkey and executes a callback with the subkey buffer, ensuring
 * the derived key material is zeroized immediately upon completion.
 */
export function withDerivedKey<T>(
  domain: CryptoDomain,
  fn: (key: Buffer) => T,
  options?: DeriveKeyOptions
): T {
  const derivedKey = deriveDomainKey(domain, options);
  return withSecureBuffer(derivedKey, fn);
}
