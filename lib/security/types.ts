// path: lib/security/types.ts

export interface SanitizeOptions {
  /** Strip all HTML tags completely (default: true) */
  stripHtml?: boolean;
  /** Allow safe whitelisted HTML formatting tags (default: false) */
  allowSafeHtml?: boolean;
  /** Perform Unicode NFC normalization to prevent homograph attacks (default: true) */
  normalizeUnicode?: boolean;
  /** Strip null bytes (\0) to prevent truncation attacks (default: true) */
  removeNullBytes?: boolean;
  /** Strip directory traversal markers (../, ..\) (default: true) */
  removePathTraversal?: boolean;
  /** Trim leading and trailing whitespace (default: true) */
  trim?: boolean;
}

export interface SsrfValidationResult {
  isValid: boolean;
  sanitizedUrl?: string;
  error?: string;
}
