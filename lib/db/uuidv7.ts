// path: lib/db/uuidv7.ts

import crypto from 'node:crypto';

/**
 * RFC 9562 UUIDv7 strict canonical format regular expression.
 * Matches 8-4-4-4-12 lowercase or uppercase hex characters where:
 * - Version digit at position 13 is '7'
 * - Variant digit at position 17 is '8', '9', 'a', 'b', 'A', or 'B'
 */
export const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Optional generation parameters for UUIDv7.
 */
export interface UuidV7GeneratorOptions {
  /**
   * Explicit UNIX timestamp in milliseconds or Date instance.
   * Defaults to Date.now() when omitted.
   */
  readonly timestamp?: number | Date;
}

/**
 * Parsed metadata extracted from an RFC 9562 UUIDv7 string.
 */
export interface UuidV7Metadata {
  readonly uuid: string;
  readonly timestampMs: number;
  readonly timestampDate: Date;
  readonly version: number;
  readonly variant: string;
}

/**
 * Monotonic UUIDv7 Generator.
 * Implements RFC 9562 Section 6.2 (Method 1: Fixed-Length Dedicated Counter)
 * ensuring strict sub-millisecond chronological ordering and collision resistance.
 */
export class MonotonicUuidV7Generator {
  private lastTimestampMs: number = 0;
  private sequenceCounter: number = 0;

  /**
   * Resets generator internal state (useful for test isolation).
   */
  public reset(): void {
    this.lastTimestampMs = 0;
    this.sequenceCounter = 0;
  }

  /**
   * Generates a canonical RFC 9562 UUIDv7 string.
   */
  public generate(options?: UuidV7GeneratorOptions): string {
    let timestampMs: number;

    if (options?.timestamp !== undefined) {
      timestampMs =
        options.timestamp instanceof Date
          ? options.timestamp.getTime()
          : Math.floor(options.timestamp);

      if (!Number.isFinite(timestampMs) || timestampMs < 0 || timestampMs > 0xffffffffffff) {
        throw new RangeError(
          `Invalid UUIDv7 timestamp: ${String(options.timestamp)}. Must be between 0 and 281474976710655 (48 bits).`
        );
      }
    } else {
      timestampMs = Date.now();
    }

    // Monotonic sequence tracking for automatic timestamps
    if (options?.timestamp === undefined) {
      if (timestampMs <= this.lastTimestampMs) {
        timestampMs = this.lastTimestampMs;
        this.sequenceCounter++;

        // If 18-bit sequence overflows (262,143), advance virtual millisecond
        if (this.sequenceCounter > 0x3ffff) {
          this.lastTimestampMs++;
          timestampMs = this.lastTimestampMs;
          this.sequenceCounter = 0;
        }
      } else {
        this.lastTimestampMs = timestampMs;
        // 10-bit random initial counter offset to avoid predictable sequence beginnings
        this.sequenceCounter = crypto.randomInt(0, 0x400);
      }
    } else {
      // Explicit historical or future timestamp supplied
      this.sequenceCounter = crypto.randomInt(0, 0x400);
    }

    // 48-bit UNIX millisecond timestamp hex string (12 characters)
    const timeHex = timestampMs.toString(16).padStart(12, '0');

    // 12-bit rand_a from sequence counter (3 characters)
    const randAHex = (this.sequenceCounter & 0xfff).toString(16).padStart(3, '0');

    // Variant octet (bits 64-65: 10xx, bits 66-71: sequence bits 12-17)
    const variantAndSeq = (0x80 | ((this.sequenceCounter >> 12) & 0x3f))
      .toString(16)
      .padStart(2, '0');

    // Cryptographically secure random tail (7 bytes = 14 hex characters)
    const randomTailBytes = crypto.randomBytes(7);
    const randomTailHex = randomTailBytes.toString('hex');

    // RFC 9562 UUIDv7 layout: 8-4-4-4-12 hex characters
    const part1 = timeHex.slice(0, 8);
    const part2 = timeHex.slice(8, 12);
    const part3 = '7' + randAHex;
    const part4 = variantAndSeq + randomTailHex.slice(0, 2);
    const part5 = randomTailHex.slice(2, 14);

    return `${part1}-${part2}-${part3}-${part4}-${part5}`.toLowerCase();
  }

  /**
   * Generates raw 16-byte buffer representing the 128-bit UUIDv7.
   */
  public generateBytes(options?: UuidV7GeneratorOptions): Uint8Array {
    const uuid = this.generate(options);
    return uuidV7ToBuffer(uuid);
  }
}

/**
 * Shared singleton instance for application-wide UUIDv7 generation.
 */
export const defaultUuidV7Generator = new MonotonicUuidV7Generator();

/**
 * Generates an RFC 9562 compliant UUID version 7 string.
 *
 * @param options - Optional generation configuration including custom timestamp.
 * @returns 36-character hyphenated UUIDv7 string in canonical lowercase format.
 */
export function generateUuidV7(options?: UuidV7GeneratorOptions): string {
  return defaultUuidV7Generator.generate(options);
}

/**
 * Generates raw 16-byte Uint8Array representing a UUID version 7.
 */
export function generateUuidV7Bytes(options?: UuidV7GeneratorOptions): Uint8Array {
  return defaultUuidV7Generator.generateBytes(options);
}

/**
 * Validates whether a given string is a strictly conformant RFC 9562 UUID version 7 identifier.
 *
 * @param uuid - UUID string to inspect.
 * @returns true if valid UUIDv7, false otherwise.
 */
export function isValidUuidV7(uuid: string): boolean {
  if (typeof uuid !== 'string' || uuid.length !== 36) {
    return false;
  }
  return UUID_V7_REGEX.test(uuid);
}

/**
 * Extracts the 48-bit UNIX millisecond timestamp from an RFC 9562 UUIDv7 identifier.
 *
 * @param uuid - Valid UUIDv7 string.
 * @returns Milliseconds since UNIX epoch (1970-01-01T00:00:00.000Z).
 * @throws TypeError if input is not a valid UUIDv7 identifier.
 */
export function extractUuidV7TimestampMs(uuid: string): number {
  if (!isValidUuidV7(uuid)) {
    throw new TypeError(`Cannot extract timestamp: invalid UUIDv7 identifier "${String(uuid)}"`);
  }

  // First 8 characters + next 4 characters = first 12 hex digits (48 bits)
  const hexTimestamp = uuid.slice(0, 8) + uuid.slice(9, 13);
  return parseInt(hexTimestamp, 16);
}

/**
 * Extracts a JavaScript Date object from an RFC 9562 UUIDv7 identifier.
 *
 * @param uuid - Valid UUIDv7 string.
 * @returns Date object representing the moment of UUIDv7 generation.
 * @throws TypeError if input is not a valid UUIDv7 identifier.
 */
export function extractUuidV7Timestamp(uuid: string): Date {
  const ms = extractUuidV7TimestampMs(uuid);
  return new Date(ms);
}

/**
 * Parses and returns detailed structural metadata from a UUIDv7 string.
 */
export function getUuidV7Metadata(uuid: string): UuidV7Metadata {
  const timestampMs = extractUuidV7TimestampMs(uuid);
  return {
    uuid: uuid.toLowerCase(),
    timestampMs,
    timestampDate: new Date(timestampMs),
    version: 7,
    variant: 'RFC 9562 / RFC 4122 (10xx)',
  };
}

/**
 * Lexicographical comparator for two UUIDv7 strings.
 * Because UUIDv7 stores high-order bits of time first in big-endian hex,
 * lexicographical comparison exactly mirrors chronological timestamp order.
 *
 * @returns Negative if a < b, positive if a > b, 0 if identical.
 */
export function compareUuidV7(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Converts a 36-character hyphenated UUID string into a 16-byte Uint8Array.
 */
export function uuidV7ToBuffer(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) {
    throw new TypeError(`Invalid UUID string length: expected 32 hex characters without hyphens.`);
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Converts a 16-byte Uint8Array into a canonical 36-character hyphenated UUID string.
 */
export function bufferToUuidV7(buffer: Uint8Array): string {
  if (buffer.length !== 16) {
    throw new TypeError(`Invalid buffer length: expected exactly 16 bytes, received ${buffer.length}`);
  }

  const hexArray: string[] = [];
  for (let i = 0; i < 16; i++) {
    hexArray.push(buffer[i]!.toString(16).padStart(2, '0'));
  }
  const hex = hexArray.join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`.toLowerCase();
}
