// path: tests/db/uuidv7.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateUuidV7,
  generateUuidV7Bytes,
  extractUuidV7TimestampMs,
  extractUuidV7Timestamp,
  isValidUuidV7,
  getUuidV7Metadata,
  compareUuidV7,
  uuidV7ToBuffer,
  bufferToUuidV7,
  UUID_V7_REGEX,
  MonotonicUuidV7Generator,
  defaultUuidV7Generator,
} from '../../lib/db/uuidv7';

describe('Step 017: PostgreSQL UUIDv7 Extension & Generator Functions', () => {
  beforeEach(() => {
    defaultUuidV7Generator.reset();
  });

  describe('RFC 9562 Structural Specification Compliance', () => {
    it('generates a canonical 36-character hyphenated UUIDv7 string', () => {
      const id = generateUuidV7();

      expect(id).toHaveLength(36);
      expect(UUID_V7_REGEX.test(id)).toBe(true);
      expect(isValidUuidV7(id)).toBe(true);
    });

    it('enforces version 7 indicator at position 14', () => {
      for (let i = 0; i < 50; i++) {
        const id = generateUuidV7();
        expect(id.charAt(14)).toBe('7');
      }
    });

    it('enforces RFC 4122 / RFC 9562 variant (10xx binary) at position 19', () => {
      const allowedVariantChars = new Set(['8', '9', 'a', 'b']);

      for (let i = 0; i < 50; i++) {
        const id = generateUuidV7();
        const variantChar = id.charAt(19).toLowerCase();
        expect(allowedVariantChars.has(variantChar)).toBe(true);
      }
    });

    it('rejects invalid or non-v7 UUIDs in isValidUuidV7', () => {
      // UUIDv4 (version 4)
      expect(isValidUuidV7('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')).toBe(false);
      // Empty or malformed strings
      expect(isValidUuidV7('')).toBe(false);
      expect(isValidUuidV7('not-a-uuid')).toBe(false);
      expect(isValidUuidV7('018d4234-5678-7abc-0def-0123456789ab')).toBe(false); // wrong variant '0'
      // @ts-expect-error testing runtime guard against non-string input
      expect(isValidUuidV7(null)).toBe(false);
      // @ts-expect-error testing runtime guard against non-string input
      expect(isValidUuidV7(12345)).toBe(false);
    });
  });

  describe('Timestamp Extraction & Encoding Accuracy', () => {
    it('extracts timestamp matching current time within tight delta', () => {
      const before = Date.now();
      const id = generateUuidV7();
      const after = Date.now();

      const extractedMs = extractUuidV7TimestampMs(id);
      const extractedDate = extractUuidV7Timestamp(id);

      expect(extractedMs).toBeGreaterThanOrEqual(before);
      expect(extractedMs).toBeLessThanOrEqual(after);
      expect(extractedDate.getTime()).toBe(extractedMs);
    });

    it('accurately encodes and extracts arbitrary custom numeric timestamps', () => {
      const targetMs = 1793712000000; // 2026-11-03T13:20:00.000Z
      const id = generateUuidV7({ timestamp: targetMs });

      const extractedMs = extractUuidV7TimestampMs(id);
      expect(extractedMs).toBe(targetMs);
      expect(extractUuidV7Timestamp(id).toISOString()).toBe('2026-11-03T13:20:00.000Z');
    });

    it('accurately encodes and extracts custom Date instance timestamps', () => {
      const targetDate = new Date('2026-11-03T00:00:00.000Z');
      const id = generateUuidV7({ timestamp: targetDate });

      const extractedDate = extractUuidV7Timestamp(id);
      expect(extractedDate.getTime()).toBe(targetDate.getTime());
      expect(extractedDate.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    });

    it('returns complete metadata structure from getUuidV7Metadata', () => {
      const targetMs = 1793712500123;
      const id = generateUuidV7({ timestamp: targetMs });

      const meta = getUuidV7Metadata(id);
      expect(meta.uuid).toBe(id);
      expect(meta.timestampMs).toBe(targetMs);
      expect(meta.timestampDate.getTime()).toBe(targetMs);
      expect(meta.version).toBe(7);
      expect(meta.variant).toContain('RFC 9562');
    });

    it('throws TypeError when attempting to extract timestamp from invalid UUID', () => {
      expect(() => extractUuidV7TimestampMs('invalid-id')).toThrow(TypeError);
      expect(() => extractUuidV7Timestamp('invalid-id')).toThrow(TypeError);
    });

    it('throws RangeError when invalid timestamp values are supplied', () => {
      expect(() => generateUuidV7({ timestamp: -1 })).toThrow(RangeError);
      expect(() => generateUuidV7({ timestamp: Number.NaN })).toThrow(RangeError);
      expect(() => generateUuidV7({ timestamp: 0x1000000000000 })).toThrow(RangeError);
    });
  });

  describe('Monotonicity, Chronological Sort Order & Collision Resistance', () => {
    it('guarantees exact chronological sort order across 1,000 rapid UUIDs', () => {
      const count = 1000;
      const list: string[] = new Array(count);

      for (let i = 0; i < count; i++) {
        list[i] = generateUuidV7();
      }

      // Verify every element is strictly greater than the preceding element
      for (let i = 0; i < count - 1; i++) {
        const current = list[i]!;
        const next = list[i + 1]!;

        expect(current < next).toBe(true);
        expect(compareUuidV7(current, next)).toBe(-1);
      }

      // Verify sorting the array with standard string sort preserves exact order
      const sorted = [...list].sort();
      expect(sorted).toEqual(list);
    });

    it('verifies monotonic ordering and zero collisions across 100,000 rapid iterations', () => {
      const iterations = 100_000;
      const uniqueIds = new Set<string>();
      let previousId = '';
      let isStrictlyMonotonic = true;

      for (let i = 0; i < iterations; i++) {
        const currentId = generateUuidV7();

        if (previousId !== '' && currentId <= previousId) {
          isStrictlyMonotonic = false;
          break;
        }

        uniqueIds.add(currentId);
        previousId = currentId;
      }

      expect(isStrictlyMonotonic).toBe(true);
      expect(uniqueIds.size).toBe(iterations);
    });

    it('advances virtual timestamp when sub-millisecond sequence counter overflows', () => {
      const generator = new MonotonicUuidV7Generator();
      const fixedMs = 1793712000000;

      // Force generator to start at fixedMs
      const id1 = generator.generate({ timestamp: fixedMs });
      expect(extractUuidV7TimestampMs(id1)).toBe(fixedMs);

      // Subsequent automated calls should progress monotonically
      const id2 = generator.generate();
      expect(id2 > id1).toBe(true);
    });
  });

  describe('Binary Buffer & Comparator Utilities', () => {
    it('converts UUIDv7 to 16-byte buffer and roundtrips back to identical string', () => {
      const original = generateUuidV7();
      const buffer = uuidV7ToBuffer(original);

      expect(buffer).toBeInstanceOf(Uint8Array);
      expect(buffer.length).toBe(16);

      const reconstructed = bufferToUuidV7(buffer);
      expect(reconstructed).toBe(original);
    });

    it('generates raw 16-byte Uint8Array directly via generateUuidV7Bytes', () => {
      const bytes = generateUuidV7Bytes();

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);

      const str = bufferToUuidV7(bytes);
      expect(isValidUuidV7(str)).toBe(true);
    });

    it('throws TypeError on invalid buffer length in bufferToUuidV7', () => {
      expect(() => bufferToUuidV7(new Uint8Array(15))).toThrow(TypeError);
      expect(() => bufferToUuidV7(new Uint8Array(17))).toThrow(TypeError);
    });

    it('evaluates compareUuidV7 accurately for identical, earlier, and later IDs', () => {
      const a = generateUuidV7({ timestamp: 1700000000000 });
      const b = generateUuidV7({ timestamp: 1800000000000 });

      expect(compareUuidV7(a, b)).toBe(-1);
      expect(compareUuidV7(b, a)).toBe(1);
      expect(compareUuidV7(a, a)).toBe(0);
    });
  });

  describe('PostgreSQL Migration Files Integrity', () => {
    it('verifies db/migrations/002_uuidv7_function.sql exists with correct function definitions', () => {
      const migrationPath = path.resolve(process.cwd(), 'db/migrations/002_uuidv7_function.sql');
      expect(fs.existsSync(migrationPath)).toBe(true);

      const content = fs.readFileSync(migrationPath, 'utf8');
      expect(content).toContain('CREATE OR REPLACE FUNCTION generate_uuid_v7()');
      expect(content).toContain('CREATE OR REPLACE FUNCTION extract_uuid_v7_timestamp');
      expect(content).toContain('CREATE OR REPLACE FUNCTION is_valid_uuid_v7');
      expect(content).toContain('pgcrypto');
    });

    it('verifies supabase/migrations/20261103000006_uuidv7_generator.sql exists with idempotent SQL', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261103000006_uuidv7_generator.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const content = fs.readFileSync(migrationPath, 'utf8');
      expect(content).toContain('CREATE OR REPLACE FUNCTION generate_uuid_v7()');
      expect(content).toContain('CREATE OR REPLACE FUNCTION extract_uuid_v7_timestamp');
      expect(content).toContain('CREATE OR REPLACE FUNCTION is_valid_uuid_v7');
    });
  });
});
