// path: tests/auth/totp-enrollment.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateTotp,
  generateTotpSecret,
  generateOtpAuthUri,
  generateQrCodeDataUrl,
  generateQrCodeSvg,
  otplibGenerateSecret,
  otplibVerifyToken,
  encryptTotpSecret,
  decryptTotpSecret,
  startUserTotpEnrollment,
  verifyEnrollmentCode,
  isUser2faEnrolled,
  evaluate2faRedirect,
} from '@/lib/auth/totp';
import {
  evaluateRequest2faRequirement,
} from '@/lib/auth/middleware';
import { UserRepository } from '@/lib/db/users';
import { UserMfaRepository } from '@/lib/db/mfa';
import { AuditLogRepository } from '@/lib/db/audit';
import { POST as setupPostRoute } from '@/app/api/auth/2fa/setup/route';
import { POST as verifyPostRoute } from '@/app/api/auth/2fa/verify-enrollment/route';
import { DecryptionError } from '@/lib/crypto/aes';

describe('Step 052: Mandatory 2FA TOTP Enrollment & QR Code Generator', () => {
  let userRepo: UserRepository;
  let mfaRepo: UserMfaRepository;
  let auditRepo: AuditLogRepository;

  const testUserId = '01a1a5b8-5000-7000-8000-111122223333';
  const testUserEmail = 'merchant.compliance@kdsolution.it';

  beforeEach(async () => {
    userRepo = new UserRepository();
    mfaRepo = new UserMfaRepository();
    auditRepo = new AuditLogRepository();

    await userRepo.createUser({
      id: testUserId,
      email: testUserEmail,
      full_legal_name: 'Merchant Test User',
      password_hash: 'argon2id$mocked$hash',
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
      is_staff: false,
    });
  });

  describe('Step 052.1: Library Integration (otplib & qrcode)', () => {
    it('generates a valid Base64 PNG data URL from an otpauth URI', async () => {
      const secret = generateTotpSecret(20);
      const uri = generateOtpAuthUri('test@kdsolution.it', secret, 'KD SOLUTION IT');

      const dataUrl = await generateQrCodeDataUrl(uri);
      expect(dataUrl).toBeTypeOf('string');
      expect(dataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
      expect(dataUrl.length).toBeGreaterThan(100);
    });

    it('generates a clean SVG string containing <svg and <path', async () => {
      const secret = generateTotpSecret(20);
      const uri = generateOtpAuthUri('test@kdsolution.it', secret, 'KD SOLUTION IT');

      const svg = await generateQrCodeSvg(uri);
      expect(svg).toBeTypeOf('string');
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('<path');
    });

    it('supports otplib helper functions for external standard compatibility', () => {
      const secret = otplibGenerateSecret();
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);

      // Verify with native code
      const currentToken = generateTotp(secret);
      const valid = otplibVerifyToken({ token: currentToken, secret });
      expect(valid).toBe(true);

      const invalid = otplibVerifyToken({ token: '000000', secret });
      expect(invalid).toBe(false);
    });
  });

  describe('Step 052.2: Secret Generation & AES-256-GCM Encrypted Storage', () => {
    it('generates a standard 20-byte Base32 secret string', () => {
      const secret = generateTotpSecret(testUserId);
      expect(secret).toBeTypeOf('string');
      expect(secret.length).toBe(32); // 20 bytes = 160 bits / 5 = 32 Base32 characters
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    });

    it('encrypts TOTP secret at rest with AES-256-GCM and decrypts accurately', () => {
      const secret = generateTotpSecret(20);
      const encrypted = encryptTotpSecret(secret, testUserId);

      expect(encrypted).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
      expect(encrypted).not.toContain(secret);

      const decrypted = decryptTotpSecret(encrypted, testUserId);
      expect(decrypted).toBe(secret);
    });

    it('fails to decrypt if tampered or attempted under different userId context', () => {
      const secret = generateTotpSecret(20);
      const encrypted = encryptTotpSecret(secret, testUserId);

      const wrongUserId = '01a1a5b8-9999-7000-8000-999988887777';
      expect(() => decryptTotpSecret(encrypted, wrongUserId)).toThrowError(DecryptionError);

      // Tamper with ciphertext
      const parts = encrypted.split(':');
      const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:0000${parts[3]!.slice(4)}`;
      expect(() => decryptTotpSecret(tampered, testUserId)).toThrowError(DecryptionError);
    });

    it('initializes enrollment in database with mfa_enabled = false', async () => {
      const setup = await startUserTotpEnrollment(testUserId, testUserEmail, { mfaRepo });

      expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(setup.otpauthUri).toContain('KD%20SOLUTION%20IT');
      expect(setup.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

      const record = await mfaRepo.findByUserId(testUserId);
      expect(record).not.toBeNull();
      expect(record!.mfa_enabled).toBe(false);
      expect(record!.totp_secret_encrypted).toBe(setup.encryptedSecret);

      const isEnrolled = await isUser2faEnrolled(testUserId, { mfaRepo });
      expect(isEnrolled).toBe(false);
    });

    it('setup API POST /api/auth/2fa/setup initializes configuration for authenticated user', async () => {
      const req = new Request('http://localhost:3000/api/auth/2fa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': testUserId,
        },
      });

      const res = await setupPostRoute(req, { userRepo, mfaRepo });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(body.otpauth_uri).toContain(encodeURIComponent(testUserEmail));
      expect(body.qr_code_data_url).toMatch(/^data:image\/png;base64,/);
    });

    it('setup API rejects unauthenticated requests with 401 Unauthorized RFC 7807', async () => {
      const req = new Request('http://localhost:3000/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await setupPostRoute(req, { userRepo, mfaRepo });
      expect(res.status).toBe(401);
      expect(res.headers.get('content-type')).toContain('application/problem+json');

      const problem = await res.json();
      expect(problem.status).toBe(401);
      expect(problem.title).toBe('Unauthorized');
    });

    it('setup API rejects users who already have 2FA enabled with 409 Conflict', async () => {
      // Setup and activate 2FA
      const setup = await startUserTotpEnrollment(testUserId, testUserEmail, { mfaRepo });
      const currentCode = generateTotp(setup.secret);
      await verifyEnrollmentCode(testUserId, currentCode, { mfaRepo, auditRepo });

      const req = new Request('http://localhost:3000/api/auth/2fa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': testUserId,
        },
      });

      const res = await setupPostRoute(req, { userRepo, mfaRepo });
      expect(res.status).toBe(409);

      const problem = await res.json();
      expect(problem.status).toBe(409);
      expect(problem.title).toBe('2FA Already Active');
    });
  });

  describe('Step 052.3: Verification of Enrollment Code & Activation', () => {
    it('verifies valid 6-digit code, enables MFA, and logs 2FA_ENROLLED audit event', async () => {
      const setup = await startUserTotpEnrollment(testUserId, testUserEmail, { mfaRepo });
      const currentCode = generateTotp(setup.secret);

      const verifyResult = await verifyEnrollmentCode(testUserId, currentCode, {
        mfaRepo,
        auditRepo,
      });

      expect(verifyResult.valid).toBe(true);

      const mfaRecord = await mfaRepo.findByUserId(testUserId);
      expect(mfaRecord!.mfa_enabled).toBe(true);
      expect(mfaRecord!.last_used_step).toBe(verifyResult.step);

      // Verify audit trail
      const audits = await auditRepo.findMany();
      const enrolledAudit = audits.find((a) => a.action === '2FA_ENROLLED');
      expect(enrolledAudit).toBeDefined();
      expect(enrolledAudit!.entity_id).toBe(testUserId);
      expect(enrolledAudit!.diff_payload?.after).toEqual({ mfa_enabled: true });
    });

    it('rejects invalid or expired verification code and leaves 2FA disabled', async () => {
      await startUserTotpEnrollment(testUserId, testUserEmail, { mfaRepo });

      const verifyResult = await verifyEnrollmentCode(testUserId, '000000', {
        mfaRepo,
        auditRepo,
      });

      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.error).toContain('Invalid or expired');

      const isEnrolled = await isUser2faEnrolled(testUserId, { mfaRepo });
      expect(isEnrolled).toBe(false);
    });

    it('prevents replay of the same TOTP token within the same time window', async () => {
      const setup = await startUserTotpEnrollment(testUserId, testUserEmail, { mfaRepo });
      const currentCode = generateTotp(setup.secret);

      const firstVerify = await verifyEnrollmentCode(testUserId, currentCode, {
        mfaRepo,
        auditRepo,
      });
      expect(firstVerify.valid).toBe(true);

      // Second attempt with identical code is blocked
      const replayVerify = await verifyEnrollmentCode(testUserId, currentCode, {
        mfaRepo,
        auditRepo,
      });
      expect(replayVerify.valid).toBe(false);
      expect(replayVerify.error).toContain('Replay detected');
    });

    it('verify API POST /api/auth/2fa/verify-enrollment activates 2FA for valid code', async () => {
      const setup = await startUserTotpEnrollment(testUserId, testUserEmail, { mfaRepo });
      const currentCode = generateTotp(setup.secret);

      const req = new Request('http://localhost:3000/api/auth/2fa/verify-enrollment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': testUserId,
        },
        body: JSON.stringify({ code: currentCode }),
      });

      const res = await verifyPostRoute(req, { userRepo, mfaRepo, auditRepo });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.mfa_enabled).toBe(true);
    });

    it('verify API rejects non-numeric or non-6-digit codes with 400 Bad Request', async () => {
      await startUserTotpEnrollment(testUserId, testUserEmail, { mfaRepo });

      const req = new Request('http://localhost:3000/api/auth/2fa/verify-enrollment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': testUserId,
        },
        body: JSON.stringify({ code: '123' }),
      });

      const res = await verifyPostRoute(req, { userRepo, mfaRepo, auditRepo });
      expect(res.status).toBe(400);

      const problem = await res.json();
      expect(problem.status).toBe(400);
      expect(problem.detail).toContain('Verification code must be exactly 6 numeric digits');
    });
  });

  describe('Step 052.4: Middleware Interceptor for Mandatory 2FA', () => {
    it('redirects un-enrolled authenticated user to /auth/2fa/setup on protected paths', () => {
      const decision = evaluate2faRedirect(
        { id: testUserId, mfa_enabled: false },
        '/dashboard'
      );

      expect(decision.shouldRedirect).toBe(true);
      expect(decision.destination).toBe('/auth/2fa/setup');
    });

    it('does not redirect un-enrolled user on exempt authentication or setup paths', () => {
      const setupPage = evaluate2faRedirect(
        { id: testUserId, mfa_enabled: false },
        '/auth/2fa/setup'
      );
      expect(setupPage.shouldRedirect).toBe(false);

      const apiSetup = evaluate2faRedirect(
        { id: testUserId, mfa_enabled: false },
        '/api/auth/2fa/setup'
      );
      expect(apiSetup.shouldRedirect).toBe(false);

      const apiVerify = evaluate2faRedirect(
        { id: testUserId, mfa_enabled: false },
        '/api/auth/2fa/verify-enrollment'
      );
      expect(apiVerify.shouldRedirect).toBe(false);

      const logout = evaluate2faRedirect(
        { id: testUserId, mfa_enabled: false },
        '/api/auth/logout'
      );
      expect(logout.shouldRedirect).toBe(false);
    });

    it('allows 2FA-enrolled authenticated user to access protected routes without redirect', () => {
      const decision = evaluate2faRedirect(
        { id: testUserId, mfa_enabled: true },
        '/dashboard'
      );

      expect(decision.shouldRedirect).toBe(false);
    });

    it('middleware evaluates incoming request headers and returns redirect decision', async () => {
      const req = new Request('http://localhost:3000/dashboard', {
        headers: { 'x-user-id': testUserId },
      });

      // User has not enrolled yet
      const decision1 = await evaluateRequest2faRequirement(req, { mfaRepo });
      expect(decision1.shouldRedirect).toBe(true);
      expect(decision1.destination).toBe('/auth/2fa/setup');

      // Now enroll user in 2FA
      const setup = await startUserTotpEnrollment(testUserId, testUserEmail, { mfaRepo });
      const currentCode = generateTotp(setup.secret);
      await verifyEnrollmentCode(testUserId, currentCode, { mfaRepo, auditRepo });

      const decision2 = await evaluateRequest2faRequirement(req, { mfaRepo });
      expect(decision2.shouldRedirect).toBe(false);
    });
  });

  describe('Quality Gate: End-to-End Google Authenticator / Authy Enrollment Flow', () => {
    it('executes full enrollment lifecycle from setup to code verification and access unlock', async () => {
      // 1. Initial State: User is not enrolled
      expect(await isUser2faEnrolled(testUserId, { mfaRepo })).toBe(false);

      // 2. Setup: Client requests 2FA setup configuration
      const setupReq = new Request('http://localhost:3000/api/auth/2fa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': testUserId,
        },
      });

      const setupRes = await setupPostRoute(setupReq, { userRepo, mfaRepo });
      expect(setupRes.status).toBe(200);
      const setupBody = await setupRes.json();

      expect(setupBody.secret).toBeDefined();
      expect(setupBody.qr_code_data_url).toContain('data:image/png;base64');

      // 3. User attempts to browse dashboard before completing verification -> BLOCKED
      const dashReq = new Request('http://localhost:3000/dashboard', {
        headers: { 'x-user-id': testUserId },
      });
      const gateCheck1 = await evaluateRequest2faRequirement(dashReq, { mfaRepo });
      expect(gateCheck1.shouldRedirect).toBe(true);
      expect(gateCheck1.destination).toBe('/auth/2fa/setup');

      // 4. Authenticator device computes valid 6-digit TOTP code
      const authenticatorCode = generateTotp(setupBody.secret);

      // 5. Client submits verification code to endpoint
      const verifyReq = new Request('http://localhost:3000/api/auth/2fa/verify-enrollment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': testUserId,
        },
        body: JSON.stringify({ code: authenticatorCode }),
      });

      const verifyRes = await verifyPostRoute(verifyReq, { userRepo, mfaRepo, auditRepo });
      expect(verifyRes.status).toBe(200);
      const verifyBody = await verifyRes.json();
      expect(verifyBody.success).toBe(true);
      expect(verifyBody.mfa_enabled).toBe(true);

      // 6. Verification completed: User is officially enrolled
      expect(await isUser2faEnrolled(testUserId, { mfaRepo })).toBe(true);

      // 7. Protected route is immediately unlocked without redirect
      const gateCheck2 = await evaluateRequest2faRequirement(dashReq, { mfaRepo });
      expect(gateCheck2.shouldRedirect).toBe(false);
    });
  });
});
