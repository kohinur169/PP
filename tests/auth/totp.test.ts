// path: tests/auth/totp.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  base32Encode,
  base32Decode,
  generateTotp,
  verifyTotp,
  generateTotpSecret,
  generateOtpAuthUri,
  generateRecoveryCodes,
  verifyAndConsumeBackupCode,
  setupTotpMfa,
} from '@/lib/auth';
import { loadMigrationFiles } from '@/lib/database';

describe('TOTP Multi-Factor Authentication RFC 6238 (Step 015)', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  describe('RFC 4648 Base32 Encoding & Decoding', () => {
    it('should correctly roundtrip arbitrary binary buffers through Base32', () => {
      const originalText = 'KD SOLUTION IT Fintech Platform';
      const originalBuffer = Buffer.from(originalText, 'utf8');

      const encoded = base32Encode(originalBuffer);
      expect(encoded).toMatch(/^[A-Z2-7]+$/);

      const decoded = base32Decode(encoded);
      expect(decoded.toString('utf8')).toBe(originalText);
    });

    it('should throw an error when encountering invalid Base32 characters', () => {
      expect(() => base32Decode('INVALID!@#$')).toThrowError(/Invalid Base32 character/);
      expect(() => base32Decode('8901')).toThrowError(/Invalid Base32 character/);
    });
  });

  describe('Official RFC 6238 Appendix B Test Vectors (HMAC-SHA1)', () => {
    // RFC 6238 Appendix B test secret: ASCII string "12345678901234567890" (20 bytes)
    // Base32 representation: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    const rfcSecretBase32 = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

    it('should match RFC 6238 test vector at T = 59 seconds', () => {
      const otp = generateTotp(rfcSecretBase32, 59 * 1000);
      expect(otp).toBe('287082');
    });

    it('should match RFC 6238 test vector at T = 1111111109 seconds', () => {
      const otp = generateTotp(rfcSecretBase32, 1111111109 * 1000);
      expect(otp).toBe('081804');
    });

    it('should match RFC 6238 test vector at T = 1111111111 seconds', () => {
      const otp = generateTotp(rfcSecretBase32, 1111111111 * 1000);
      expect(otp).toBe('050471');
    });

    it('should match RFC 6238 test vector at T = 1234567890 seconds', () => {
      const otp = generateTotp(rfcSecretBase32, 1234567890 * 1000);
      expect(otp).toBe('005924');
    });

    it('should match RFC 6238 test vector at T = 2000000000 seconds', () => {
      const otp = generateTotp(rfcSecretBase32, 2000000000 * 1000);
      expect(otp).toBe('279037');
    });
  });

  describe('Clock Skew Tolerance Window (+/- 1 Step = 30 Seconds)', () => {
    const secret = generateTotpSecret(20);
    const baseTimeMs = 1700000000000; // Fixed timestamp

    it('should accept current token and adjacent +/- 1 interval tokens', () => {
      const currentOtp = generateTotp(secret, baseTimeMs);
      const minusOneOtp = generateTotp(secret, baseTimeMs - 30000); // 30s in past
      const plusOneOtp = generateTotp(secret, baseTimeMs + 30000); // 30s in future

      expect(verifyTotp(currentOtp, secret, { timestamp: baseTimeMs }).valid).toBe(true);
      expect(verifyTotp(minusOneOtp, secret, { timestamp: baseTimeMs }).valid).toBe(true);
      expect(verifyTotp(plusOneOtp, secret, { timestamp: baseTimeMs }).valid).toBe(true);
    });

    it('should reject tokens outside the +/- 1 step window (>= 60 seconds drift)', () => {
      const minusTwoOtp = generateTotp(secret, baseTimeMs - 60000); // 60s in past
      const plusTwoOtp = generateTotp(secret, baseTimeMs + 60000); // 60s in future

      expect(verifyTotp(minusTwoOtp, secret, { timestamp: baseTimeMs }).valid).toBe(false);
      expect(verifyTotp(plusTwoOtp, secret, { timestamp: baseTimeMs }).valid).toBe(false);
    });
  });

  describe('Replay Attack Prevention', () => {
    const secret = generateTotpSecret(20);
    const baseTimeMs = 1700000000000;

    it('should prevent reusing the same TOTP token within the same time window', () => {
      const token = generateTotp(secret, baseTimeMs);

      // First verification succeeds
      const result1 = verifyTotp(token, secret, { timestamp: baseTimeMs });
      expect(result1.valid).toBe(true);
      expect(result1.step).toBeDefined();

      const lastUsedStep = result1.step!;

      // Second verification in same window rejected as replay
      const result2 = verifyTotp(token, secret, {
        timestamp: baseTimeMs,
        lastUsedStep,
      });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('Replay detected');
    });
  });

  describe('Backup Recovery Codes Engine', () => {
    it('should generate 8 high-entropy 10-character recovery codes with SHA-256 hashes', () => {
      const { plainCodes, hashedCodes } = generateRecoveryCodes(8);

      expect(plainCodes.length).toBe(8);
      expect(hashedCodes.length).toBe(8);

      for (const code of plainCodes) {
        // Format: XXXXX-XXXXX (11 chars total with dash)
        expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      }

      for (const hash of hashedCodes) {
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('should consume a backup code and return the remaining 7 hashes', () => {
      const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
      const targetCode = plainCodes[2]!;

      // Verify and consume code (even with lowercase and spaces)
      const dirtyInput = `  ${targetCode.toLowerCase()}  `;
      const result = verifyAndConsumeBackupCode(dirtyInput, hashedCodes);

      expect(result.valid).toBe(true);
      expect(result.remainingHashes?.length).toBe(7);

      // Replay attempt with same code fails
      const replayResult = verifyAndConsumeBackupCode(dirtyInput, result.remainingHashes!);
      expect(replayResult.valid).toBe(false);
      expect(replayResult.error).toContain('Invalid or already consumed');
    });
  });

  describe('Setup Flow & otpauth:// URI', () => {
    it('should configure complete MFA setup package with valid otpauth URI', () => {
      const setup = setupTotpMfa('admin@kdsolution.it', 'KD SOLUTION IT');

      expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(setup.otpauthUri).toContain('otpauth://totp/KD%20SOLUTION%20IT:admin%40kdsolution.it');
      expect(setup.otpauthUri).toContain(`secret=${setup.secret}`);
      expect(setup.otpauthUri).toContain('algorithm=SHA1');
      expect(setup.otpauthUri).toContain('digits=6');
      expect(setup.recoveryCodes.length).toBe(8);
    });
  });

  describe('Database Migration DDL Verification', () => {
    it('should define user_mfa table with encrypted secret and RLS policy', () => {
      const migrations = loadMigrationFiles(migrationsDir);
      const mfaMigration = migrations.find((m) => m.name === 'create_user_mfa_table');

      expect(mfaMigration).toBeDefined();
      const sql = mfaMigration!.sql;

      expect(sql).toContain('CREATE TABLE IF NOT EXISTS user_mfa');
      expect(sql).toContain('totp_secret_encrypted TEXT NOT NULL');
      expect(sql).toContain('backup_codes_hashes TEXT[] NOT NULL DEFAULT \'{}\'');
      expect(sql).toContain('mfa_enabled BOOLEAN NOT NULL DEFAULT false');
      expect(sql).toContain('ALTER TABLE user_mfa ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain("current_setting('app.current_user_id', true)");
    });
  });
});
