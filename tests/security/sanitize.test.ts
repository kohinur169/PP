// path: tests/security/sanitize.test.ts
import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  sanitizeHtml,
  sanitizeHeaderValue,
  sanitizePath,
  sanitizeObject,
  validateSafeUrl,
  assertSafeUrl,
} from '@/lib/security';

describe('Multi-Vector Input Sanitization Pipeline (Step 005)', () => {
  describe('XSS & HTML Sanitization', () => {
    it('should strip dangerous script tags and execution vectors completely', () => {
      expect(sanitizeString("<script>alert('XSS')</script>")).toBe('');
      expect(sanitizeString('<img src=x onerror="alert(1)">')).toBe('');
      expect(sanitizeString('<svg onload="alert(document.cookie)">')).toBe('');
    });

    it('should neutralize javascript: pseudo-protocols in links', () => {
      const dirtyHtml = '<a href="javascript:alert(1)">Click me</a>';
      expect(sanitizeString(dirtyHtml)).toBe('Click me');
      expect(sanitizeHtml(dirtyHtml)).not.toContain('javascript:');
    });

    it('should preserve safe formatting tags only when allowSafeHtml is explicitly enabled', () => {
      const formatted = '<b>Important:</b> <i>Payment received</i>';
      expect(sanitizeString(formatted, { allowSafeHtml: true })).toBe('<b>Important:</b> <i>Payment received</i>');
      // When allowSafeHtml is false (default), all tags are stripped
      expect(sanitizeString(formatted)).toBe('Important: Payment received');
    });
  });

  describe('Null-Byte Truncation Defense', () => {
    it('should strip null bytes (\\0 and %00) preventing file extension truncation attacks', () => {
      expect(sanitizeString('invoice_report.pdf\0.exe')).toBe('invoice_report.pdf.exe');
      expect(sanitizeString('username\0admin')).toBe('usernameadmin');
      expect(sanitizeString('document%00.php')).toBe('document.php');
    });
  });

  describe('Path Traversal Defense', () => {
    it('should strip directory traversal markers (../ and ..\\)', () => {
      expect(sanitizeString('../../etc/passwd')).toBe('etc/passwd');
      expect(sanitizeString('..\\..\\windows\\system32')).toBe('windows\\system32');
      expect(sanitizeString('%2e%2e%2fetc/shadow')).toBe('etc/shadow');
    });

    it('should clean storage file paths using sanitizePath', () => {
      expect(sanitizePath('../../../companies/123/receipt.pdf')).toBe('companies/123/receipt.pdf');
      expect(sanitizePath('/root/secret\0.env')).toBe('root/secret.env');
    });
  });

  describe('HTTP Header Injection Defense (CRLF)', () => {
    it('should strip carriage return and newline characters from header values', () => {
      const maliciousHeader = 'attachment; filename=receipt.pdf\r\nSet-Cookie: session=hijacked';
      expect(sanitizeHeaderValue(maliciousHeader)).toBe('attachment; filename=receipt.pdfSet-Cookie: session=hijacked');
    });
  });

  describe('Unicode NFC Normalization', () => {
    it('should normalize decomposed Unicode sequences into canonical NFC forms', () => {
      // e + acute accent (decomposed e\u0301) vs precomposed é (\u00E9)
      const decomposed = 'e\u0301';
      const normalized = sanitizeString(decomposed);
      expect(normalized).toBe('\u00E9');
    });
  });

  describe('Deep Object & Array Sanitization', () => {
    it('should recursively sanitize all string fields in nested objects and arrays', () => {
      const payload = {
        businessName: "Acme Corp <script>alert('bad')</script>",
        address: {
          line1: '123 Main St\0',
          city: 'Singapore',
        },
        tags: ['fintech', '<b>payment</b>'],
      };

      const cleaned = sanitizeObject(payload);
      expect(cleaned.businessName).toBe('Acme Corp');
      expect(cleaned.address.line1).toBe('123 Main St');
      expect(cleaned.tags[1]).toBe('payment');
    });

    it('should defend against prototype pollution attacks', () => {
      const maliciousPayload = JSON.parse(
        '{"__proto__": {"polluted": true}, "validKey": "validValue"}'
      );

      const cleaned = sanitizeObject(maliciousPayload);
      expect(cleaned).not.toHaveProperty('__proto__');
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  describe('SSRF (Server-Side Request Forgery) Defense', () => {
    it('should strictly reject AWS, GCP and Azure cloud metadata IP addresses', () => {
      const awsMetadata = 'http://169.254.169.254/latest/meta-data/';
      expect(validateSafeUrl(awsMetadata).isValid).toBe(false);
      expect(() => assertSafeUrl(awsMetadata)).toThrowError('SSRF Security Violation');

      const gcpMetadata = 'http://metadata.google.internal/computeMetadata/v1/';
      expect(validateSafeUrl(gcpMetadata).isValid).toBe(false);
    });

    it('should reject loopback IP addresses (127.0.0.0/8 and ::1)', () => {
      expect(validateSafeUrl('http://127.0.0.1:8080/admin').isValid).toBe(false);
      expect(validateSafeUrl('http://127.0.0.2/internal').isValid).toBe(false);
      expect(validateSafeUrl('http://localhost/secret').isValid).toBe(false);
      expect(validateSafeUrl('http://[::1]:3000').isValid).toBe(false);
    });

    it('should reject private RFC 1918 internal networks (10.x, 172.16-31.x, 192.168.x)', () => {
      expect(validateSafeUrl('http://10.0.0.1/db').isValid).toBe(false);
      expect(validateSafeUrl('http://172.16.5.10/api').isValid).toBe(false);
      expect(validateSafeUrl('http://192.168.1.1/router').isValid).toBe(false);
    });

    it('should reject non-HTTP protocols (file, gopher, ftp, data, ldap)', () => {
      expect(validateSafeUrl('file:///etc/passwd').isValid).toBe(false);
      expect(validateSafeUrl('gopher://127.0.0.1:6379/_').isValid).toBe(false);
      expect(validateSafeUrl('ftp://internal.server/data').isValid).toBe(false);
      expect(validateSafeUrl('data:text/html,<script>alert(1)</script>').isValid).toBe(false);
    });

    it('should reject numeric/hex encoded IP bypasses', () => {
      // 2130706433 is decimal representation of 127.0.0.1
      expect(validateSafeUrl('http://2130706433').isValid).toBe(false);
      expect(validateSafeUrl('http://0x7f000001').isValid).toBe(false);
    });

    it('should allow verified safe public HTTPS endpoints', () => {
      const stripeApi = 'https://api.stripe.com/v1/charges';
      const nmiGateway = 'https://secure.nmi.com/api/transact.php';
      const airwallexApi = 'https://api.airwallex.com/api/v1/pa/payment_intents';

      expect(validateSafeUrl(stripeApi).isValid).toBe(true);
      expect(validateSafeUrl(nmiGateway).isValid).toBe(true);
      expect(validateSafeUrl(airwallexApi).isValid).toBe(true);
      expect(assertSafeUrl(stripeApi)).toBe(stripeApi);
    });
  });
});
