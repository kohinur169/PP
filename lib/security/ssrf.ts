// path: lib/security/ssrf.ts
import type { SsrfValidationResult } from './types';

// Regular expressions for detecting IPv4 addresses and numeric notations
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEX_OCT_IP_REGEX = /^0x[0-9a-fA-F]+$|^\d+$/;

function isPrivateIpv4(ip: string): boolean {
  const match = ip.match(IPV4_REGEX);
  if (!match) return false;

  const [_, o1, o2, o3, o4] = match.map(Number);
  if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) return true;

  // 0.0.0.0/8
  if (o1 === 0) return true;
  // 127.0.0.0/8 (Loopback)
  if (o1 === 127) return true;
  // 10.0.0.0/8 (Private RFC 1918)
  if (o1 === 10) return true;
  // 172.16.0.0/12 (Private RFC 1918)
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  // 192.168.0.0/16 (Private RFC 1918)
  if (o1 === 192 && o2 === 168) return true;
  // 169.254.0.0/16 (Link-local / Cloud metadata: 169.254.169.254)
  if (o1 === 169 && o2 === 254) return true;
  // 100.64.0.0/10 (Carrier Grade NAT)
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
  // 224.0.0.0/4 (Multicast)
  if (o1 >= 224 && o1 <= 239) return true;
  // 240.0.0.0/4 & 255.255.255.255
  if (o1 >= 240) return true;

  return false;
}

function isPrivateIpv6(host: string): boolean {
  const clean = host.replace(/^\[|\]$/g, '').toLowerCase();
  // IPv6 loopback
  if (clean === '::1' || clean === '0:0:0:0:0:0:0:1') return true;
  // IPv6 unspecified
  if (clean === '::' || clean === '0:0:0:0:0:0:0:0') return true;
  // IPv6 link-local (fe80::/10)
  if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) return true;
  // IPv6 unique local (fc00::/7)
  if (clean.startsWith('fc') || clean.startsWith('fd')) return true;
  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  if (clean.includes('ffff:')) {
    const parts = clean.split('ffff:');
    if (parts[1] && isPrivateIpv4(parts[1])) return true;
  }
  return false;
}

/**
 * Validates an outbound HTTP/HTTPS URL against SSRF (Server-Side Request Forgery).
 * Strictly forbids loopbacks, private networks, cloud metadata services, and non-HTTP protocols.
 */
export function validateSafeUrl(urlString: string): SsrfValidationResult {
  if (!urlString || typeof urlString !== 'string') {
    return { isValid: false, error: 'Empty or invalid URL input' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return { isValid: false, error: 'Malformed URL structure' };
  }

  // 1. Protocol validation: Allow only HTTP and HTTPS
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { isValid: false, error: `Prohibited protocol: "${protocol}". Only HTTP and HTTPS are permitted.` };
  }

  // 2. Hostname validation
  const hostname = parsed.hostname.toLowerCase();

  // Prohibit local / internal domain names
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.corp') ||
    hostname === 'metadata.google.internal'
  ) {
    return { isValid: false, error: `Prohibited internal/local hostname: "${hostname}"` };
  }

  // Detect hex or dword representations of IPs (e.g. 2130706433 or 0x7f000001)
  if (HEX_OCT_IP_REGEX.test(hostname)) {
    return { isValid: false, error: 'Prohibited numeric/hex encoded IP address format' };
  }

  // 3. IPv4 validation
  if (isPrivateIpv4(hostname)) {
    return { isValid: false, error: `Prohibited private or cloud metadata IP range: "${hostname}"` };
  }

  // 4. IPv6 validation
  if (isPrivateIpv6(hostname)) {
    return { isValid: false, error: `Prohibited private or loopback IPv6 address: "${hostname}"` };
  }

  return {
    isValid: true,
    sanitizedUrl: parsed.toString(),
  };
}

/**
 * Asserts that a URL is safe from SSRF exploits, throwing an Error if unsafe.
 */
export function assertSafeUrl(urlString: string): string {
  const result = validateSafeUrl(urlString);
  if (!result.isValid || !result.sanitizedUrl) {
    throw new Error(`SSRF Security Violation: ${result.error ?? 'Invalid URL'}`);
  }
  return result.sanitizedUrl;
}
