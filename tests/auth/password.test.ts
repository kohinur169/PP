// path: tests/auth/password.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword, verifyPassword } from '../../lib/auth/password';
import {
  checkBreachedPassword,
  checkPasswordComplexity,
  evaluatePasswordSecurity,
  parsePwnedRangeResponse,
  MINIMUM_ZXCVBN_SCORE,
} from '../../lib/auth/pwned';
import { POST } from '../../app/api/auth/register/route';
import { UserRepository } from '../../lib/db/users';
import { CompanyRepository } from '../../lib/db/companies';
import { CompanyMemberRepository } from '../../lib/db/memberships';
import { AuditLogRepository } from '../../lib/db/audit';
import { resetRateLimits } from '../../lib/security/rate-limit';

describe('Step 047: Argon2id Password Hashing & HaveIBeenPwned Breach Checker', () => {
  let userRepo: UserRepository;
  let companyRepo: CompanyRepository;
  let memberRepo: CompanyMemberRepository;
  let auditRepo: AuditLogRepository;

  beforeEach(() => {
    userRepo = new UserRepository();
    companyRepo = new CompanyRepository();
    memberRepo = new CompanyMemberRepository();
    auditRepo = new AuditLogRepository();
    resetRateLimits();
  });

  describe('Step 047.1: Argon2id Password Hashing & Verification Engine', () => {
    it('hashes passwords using Argon2id with OWASP recommended memory and time parameters', async () => {
      const plaintext = 'Enterprise#Payfac2026!SecureGlobal';
      const hash = await hashPassword(plaintext);

      // Verify Argon2id format: $argon2id$v=19$m=65536,t=3,p=4$...
      expect(hash.startsWith('$argon2id$')).toBe(true);
      expect(hash).toContain('m=65536,t=3,p=4');

      // Verify correct password matches
      const isCorrect = await verifyPassword(plaintext, hash);
      expect(isCorrect).toBe(true);

      // Verify incorrect password fails
      const isWrong = await verifyPassword('WrongPassword123!KD', hash);
      expect(isWrong).toBe(false);
    });

    it('gracefully verifies legacy PBKDF2-SHA512 password hashes for backward compatibility', async () => {
      // Synthetic legacy PBKDF2 hash
      const password = 'LegacyPassword2026!';
      const salt = 'aabbccddeeff00112233445566778899';
      const crypto = await import('node:crypto');
      const derivedKey = crypto
        .pbkdf2Sync(password, salt, 100_000, 64, 'sha512')
        .toString('hex');
      const legacyHash = `pbkdf2_sha512$100000$${salt}$${derivedKey}`;

      expect(await verifyPassword(password, legacyHash)).toBe(true);
      expect(await verifyPassword('IncorrectPassword123!', legacyHash)).toBe(false);
    });

    it('rejects invalid or empty password inputs', async () => {
      await expect(hashPassword('')).rejects.toThrow();
      expect(await verifyPassword('', '$argon2id$invalid')).toBe(false);
      expect(await verifyPassword('somepass', 'invalid-hash-string')).toBe(false);
    });
  });

  describe('Step 047.2: HaveIBeenPwned k-Anonymity Range Protocol & Breach Detection', () => {
    it('correctly parses HIBP range response format <SUFFIX>:<COUNT>', () => {
      const mockRangeResponse = `
0018A45C4D1DEF81644B54AB7F969B88D65:10
00D4F6E13FA5CDC2BB564C1142A129D7BEB:2
012A7CA357541F0892244822AC74110E47E:1543
`;
      expect(parsePwnedRangeResponse(mockRangeResponse, '012A7CA357541F0892244822AC74110E47E')).toBe(1543);
      expect(parsePwnedRangeResponse(mockRangeResponse, '00D4F6E13FA5CDC2BB564C1142A129D7BEB')).toBe(2);
      expect(parsePwnedRangeResponse(mockRangeResponse, 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe(0);
    });

    it('flags common breached passwords as compromised', async () => {
      const breachedResult = await checkBreachedPassword('P@ssword1234!');
      expect(breachedResult.breached).toBe(true);
      expect(breachedResult.count).toBeGreaterThan(0);
      expect(breachedResult.sha1Prefix.length).toBe(5);
    });

    it('passes high-entropy unique unbreached passwords', async () => {
      const unbreachedResult = await checkBreachedPassword('KdSolution#UniqueToken98124!PlatformZ');
      expect(unbreachedResult.breached).toBe(false);
      expect(unbreachedResult.count).toBe(0);
    });

    it('supports custom HIBP range fetcher injection for deterministic test coverage', async () => {
      const testPassword = 'CustomTestingPassword123!';
      const crypto = await import('node:crypto');
      const sha1 = crypto.createHash('sha1').update(testPassword, 'utf8').digest('hex').toUpperCase();
      const testSuffix = sha1.slice(5);

      const customFetcher = async () => `
${testSuffix}:42
OTHER_SUFFIX_0000000000000000000000:5
`;

      const result = await checkBreachedPassword(testPassword, { customFetcher });
      expect(result.breached).toBe(true);
      expect(result.count).toBe(42);
    });
  });

  describe('Step 047.3: zxcvbn Password Complexity Scoring (Minimum Score >= 3)', () => {
    it('rejects predictable or dictionary-based passwords with zxcvbn score < 3', () => {
      // 'P@ssword1234!' meets 12 chars + symbol rules but has zxcvbn score = 2
      const result = checkPasswordComplexity('P@ssword1234!');
      expect(result.score).toBeLessThan(MINIMUM_ZXCVBN_SCORE);
      expect(result.acceptable).toBe(false);
    });

    it('accepts strong, unguessable passwords with zxcvbn score >= 3', () => {
      const strongPassword = 'KdSolution#Payfac2026!GlobalVault';
      const result = checkPasswordComplexity(strongPassword);
      expect(result.score).toBeGreaterThanOrEqual(MINIMUM_ZXCVBN_SCORE);
      expect(result.acceptable).toBe(true);
    });
  });

  describe('Step 047.4: Unit Tests Verifying Rejection of Common Breached Passwords', () => {
    it('evaluates and rejects common breached passwords via evaluatePasswordSecurity', async () => {
      const breachedCandidates = [
        'P@ssword1234!',
        'Password1234!',
        'Admin123456!',
        '123456789012',
      ];

      for (const candidate of breachedCandidates) {
        const evalResult = await evaluatePasswordSecurity(candidate);
        expect(evalResult.valid).toBe(false);
        expect(evalResult.errorMessage).toBeTruthy();
      }
    });

    it('passes comprehensive evaluation for a strong, unbreached merchant password', async () => {
      const strongPassword = 'Enterprise#SecureVault2026!Platform';
      const evalResult = await evaluatePasswordSecurity(strongPassword);

      expect(evalResult.valid).toBe(true);
      expect(evalResult.breached).toBe(false);
      expect(evalResult.complexity.score).toBeGreaterThanOrEqual(3);
      expect(evalResult.errorMessage).toBeUndefined();
    });
  });

  describe('Step 047 Quality Gate: Registration Endpoint Breach Guard Verification', () => {
    it('rejects registration with compromised breached password with standard error message', async () => {
      const req = new Request('https://api.kdsolution.it/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.88',
        },
        body: JSON.stringify({
          email: 'breach.test@kdsolution.it',
          password: 'P@ssword1234!', // Known breached password
          full_legal_name: 'Breached User',
          turnstile_token: '1x0000000000000000000000000000000AA',
        }),
      });

      const res = await POST(req, {
        userRepo,
        companyRepo,
        memberRepo,
        auditRepo,
      });

      expect(res.status).toBe(400);
      const json = await res.json();

      expect(json.title).toBe('Insecure Password');
      expect(json.detail).toBe(
        'Password has been compromised in public breaches. Please choose a different, secure password.'
      );

      // Verify user was NOT created in repository
      const user = await userRepo.findByEmail('breach.test@kdsolution.it');
      expect(user).toBeNull();
    });

    it('successfully registers user with strong unbreached password and stores Argon2id hash', async () => {
      const strongPassword = 'KD_PayFac#Enterprise2026!AlphaVault';

      const req = new Request('https://api.kdsolution.it/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.89',
        },
        body: JSON.stringify({
          email: 'secure.ceo@kdsolution.it',
          password: strongPassword,
          full_legal_name: 'Secure CEO',
          turnstile_token: '1x0000000000000000000000000000000AA',
        }),
      });

      const res = await POST(req, {
        userRepo,
        companyRepo,
        memberRepo,
        auditRepo,
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.status).toBe('pending_verification');

      // Verify persisted user in database has Argon2id hash
      const user = await userRepo.findById(json.user_id);
      expect(user).toBeDefined();
      expect(user?.password_hash.startsWith('$argon2id$')).toBe(true);

      // Verify password can be validated against the Argon2id hash
      const isValid = await verifyPassword(strongPassword, user!.password_hash);
      expect(isValid).toBe(true);
    });
  });
});
