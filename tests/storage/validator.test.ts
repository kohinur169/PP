// path: tests/storage/validator.test.ts

import { describe, it, expect } from 'vitest';
import {
  validateFileUpload,
  detectBufferMimeType,
  FileOversizedError,
  FileDisallowedTypeError,
  MaliciousFileDetectedError,
  FileValidationError,
  CATEGORY_LIMITS,
} from '../../lib/storage/validator';

describe('File Upload Validator (Step 040)', () => {
  // Helpers to generate test buffers with accurate magic bytes
  const createPdfBuffer = (size: number = 100): Buffer => {
    const header = Buffer.from('%PDF-1.7\n%Fake PDF binary content for testing\n');
    const padding = Buffer.alloc(Math.max(0, size - header.length), 0x20);
    return Buffer.concat([header, padding]);
  };

  const createPngBuffer = (size: number = 100): Buffer => {
    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const padding = Buffer.alloc(Math.max(0, size - header.length), 0xaa);
    return Buffer.concat([header, padding]);
  };

  const createJpegBuffer = (size: number = 100): Buffer => {
    const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const padding = Buffer.alloc(Math.max(0, size - header.length), 0xbb);
    return Buffer.concat([header, padding]);
  };

  const createWebpBuffer = (size: number = 100): Buffer => {
    const riff = Buffer.from('RIFF');
    const sizeBytes = Buffer.from([0x24, 0x00, 0x00, 0x00]);
    const webp = Buffer.from('WEBP');
    const padding = Buffer.alloc(Math.max(0, size - 12), 0xcc);
    return Buffer.concat([riff, sizeBytes, webp, padding]);
  };

  const createZipBuffer = (size: number = 100): Buffer => {
    const header = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const padding = Buffer.alloc(Math.max(0, size - header.length), 0xdd);
    return Buffer.concat([header, padding]);
  };

  const createExeBuffer = (size: number = 100): Buffer => {
    // Windows MZ DOS header
    const header = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    const padding = Buffer.alloc(Math.max(0, size - header.length), 0x00);
    return Buffer.concat([header, padding]);
  };

  const createElfBuffer = (size: number = 100): Buffer => {
    // Linux ELF binary header
    const header = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    const padding = Buffer.alloc(Math.max(0, size - header.length), 0x00);
    return Buffer.concat([header, padding]);
  };

  const createPhpScriptBuffer = (): Buffer => {
    return Buffer.from('<?php echo "malicious payload"; system($_GET["cmd"]); ?>');
  };

  const createShellScriptBuffer = (): Buffer => {
    return Buffer.from('#!/bin/bash\nrm -rf / --no-preserve-root\n');
  };

  describe('Magic Byte Sniffing (detectBufferMimeType)', () => {
    it('accurately identifies genuine file signatures', () => {
      expect(detectBufferMimeType(createPdfBuffer()).mime).toBe('application/pdf');
      expect(detectBufferMimeType(createPngBuffer()).mime).toBe('image/png');
      expect(detectBufferMimeType(createJpegBuffer()).mime).toBe('image/jpeg');
      expect(detectBufferMimeType(createWebpBuffer()).mime).toBe('image/webp');
      expect(detectBufferMimeType(createZipBuffer()).mime).toBe('application/zip');
    });

    it('flags executable and script signatures as dangerous', () => {
      const exe = detectBufferMimeType(createExeBuffer());
      expect(exe.isExecutable).toBe(true);
      expect(exe.mime).toBe('application/x-dosexec');

      const elf = detectBufferMimeType(createElfBuffer());
      expect(elf.isExecutable).toBe(true);

      const php = detectBufferMimeType(createPhpScriptBuffer());
      expect(php.isExecutable).toBe(true);

      const sh = detectBufferMimeType(createShellScriptBuffer());
      expect(sh.isExecutable).toBe(true);
    });

    it('detects JSON and CSV text content safely', () => {
      const jsonBuf = Buffer.from(JSON.stringify({ status: 'ok', records: [1, 2, 3] }));
      expect(detectBufferMimeType(jsonBuf).mime).toBe('application/json');

      const csvBuf = Buffer.from('id,merchant_id,amount,currency\n1,m_123,450.00,USD\n');
      expect(detectBufferMimeType(csvBuf).mime).toBe('text/csv');
    });
  });

  describe('Malicious File Spoofing & Rejection (Quality Gate: Step 040.1 & 040.4)', () => {
    it('rejects a fake PDF containing Windows PE executable (.exe in disguise) with HTTP 422', () => {
      const disguisedExe = createExeBuffer(2048);

      expect(() => {
        validateFileUpload(disguisedExe, 'passport_scan.pdf', 'kyc', 'application/pdf');
      }).toThrowError(MaliciousFileDetectedError);

      try {
        validateFileUpload(disguisedExe, 'passport_scan.pdf', 'kyc');
      } catch (err: any) {
        expect(err).toBeInstanceOf(MaliciousFileDetectedError);
        expect(err.statusCode).toBe(422);
        expect(err.message).toContain('forbidden executable or script binary header');
      }
    });

    it('rejects Linux ELF binary disguised as a JPEG logo', () => {
      const disguisedElf = createElfBuffer(1024);

      expect(() => {
        validateFileUpload(disguisedElf, 'company_logo.jpg', 'logos', 'image/jpeg');
      }).toThrowError(MaliciousFileDetectedError);
    });

    it('rejects PHP web shell script disguised as a PNG image', () => {
      const phpShell = createPhpScriptBuffer();

      expect(() => {
        validateFileUpload(phpShell, 'national_id_front.png', 'kyc', 'image/png');
      }).toThrowError(MaliciousFileDetectedError);
    });

    it('rejects shell script disguised as dispute evidence PDF', () => {
      const shScript = createShellScriptBuffer();

      expect(() => {
        validateFileUpload(shScript, 'evidence_receipt.pdf', 'disputes', 'application/pdf');
      }).toThrowError(MaliciousFileDetectedError);
    });

    it('rejects declared Content-Type spoofing when declared type does not match binary', () => {
      // Buffer is genuine PNG, but user declared application/pdf with .pdf extension
      const pngBuffer = createPngBuffer(512);

      expect(() => {
        validateFileUpload(pngBuffer, 'statement.pdf', 'kyc', 'application/pdf');
      }).toThrowError(FileDisallowedTypeError);

      try {
        validateFileUpload(pngBuffer, 'statement.pdf', 'kyc', 'application/pdf');
      } catch (err: any) {
        expect(err.statusCode).toBe(422);
        expect(err.message).toContain('Declared Content-Type');
      }
    });

    it('rejects random corrupt or unknown binary data that cannot be verified', () => {
      const randomNoise = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);

      expect(() => {
        validateFileUpload(randomNoise, 'unknown.pdf', 'kyc');
      }).toThrowError(FileDisallowedTypeError);
    });
  });

  describe('Size Guards & Category Constraints (Step 040.2 & 040.3)', () => {
    it('rejects oversized KYC document (>10MB) with HTTP 413 FileOversizedError', () => {
      const oversizedKyc = createPdfBuffer(CATEGORY_LIMITS.kyc.maxBytes + 1024);

      expect(() => {
        validateFileUpload(oversizedKyc, 'trade_license.pdf', 'kyc');
      }).toThrowError(FileOversizedError);

      try {
        validateFileUpload(oversizedKyc, 'trade_license.pdf', 'kyc');
      } catch (err: any) {
        expect(err).toBeInstanceOf(FileOversizedError);
        expect(err.statusCode).toBe(413);
        expect(err.actualBytes).toBeGreaterThan(CATEGORY_LIMITS.kyc.maxBytes);
      }
    });

    it('rejects oversized logo (>2MB) with HTTP 413', () => {
      const oversizedLogo = createPngBuffer(CATEGORY_LIMITS.logos.maxBytes + 500);

      expect(() => {
        validateFileUpload(oversizedLogo, 'logo_huge.png', 'logos');
      }).toThrowError(FileOversizedError);

      try {
        validateFileUpload(oversizedLogo, 'logo_huge.png', 'logos');
      } catch (err: any) {
        expect(err.statusCode).toBe(413);
      }
    });

    it('rejects oversized dispute evidence pack (>20MB) with HTTP 413', () => {
      const oversizedDispute = createZipBuffer(CATEGORY_LIMITS.disputes.maxBytes + 1024);

      expect(() => {
        validateFileUpload(oversizedDispute, 'chargeback_evidence.zip', 'disputes');
      }).toThrowError(FileOversizedError);
    });

    it('rejects empty 0-byte buffer', () => {
      expect(() => {
        validateFileUpload(Buffer.alloc(0), 'empty.pdf', 'kyc');
      }).toThrowError(FileValidationError);
    });

    it('rejects disallowed file extensions for category (e.g. ZIP inside KYC)', () => {
      const zipBuffer = createZipBuffer(1024);

      expect(() => {
        validateFileUpload(zipBuffer, 'kyc_bundle.zip', 'kyc');
      }).toThrowError(FileDisallowedTypeError);
    });
  });

  describe('Valid File Upload Acceptance', () => {
    it('accepts genuine KYC PDF, PNG, and JPEG documents', () => {
      const pdf = createPdfBuffer(2048);
      const resPdf = validateFileUpload(pdf, 'passport.pdf', 'kyc', 'application/pdf');
      expect(resPdf.valid).toBe(true);
      expect(resPdf.detectedMime).toBe('application/pdf');

      const png = createPngBuffer(1024);
      const resPng = validateFileUpload(png, 'id_card.png', 'kyc', 'image/png');
      expect(resPng.valid).toBe(true);
      expect(resPng.detectedMime).toBe('image/png');

      const jpeg = createJpegBuffer(1500);
      const resJpeg = validateFileUpload(jpeg, 'utility_bill.jpg', 'kyc', 'image/jpeg');
      expect(resJpeg.valid).toBe(true);
      expect(resJpeg.detectedMime).toBe('image/jpeg');
    });

    it('accepts genuine merchant logo formats (PNG, JPEG, WEBP)', () => {
      const webp = createWebpBuffer(2048);
      const resWebp = validateFileUpload(webp, 'brand_badge.webp', 'logos', 'image/webp');
      expect(resWebp.valid).toBe(true);
      expect(resWebp.detectedMime).toBe('image/webp');
    });

    it('accepts dispute evidence packs (ZIP, PDF)', () => {
      const zip = createZipBuffer(4096);
      const resZip = validateFileUpload(zip, 'dispute_proof.zip', 'disputes', 'application/zip');
      expect(resZip.valid).toBe(true);
      expect(resZip.detectedMime).toBe('application/zip');
    });

    it('accepts export files (CSV, JSON)', () => {
      const csv = Buffer.from('id,name,value\n1,alpha,100\n');
      const resCsv = validateFileUpload(csv, 'ledger_report.csv', 'exports', 'text/csv');
      expect(resCsv.valid).toBe(true);
      expect(resCsv.detectedMime).toBe('text/csv');

      const json = Buffer.from(JSON.stringify({ export_id: 'exp_1', count: 42 }));
      const resJson = validateFileUpload(json, 'audit_dump.json', 'exports', 'application/json');
      expect(resJson.valid).toBe(true);
      expect(resJson.detectedMime).toBe('application/json');
    });
  });
});
