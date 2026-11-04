// path: lib/auth/password.ts

import crypto from 'node:crypto';

/**
 * Enterprise Password Hashing Utility.
 * Implements salted key derivation using PBKDF2 with SHA-512 (100,000 iterations).
 * Prepares foundation for Argon2id upgrade in Step 047.
 */

/**
 * Hashes a plaintext password using a cryptographically random salt and PBKDF2-SHA512.
 */
export function hashPassword(password: string): string {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto
    .pbkdf2Sync(password, salt, 100_000, 64, 'sha512')
    .toString('hex');

  return `pbkdf2_sha512$100000$${salt}$${derivedKey}`;
}

/**
 * Verifies a candidate plaintext password against an existing password hash.
 * Employs constant-time byte comparison to eliminate timing attack vectors.
 */
export function verifyPassword(password: string, hash: string): boolean {
  if (!password || !hash || typeof password !== 'string' || typeof hash !== 'string') {
    return false;
  }

  const parts = hash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha512') {
    return false;
  }

  const iterations = parseInt(parts[1] ?? '0', 10);
  const salt = parts[2] ?? '';
  const expectedHash = parts[3] ?? '';

  if (iterations <= 0 || !salt || !expectedHash) {
    return false;
  }

  const derivedKey = crypto
    .pbkdf2Sync(password, salt, iterations, 64, 'sha512')
    .toString('hex');

  const derivedBuf = Buffer.from(derivedKey, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');

  if (derivedBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedBuf, expectedBuf);
}
