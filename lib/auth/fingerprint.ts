// path: lib/auth/fingerprint.ts
import crypto from 'node:crypto';
import type { DeviceCharacteristics } from './session-types';

/**
 * Normalizes an IP address into its routing subnet (/24 for IPv4, /48 for IPv6).
 * This accommodates cellular network cell tower handoffs while preventing cross-region hijacking.
 */
export function normalizeIpSubnet(ip: string): string {
  if (!ip || typeof ip !== 'string') {
    return '0.0.0.0/24';
  }

  const cleanIp = ip.trim();

  // IPv4 handling
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.');
    if (parts.length >= 3) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    }
    return `${cleanIp}/24`;
  }

  // IPv6 handling
  if (cleanIp.includes(':')) {
    if (cleanIp === '::1') {
      return '::1/48';
    }
    const groups = cleanIp.split(':').filter(Boolean);
    const prefix = groups.slice(0, 3).join(':');
    return `${prefix || '::'}/48`;
  }

  return `${cleanIp}/24`;
}

/**
 * Generates an LR-022 cryptographic ephemeral device fingerprint.
 * Combines IP routing subnet, User-Agent, and client Accept headers into a deterministic SHA-256 digest.
 */
export function generateDeviceFingerprint(device: DeviceCharacteristics): string {
  const subnet = normalizeIpSubnet(device.ip);
  const ua = (device.userAgent || '').trim().toLowerCase();
  const lang = (device.acceptLanguage || '').trim().toLowerCase();
  const encoding = (device.acceptEncoding || '').trim().toLowerCase();

  const payload = [subnet, ua, lang, encoding].join('|');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Verifies if incoming request device characteristics match an expected fingerprint hash.
 */
export function verifyDeviceFingerprint(
  device: DeviceCharacteristics,
  expectedHash: string
): boolean {
  if (!expectedHash) return false;
  const currentHash = generateDeviceFingerprint(device);
  return currentHash === expectedHash;
}

/**
 * Generates a SHA-256 hash of a raw session secret token for database storage.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim(), 'utf8').digest('hex');
}
