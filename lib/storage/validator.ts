// path: lib/storage/validator.ts

import path from 'node:path';
import type { StorageCategory } from './types';

export class FileValidationError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 422) {
    super(`[File Validator] ${message}`);
    this.name = 'FileValidationError';
    this.statusCode = statusCode;
  }
}

export class FileOversizedError extends FileValidationError {
  public readonly maxBytes: number;
  public readonly actualBytes: number;

  constructor(category: string, maxBytes: number, actualBytes: number) {
    super(
      `File size ${(actualBytes / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed ${(maxBytes / 1024 / 1024).toFixed(2)}MB for category "${category}".`,
      413
    );
    this.name = 'FileOversizedError';
    this.maxBytes = maxBytes;
    this.actualBytes = actualBytes;
  }
}

export class FileDisallowedTypeError extends FileValidationError {
  constructor(reason: string) {
    super(reason, 422);
    this.name = 'FileDisallowedTypeError';
  }
}

export class MaliciousFileDetectedError extends FileValidationError {
  constructor(details: string) {
    super(`Malicious file signature detected: ${details}`, 422);
    this.name = 'MaliciousFileDetectedError';
  }
}

export interface CategoryRule {
  readonly maxBytes: number;
  readonly allowedMimes: readonly string[];
  readonly allowedExtensions: readonly string[];
}

export const CATEGORY_LIMITS: Record<StorageCategory, CategoryRule> = {
  kyc: {
    maxBytes: 10 * 1024 * 1024, // 10MB
    allowedMimes: ['application/pdf', 'image/png', 'image/jpeg'],
    allowedExtensions: ['.pdf', '.png', '.jpg', '.jpeg'],
  },
  logos: {
    maxBytes: 2 * 1024 * 1024, // 2MB
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
    allowedExtensions: ['.png', '.jpg', '.jpeg', '.webp'],
  },
  disputes: {
    maxBytes: 20 * 1024 * 1024, // 20MB
    allowedMimes: [
      'application/pdf',
      'application/zip',
      'image/png',
      'image/jpeg',
    ],
    allowedExtensions: ['.pdf', '.zip', '.png', '.jpg', '.jpeg'],
  },
  invoices: {
    maxBytes: 5 * 1024 * 1024, // 5MB
    allowedMimes: ['application/pdf'],
    allowedExtensions: ['.pdf'],
  },
  receipts: {
    maxBytes: 5 * 1024 * 1024, // 5MB
    allowedMimes: ['application/pdf', 'image/png', 'image/jpeg'],
    allowedExtensions: ['.pdf', '.png', '.jpg', '.jpeg'],
  },
  exports: {
    maxBytes: 25 * 1024 * 1024, // 25MB
    allowedMimes: ['text/csv', 'application/json', 'application/pdf'],
    allowedExtensions: ['.csv', '.json', '.pdf'],
  },
};

/**
 * Sniffs binary magic bytes to determine the true MIME type and detect malicious executable signatures.
 */
export function detectBufferMimeType(buffer: Buffer): {
  mime: string | null;
  extension: string | null;
  isExecutable: boolean;
} {
  if (!buffer || buffer.length < 4) {
    return { mime: null, extension: null, isExecutable: false };
  }

  // 1. Detect dangerous executable headers
  // Windows PE executable / DLL ("MZ")
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { mime: 'application/x-dosexec', extension: '.exe', isExecutable: true };
  }

  // Linux ELF binary ("\x7FELF")
  if (
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return { mime: 'application/x-elf', extension: '', isExecutable: true };
  }

  // Shell script shebang ("#!/")
  if (buffer[0] === 0x23 && buffer[1] === 0x21) {
    return { mime: 'text/x-shellscript', extension: '.sh', isExecutable: true };
  }

  // PHP script tags ("<?php" or "<?=")
  const headerUtf8 = buffer.slice(0, 30).toString('utf8').toLowerCase();
  if (headerUtf8.includes('<?php') || headerUtf8.includes('<?=')) {
    return { mime: 'application/x-php', extension: '.php', isExecutable: true };
  }

  // 2. Detect allowed safe document and image formats
  // PDF: starts with "%PDF-"
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { mime: 'application/pdf', extension: '.pdf', isExecutable: false };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', extension: '.png', isExecutable: false };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', extension: '.jpg', isExecutable: false };
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer.length >= 12 &&
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', extension: '.webp', isExecutable: false };
  }

  // ZIP: "PK\x03\x04"
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return { mime: 'application/zip', extension: '.zip', isExecutable: false };
  }

  // Text / CSV / JSON sniffing
  const textSample = buffer.slice(0, 1024).toString('utf8').trim();
  if (textSample.startsWith('{') || textSample.startsWith('[')) {
    try {
      JSON.parse(textSample);
      return { mime: 'application/json', extension: '.json', isExecutable: false };
    } catch {
      // Partial JSON or other text
    }
  }

  // Plain ASCII / CSV check (no null bytes in sample)
  let isAscii = true;
  const sampleLen = Math.min(buffer.length, 512);
  for (let i = 0; i < sampleLen; i++) {
    if (buffer[i] === 0) {
      isAscii = false;
      break;
    }
  }

  if (isAscii && (textSample.includes(',') || textSample.includes(';'))) {
    return { mime: 'text/csv', extension: '.csv', isExecutable: false };
  }

  return { mime: null, extension: null, isExecutable: false };
}

/**
 * Validates a file payload against category size limits, file extension rules,
 * and magic byte binary sniffing.
 */
export function validateFileUpload(
  buffer: Buffer,
  filename: string,
  category: StorageCategory,
  declaredContentType?: string
): { valid: boolean; detectedMime: string; sizeBytes: number } {
  const rule = CATEGORY_LIMITS[category];
  if (!rule) {
    throw new FileDisallowedTypeError(`Unknown storage category: "${category}".`);
  }

  // 1. Step 040.3: Size limit check (HTTP 413 on overflow)
  if (buffer.length > rule.maxBytes) {
    throw new FileOversizedError(category, rule.maxBytes, buffer.length);
  }

  if (buffer.length === 0) {
    throw new FileValidationError('Uploaded file buffer cannot be empty (0 bytes).', 422);
  }

  // 2. Extension check
  const ext = path.extname(filename).toLowerCase();
  if (!rule.allowedExtensions.includes(ext)) {
    throw new FileDisallowedTypeError(
      `File extension "${ext}" is not permitted for category "${category}". Allowed extensions: ${rule.allowedExtensions.join(', ')}.`
    );
  }

  // 3. Step 040.1 & 040.4: Magic byte binary sniffing & malicious header inspection
  const detected = detectBufferMimeType(buffer);

  if (detected.isExecutable) {
    throw new MaliciousFileDetectedError(
      `File "${filename}" contains forbidden executable or script binary header (${detected.mime}).`
    );
  }

  if (!detected.mime) {
    throw new FileDisallowedTypeError(
      `Unable to verify genuine file type from binary magic bytes for "${filename}". Upload rejected.`
    );
  }

  // 4. Verify detected binary MIME matches category allowance
  if (!rule.allowedMimes.includes(detected.mime)) {
    throw new FileDisallowedTypeError(
      `Detected file MIME "${detected.mime}" is not allowed for category "${category}". Allowed: ${rule.allowedMimes.join(', ')}.`
    );
  }

  // 5. If declaredContentType was provided, ensure it matches detected MIME family
  if (declaredContentType) {
    const normDeclared = declaredContentType.toLowerCase().split(';')[0]?.trim();
    if (normDeclared && normDeclared !== detected.mime) {
      // JPEG exception: image/jpeg matches image/jpg
      const isJpegMatch =
        (normDeclared === 'image/jpeg' && detected.mime === 'image/jpeg') ||
        (normDeclared === 'image/jpg' && detected.mime === 'image/jpeg');

      if (!isJpegMatch) {
        throw new FileDisallowedTypeError(
          `Declared Content-Type "${normDeclared}" does not match detected binary type "${detected.mime}". Potential spoofing detected.`
        );
      }
    }
  }

  return {
    valid: true,
    detectedMime: detected.mime,
    sizeBytes: buffer.length,
  };
}
