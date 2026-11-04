// path: tests/auth/register.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from '../../app/api/auth/register/route';
import { RegisterRequestSchema } from '../../lib/validation/auth';
import { resetRateLimits } from '../../lib/security/rate-limit';
import { UserRepository } from '../../lib/db/users';
import { CompanyRepository } from '../../lib/db/companies';
import { CompanyMemberRepository } from '../../lib/db/memberships';
import { AuditLogRepository } from '../../lib/db/audit';
import { verifyPassword } from '../../lib/auth/password';

describe('Step 046: Merchant & Staff Registration Endpoint with Turnstile Guard', () => {
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

  describe('Step 046.1: Registration Zod Schema Validation', () => {
    it('accepts compliant registration payload with complex password and turnstile token', () => {
      const validPayload = {
        email: 'Merchant.CEO@kdsolution.it ',
        password: 'SuperP@ssword2026!Secure',
        full_legal_name: 'Johnathan Doe',
        turnstile_token: '1x0000000000000000000000000000000AA',
        company_name: 'Acme Payments Corp',
      };

      const parsed = RegisterRequestSchema.parse(validPayload);
      expect(parsed.email).toBe('merchant.ceo@kdsolution.it'); // Lowercased and trimmed
      expect(parsed.full_legal_name).toBe('Johnathan Doe');
      expect(parsed.turnstile_token).toBe('1x0000000000000000000000000000000AA');
    });

    it('rejects passwords shorter than 12 characters', () => {
      const payload = {
        email: 'ceo@example.com',
        password: 'Short1!pass',
        full_legal_name: 'John Doe',
        turnstile_token: '1x0000000000000000000000000000000AA',
      };

      expect(() => RegisterRequestSchema.parse(payload)).toThrowError(/at least 12 characters/);
    });

    it('rejects passwords missing special characters or numbers', () => {
      const payloadNoSymbol = {
        email: 'ceo@example.com',
        password: 'NoSpecialSymbol123456',
        full_legal_name: 'John Doe',
        turnstile_token: '1x0000000000000000000000000000000AA',
      };

      expect(() => RegisterRequestSchema.parse(payloadNoSymbol)).toThrowError(/special symbol/);

      const payloadNoNumber = {
        email: 'ceo@example.com',
        password: 'NoNumbersInPassword!@#',
        full_legal_name: 'John Doe',
        turnstile_token: '1x0000000000000000000000000000000AA',
      };

      expect(() => RegisterRequestSchema.parse(payloadNoNumber)).toThrowError(/one number/);
    });

    it('rejects missing or empty Turnstile token', () => {
      const payload = {
        email: 'ceo@example.com',
        password: 'SuperP@ssword2026!Secure',
        full_legal_name: 'John Doe',
        turnstile_token: '',
      };

      expect(() => RegisterRequestSchema.parse(payload)).toThrowError(/Turnstile verification token is required/);
    });
  });

  describe('Step 046.2 & Step 046.4: Cloudflare Turnstile Verification & User Creation', () => {
    it('successfully registers user with status pending_verification given valid Turnstile token', async () => {
      const req = new Request('https://api.kdsolution.it/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({
          email: 'Merchant.Alice@KDsolution.IT',
          password: 'Alice#Password2026!KD',
          full_legal_name: 'Alice Smith',
          turnstile_token: '1x0000000000000000000000000000000AA', // CF pass token
          company_name: 'Alice Global Commerce',
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
      expect(json.email).toBe('merchant.alice@kdsolution.it'); // Normalized
      expect(json.full_legal_name).toBe('Alice Smith');
      expect(json.company_id).toBeTruthy();
      expect(json.user_id).toBeTruthy();

      // Verify persisted user in database
      const user = await userRepo.findById(json.user_id);
      expect(user).toBeDefined();
      expect(user?.status).toBe('pending_verification');
      expect(user?.is_staff).toBe(false);
      expect(await verifyPassword('Alice#Password2026!KD', user!.password_hash)).toBe(true);

      // Verify audit log entry
      const auditEntries = await auditRepo.findMany();
      const regAudit = auditEntries.find((e) => e.entity_id === json.user_id);
      expect(regAudit).toBeDefined();
      expect(regAudit?.action).toBe('USER_REGISTERED');
    });

    it('rejects registration when Cloudflare Turnstile token is invalid', async () => {
      const req = new Request('https://api.kdsolution.it/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.20',
        },
        body: JSON.stringify({
          email: 'bot@spammer.net',
          password: 'BotP@ssword2026!Spam',
          full_legal_name: 'Spam Bot 3000',
          turnstile_token: '2x0000000000000000000000000000000AB', // CF fail token
        }),
      });

      const res = await POST(req, {
        userRepo,
        companyRepo,
        memberRepo,
        auditRepo,
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.title).toBe('Bot Verification Failed');

      // Verify no user was created
      const user = await userRepo.findByEmail('bot@spammer.net');
      expect(user).toBeNull();
    });

    it('rejects duplicate email registrations with 409 Conflict', async () => {
      const makeRequest = (email: string) =>
        new Request('https://api.kdsolution.it/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': '203.0.113.30',
          },
          body: JSON.stringify({
            email,
            password: 'ValidP@ssword2026!KD',
            full_legal_name: 'Duplicate Test',
            turnstile_token: '1x0000000000000000000000000000000AA',
          }),
        });

      // First signup
      const res1 = await POST(makeRequest('duplicate@example.com'), {
        userRepo,
        companyRepo,
        memberRepo,
        auditRepo,
      });
      expect(res1.status).toBe(201);

      // Second signup with same email (different casing)
      const res2 = await POST(makeRequest('DUPLICATE@EXAMPLE.COM'), {
        userRepo,
        companyRepo,
        memberRepo,
        auditRepo,
      });
      expect(res2.status).toBe(409);
      const json2 = await res2.json();
      expect(json2.title).toBe('Email Conflict');
    });

    it('rejects malformed JSON payload with 400 Bad Request', async () => {
      const req = new Request('https://api.kdsolution.it/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.40',
        },
        body: 'invalid-json-string{bad}',
      });

      const res = await POST(req, {
        userRepo,
        companyRepo,
        memberRepo,
        auditRepo,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.title).toBe('Bad Request');
    });
  });

  describe('Step 046.3: Strict IP Rate Limiting (5 Attempts / Hour)', () => {
    it('allows up to 5 registration attempts from an IP and blocks the 6th with 429 Too Many Requests', async () => {
      const ip = '198.51.100.99';

      const sendAttempt = (index: number) =>
        new Request('https://api.kdsolution.it/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': ip,
          },
          body: JSON.stringify({
            email: `attempt_${index}@kdsolution.it`,
            password: 'AttemptP@ssword2026!KD',
            full_legal_name: `Attempt User ${index}`,
            turnstile_token: '1x0000000000000000000000000000000AA',
          }),
        });

      // Attempts 1 through 5 must be permitted
      for (let i = 1; i <= 5; i++) {
        const res = await POST(sendAttempt(i), {
          userRepo,
          companyRepo,
          memberRepo,
          auditRepo,
        });
        expect(res.status).toBe(201);
        expect(res.headers.get('x-ratelimit-limit')).toBe('5');
        expect(res.headers.get('x-ratelimit-remaining')).toBe(String(5 - i));
      }

      // 6th attempt from the same IP must be blocked
      const res6 = await POST(sendAttempt(6), {
        userRepo,
        companyRepo,
        memberRepo,
        auditRepo,
      });

      expect(res6.status).toBe(429);
      expect(res6.headers.get('retry-after')).toBeTruthy();
      expect(res6.headers.get('x-ratelimit-remaining')).toBe('0');

      const json6 = await res6.json();
      expect(json6.title).toBe('Too Many Requests');
      expect(json6.detail).toContain('Maximum 5 attempts per hour');
    });

    it('does not penalize a different IP address when one IP exceeds rate limits', async () => {
      const ipA = '198.51.100.101';
      const ipB = '198.51.100.102';

      // Exhaust IP A
      for (let i = 1; i <= 5; i++) {
        await POST(
          new Request('https://api.kdsolution.it/api/auth/register', {
            method: 'POST',
            headers: { 'x-forwarded-for': ipA, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: `user_ipa_${i}@kdsolution.it`,
              password: 'UserA#Password2026!KD',
              full_legal_name: 'User A',
              turnstile_token: '1x0000000000000000000000000000000AA',
            }),
          }),
          { userRepo, companyRepo, memberRepo, auditRepo }
        );
      }

      // IP B should still be allowed on its first attempt
      const resB = await POST(
        new Request('https://api.kdsolution.it/api/auth/register', {
          method: 'POST',
          headers: { 'x-forwarded-for': ipB, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'user_ipb_1@kdsolution.it',
            password: 'UserB#Password2026!KD',
            full_legal_name: 'User B',
            turnstile_token: '1x0000000000000000000000000000000AA',
          }),
        }),
        { userRepo, companyRepo, memberRepo, auditRepo }
      );

      expect(resB.status).toBe(201);
      expect(resB.headers.get('x-ratelimit-remaining')).toBe('4');
    });
  });
});
