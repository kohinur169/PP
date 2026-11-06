// path: lib/auth/password.ts

import crypto from 'node:crypto';
import argon2 from 'argon2';

/**
 * OWASP Recommended Argon2id Profile for Enterprise Credential Protection:
 * - Type: Argon2id (resistant to both side-channel and GPU cracking attacks)
 * - Memory Cost: 65,536 KiB (64 MiB)
 * - Time Cost: 3 iterations
 * - Parallelism: 4 lanes / threads
 */
export const ARGON2ID_PROFILE: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

/**
 * Step 047.1: Hashes a plaintext password using Argon2id.
 */
export async function hashPassword(
  password: string,
  options?: argon2.HashOptions
): Promise<string> {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string.');
  }

  return await argon2.hash(password, {
    ...ARGON2ID_PROFILE,
    ...options,
    raw: false,
  });
}

/**
 * Step 047.1: Verifies a candidate plaintext password against an existing password hash.
 * Supports both standard Argon2id hashes and legacy PBKDF2-SHA512 hashes.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  if (!password || !hash || typeof password !== 'string' || typeof hash !== 'string') {
    return false;
  }

  // 1. Argon2id verification
  if (hash.startsWith('$argon2')) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  // 2. Legacy PBKDF2-SHA512 fallback for seeded accounts
  if (hash.startsWith('pbkdf2_sha512$')) {
    const parts = hash.split('$');
    if (parts.length !== 4) return false;

    const iterations = parseInt(parts[1] ?? '0', 10);
    const salt = parts[2] ?? '';
    const expectedHash = parts[3] ?? '';

    if (iterations <= 0 || !salt || !expectedHash) return false;

    const derivedKey = crypto
      .pbkdf2Sync(password, salt, iterations, 64, 'sha512')
      .toString('hex');

    const derivedBuf = Buffer.from(derivedKey, 'hex');
    const expectedBuf = Buffer.from(expectedHash, 'hex');

    if (derivedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, expectedBuf);
  }

  return false;
}
