// path: lib/security/sanitize.ts
import DOMPurify from 'isomorphic-dompurify';
import type { SanitizeOptions } from './types';

const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  stripHtml: true,
  allowSafeHtml: false,
  normalizeUnicode: true,
  removeNullBytes: true,
  removePathTraversal: true,
  trim: true,
};

// Configuration for safe formatting HTML when explicitly permitted
const SAFE_HTML_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span'],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

/**
 * Sanitizes a single string against multi-vector security threats:
 * null-byte injection, path traversal, Unicode homographs, and XSS.
 */
export function sanitizeString(input: unknown, options?: SanitizeOptions): string {
  if (input === null || input === undefined) {
    return '';
  }

  let str = String(input);
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 1. Remove Null Bytes (\0 / \u0000) to prevent truncation attacks
  if (opts.removeNullBytes) {
    str = str.replace(/\0/g, '').replace(/%00/gi, '');
  }

  // 2. Unicode Normalization (NFC) to counter homograph and multi-byte bypass exploits
  if (opts.normalizeUnicode) {
    try {
      str = str.normalize('NFC');
    } catch {
      // Fallback if normalization fails
    }
  }

  // 3. Remove Directory Traversal markers (../ and ..\)
  if (opts.removePathTraversal) {
    str = str
      .replace(/\.\.\//g, '')
      .replace(/\.\.\\/g, '')
      .replace(/%2e%2e%2f/gi, '')
      .replace(/%2e%2e\//gi, '');
  }

  // 4. HTML / XSS Sanitization
  if (opts.stripHtml && !opts.allowSafeHtml) {
    // Strip all HTML tags completely
    str = DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  } else if (opts.allowSafeHtml) {
    // Sanitize with strict allowlist
    str = DOMPurify.sanitize(str, SAFE_HTML_CONFIG);
  }

  // 5. Trim whitespace if requested
  if (opts.trim) {
    str = str.trim();
  }

  return str;
}

/**
 * Sanitizes rich HTML content with strict attribute allowlist.
 * Guarantees removal of <script>, onerror, onload, javascript: URIs.
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return DOMPurify.sanitize(input, SAFE_HTML_CONFIG);
}

/**
 * Defends against HTTP Response Splitting / Header Injection (CRLF).
 * Strips \r and \n characters completely.
 */
export function sanitizeHeaderValue(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[\r\n\0]/g, '').trim();
}

/**
 * Sanitizes file or storage paths against directory traversal and null bytes.
 */
export function sanitizePath(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/\0/g, '')
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/^\/+/, '')
    .trim();
}

/**
 * Recursively sanitizes all string properties in an object or array.
 * Includes prototype pollution defense (rejects __proto__, constructor, prototype).
 */
export function sanitizeObject<T>(input: T, options?: SanitizeOptions): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return sanitizeString(input, options) as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObject(item, options)) as unknown as T;
  }

  if (typeof input === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      // Prototype pollution defense
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }

      const sanitizedKey = sanitizeString(key, { stripHtml: true, removePathTraversal: true });
      result[sanitizedKey] = sanitizeObject(value, options);
    }

    return result as T;
  }

  return input;
}
