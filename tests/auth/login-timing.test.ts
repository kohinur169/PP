// path: tests/auth/login-timing.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword } from '../../lib/auth/password';
import { authenticateUser, GENERIC_AUTH_ERROR_MESSAGE } from '../../lib/auth/login';
import { POST } from '../../app/api/auth/login/route';
import { UserRepository } from '../../lib/db/users';
import { AuditLogRepository } from '../../lib/db/audit';
import { resetRateLimits } from '../../lib/security/rate-limit';
import { clearSessionRegistry } from '../../lib/auth/session';
import type { DeviceCharacteristics } from '../../lib/auth/session-types';

describe('Step 049: Anti-Enumeration Login API with Strict Rate Limiting', () => {
  let userRepo: UserRepository;
  let auditRepo: AuditLogRepository;
  const testPassword = 'Correct#Horse#Battery#Staple#2026';
  let existingUserEmail: string;
  let existingUserId: string;

  const testDevice: DeviceCharacteristics = {
    ip: '198.51.100.55',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    acceptLanguage: 'en-US,en;q=0.9',
  };

  beforeEach(async () => {
    resetRateLimits();
    clearSessionRegistry();
    userRepo = new UserRepository();
    auditRepo = new AuditLogRepository();

    const hashedPassword = await hashPassword(testPassword);
    existingUserEmail = `verified.ceo.${Date.now()}.${Math.random().toString(36).substring(2, 6)}@kdsolution.it`;

    const user = await userRepo.createUser({
      email: existingUserEmail,
      full_legal_name: 'Giuseppe Verdi',
      password_hash: hashedPassword,
      status: 'active',
      is_staff: false,
      failed_attempts: 0,
      locked_until: null,
    });
    existingUserId = user.id;
  });

  describe('Step 049.2 & Quality Gate: Anti-Enumeration Constant-Time Latency & Error Identicality', () => {
    it('returns exactly identical error message for existing user with wrong password vs non-existent user', async () => {
      // 1. Non-existent email attempt
      const nonExistentResult = await authenticateUser(
        {
          email: 'unknown.ghost.user@kdsolution.it',
          password: 'SomeRandomPassword123!',
          device: testDevice,
        },
        { userRepo, auditRepo }
      );

      // 2. Existing email attempt with wrong password
      const wrongPasswordResult = await authenticateUser(
        {
          email: existingUserEmail,
          password: 'IncorrectPassword#999!',
          device: testDevice,
        },
        { userRepo, auditRepo }
      );

      expect(nonExistentResult.success).toBe(false);
      expect(wrongPasswordResult.success).toBe(false);

      // Error messages and error codes must be 100% indistinguishable
      expect(nonExistentResult.message).toBe(GENERIC_AUTH_ERROR_MESSAGE);
      expect(wrongPasswordResult.message).toBe(GENERIC_AUTH_ERROR_MESSAGE);
      expect(nonExistentResult.error).toBe('INVALID_CREDENTIALS');
      expect(wrongPasswordResult.error).toBe('INVALID_CREDENTIALS');
    });

    it('measures timing differences between existing and non-existing email logins to ensure minimal variance', async () => {
      // Warm up JIT and Argon2id native library
      await authenticateUser(
        {
          email: 'warmup@kdsolution.it',
          password: 'WarmupPassword#1234',
          device: testDevice,
        },
        { userRepo, auditRepo }
      );

      const iterations = 3;
      let nonExistentTotalMs = 0;
      let wrongPasswordTotalMs = 0;

      for (let i = 0; i < iterations; i++) {
        const t1 = performance.now();
        await authenticateUser(
          {
            email: `nonexistent_${i}@kdsolution.it`,
            password: 'CandidatePassword#123!',
            device: testDevice,
          },
          { userRepo, auditRepo }
        );
        nonExistentTotalMs += performance.now() - t1;

        const t2 = performance.now();
        await authenticateUser(
          {
            email: existingUserEmail,
            password: 'WrongCandidatePassword#123!',
            device: testDevice,
          },
          { userRepo, auditRepo }
        );
        wrongPasswordTotalMs += performance.now() - t2;
      }

      const avgNonExistent = nonExistentTotalMs / iterations;
      const avgWrongPassword = wrongPasswordTotalMs / iterations;
      const timingVariance = Math.abs(avgNonExistent - avgWrongPassword);

      // The Argon2id execution cost dominates both paths (m=65536, t=3, p=4)
      // Confirm timing difference is tightly bounded (<35ms under test runner load)
      expect(timingVariance).toBeLessThan(35);
    });
  });

  describe('Step 049.1 & Step 049.3: Login API Route, Turnstile & Strict IP Rate Limiting', () => {
    it('successfully authenticates active user and issues LR-022 session with 200 OK and cookie', async () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '198.51.100.77',
          'user-agent': 'Chrome/120.0',
        },
        body: JSON.stringify({
          email: existingUserEmail,
          password: testPassword,
        }),
      });

      const res = await POST(req, { userRepo, auditRepo });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.session_token).toBeDefined();
      expect(json.session_id).toBeDefined();
      expect(json.user.id).toBe(existingUserId);
      expect(json.user.email).toBe(existingUserEmail.toLowerCase());

      // Verify Set-Cookie header
      const cookie = res.headers.get('set-cookie');
      expect(cookie).toBeDefined();
      expect(cookie).toContain('kd_session=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('Max-Age=28800'); // 8 hours
    });

    it('rejects login when Cloudflare Turnstile token validation fails', async () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '198.51.100.88',
        },
        body: JSON.stringify({
          email: existingUserEmail,
          password: testPassword,
          turnstile_token: 'invalid_bot_token',
        }),
      });

      const res = await POST(req, {
        userRepo,
        auditRepo,
        turnstileValidator: () => false,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.title).toBe('Bot Verification Failed');
    });

    it('enforces strict IP rate limit: permits 10 attempts per minute, blocks 11th with 429 Too Many Requests', async () => {
      const ip = '198.51.100.99';

      const makeRequest = () =>
        new Request('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-connecting-ip': ip,
          },
          body: JSON.stringify({
            email: 'rate.limit.test@kdsolution.it',
            password: 'DummyPassword#123!',
          }),
        });

      // Attempts 1 through 10 must be permitted through to authentication
      for (let i = 1; i <= 10; i++) {
        const res = await POST(makeRequest(), { userRepo, auditRepo });
        expect(res.status).toBe(401); // 401 Invalid Credentials
        expect(res.headers.get('x-ratelimit-limit')).toBe('10');
      }

      // The 11th attempt must be blocked by rate limiter
      const blockedRes = await POST(makeRequest(), { userRepo, auditRepo });
      expect(blockedRes.status).toBe(429);

      const json = await blockedRes.json();
      expect(json.title).toBe('Too Many Authentication Attempts');
      expect(blockedRes.headers.get('retry-after')).toBeDefined();
    });

    it('rejects login with 403 Forbidden if user email is pending verification', async () => {
      const unverifiedUser = await userRepo.createUser({
        email: 'unverified.merchant@kdsolution.it',
        full_legal_name: 'Unverified Merchant',
        password_hash: await hashPassword(testPassword),
        status: 'pending_verification',
        is_staff: false,
        failed_attempts: 0,
        locked_until: null,
      });

      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '198.51.100.33',
        },
        body: JSON.stringify({
          email: unverifiedUser.email,
          password: testPassword,
        }),
      });

      const res = await POST(req, { userRepo, auditRepo });
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.title).toBe('Email Not Verified');
      expect(json.detail).toContain('verify your email address before logging in');
    });

    it('triggers account lockout after 2 consecutive failed password attempts', async () => {
      // First failed attempt
      const attempt1 = await authenticateUser(
        {
          email: existingUserEmail,
          password: 'WrongPassword#1',
          device: testDevice,
        },
        { userRepo, auditRepo }
      );
      expect(attempt1.success).toBe(false);

      const userAfterFirst = await userRepo.findById(existingUserId);
      expect(userAfterFirst?.failed_attempts).toBe(1);
      expect(userAfterFirst?.locked_until).toBeNull();

      // Second failed attempt triggers 2-hour lockout
      const attempt2 = await authenticateUser(
        {
          email: existingUserEmail,
          password: 'WrongPassword#2',
          device: testDevice,
        },
        { userRepo, auditRepo }
      );
      expect(attempt2.success).toBe(false);

      const userAfterSecond = await userRepo.findById(existingUserId);
      expect(userAfterSecond?.failed_attempts).toBe(2);
      expect(userAfterSecond?.status).toBe('locked');
      expect(userAfterSecond?.locked_until).not.toBeNull();

      // Subsequent attempt (even with CORRECT password) is rejected while locked
      const attemptWhileLocked = await authenticateUser(
        {
          email: existingUserEmail,
          password: testPassword,
          device: testDevice,
        },
        { userRepo, auditRepo }
      );
      expect(attemptWhileLocked.success).toBe(false);
      expect(attemptWhileLocked.error).toBe('ACCOUNT_LOCKED');
    });
  });
});
