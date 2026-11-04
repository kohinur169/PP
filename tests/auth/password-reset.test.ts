// path: tests/auth/password-reset.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  requestPasswordReset,
  executePasswordReset,
  hashResetToken,
  RESET_TOKEN_EXPIRY_MS,
} from '@/lib/auth/password-reset';
import {
  createSession,
  getAndValidateSession,
  clearSessionRegistry,
} from '@/lib/auth';
import type { DeviceCharacteristics } from '@/lib/auth';
import { POST as forgotPasswordHandler } from '@/app/api/auth/forgot-password/route';
import { POST as resetPasswordHandler } from '@/app/api/auth/reset-password/route';
import { UserRepository } from '@/lib/db/users';
import { PasswordResetTokenRepository } from '@/lib/db/password-reset';
import { SessionRepository } from '@/lib/db/sessions';
import { AuditLogRepository } from '@/lib/db/audit';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('Step 060: Password Reset Flow with Turnstile & Lockout Immunity Guard', () => {
  let userRepo: UserRepository;
  let resetRepo: PasswordResetTokenRepository;
  let sessionRepo: SessionRepository;
  let auditRepo: AuditLogRepository;

  const testUserId = '018f6c4c-3500-7fa1-b1e2-666666666666';
  const testCompanyId = '018f6c4c-3500-7fa1-b1e2-000000000001';
  const testEmail = 'reset.merchant@kdsolution.it';
  const initialPassword = 'Initial_Password_2026!';

  beforeEach(async () => {
    clearSessionRegistry();
    userRepo = new UserRepository();
    resetRepo = new PasswordResetTokenRepository();
    sessionRepo = new SessionRepository();
    auditRepo = new AuditLogRepository();

    await userRepo.createUser({
      id: testUserId,
      email: testEmail,
      full_legal_name: 'Reset Merchant CEO',
      password_hash: await hashPassword(initialPassword),
      company_id: testCompanyId,
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
      is_staff: false,
    });
  });

  describe('Step 060.1: Database Schema & Dual Migrations', () => {
    it('verifies password_reset_tokens table definition in db/migrations and supabase/migrations', () => {
      const dbPath = path.join(
        process.cwd(),
        'db/migrations/020_create_password_reset_tokens.sql'
      );
      const supabasePath = path.join(
        process.cwd(),
        'supabase/migrations/20261103000024_create_password_reset_tokens.sql'
      );

      expect(fs.existsSync(dbPath)).toBe(true);
      expect(fs.existsSync(supabasePath)).toBe(true);

      const dbSql = fs.readFileSync(dbPath, 'utf8');
      const supabaseSql = fs.readFileSync(supabasePath, 'utf8');

      expect(dbSql).toContain('CREATE TABLE IF NOT EXISTS public.password_reset_tokens');
      expect(dbSql).toContain('token_hash varchar(64) NOT NULL UNIQUE');
      expect(dbSql).toContain('expires_at timestamptz NOT NULL');
      expect(dbSql).toContain('used_at timestamptz NULL');
      expect(dbSql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(dbSql).toContain('FORCE ROW LEVEL SECURITY');

      const stripPathComment = (sql: string) => sql.replace(/^-- path: [^\n]+\n+/, '');
      expect(stripPathComment(supabaseSql)).toBe(stripPathComment(dbSql));
    });

    it('verifies matching rollback definitions in .down.sql files', () => {
      const dbDown = path.join(
        process.cwd(),
        'db/migrations/020_create_password_reset_tokens.down.sql'
      );
      const supabaseDown = path.join(
        process.cwd(),
        'supabase/migrations/20261103000024_create_password_reset_tokens.down.sql'
      );

      expect(fs.existsSync(dbDown)).toBe(true);
      expect(fs.existsSync(supabaseDown)).toBe(true);

      const downSql = fs.readFileSync(dbDown, 'utf8');
      expect(downSql).toContain('DROP TABLE IF EXISTS public.password_reset_tokens CASCADE');
    });
  });

  describe('Step 060.2: Forgot Password Request & 1-Hour Token Expiration', () => {
    it('generates a 1-hour secure reset token and records AUTH_PASSWORD_RESET_REQUESTED audit log', async () => {
      const now = Date.now();
      const result = await requestPasswordReset(
        { email: testEmail, turnstileToken: '1x0000000000000000000000000000000AA' },
        { userRepo, resetRepo, auditRepo, nowMs: now }
      );

      expect(result.success).toBe(true);
      expect(result.tokenGenerated).toBe(true);
      expect(result.rawToken).toBeDefined();
      expect(result.rawToken!.length).toBe(64); // 32 bytes hex
      expect(result.expiresAt).toBeDefined();

      const expiryDiff = new Date(result.expiresAt!).getTime() - now;
      expect(expiryDiff).toBe(RESET_TOKEN_EXPIRY_MS); // Exactly 1 hour

      // Verify token hash is stored in repository, not plaintext
      const storedToken = await resetRepo.findByTokenHash(hashResetToken(result.rawToken!));
      expect(storedToken).not.toBeNull();
      expect(storedToken?.user_id).toBe(testUserId);
      expect(storedToken?.used_at).toBeNull();

      // Verify audit log
      const logs = await auditRepo.findMany();
      const resetLog = logs.find((l) => l.action === 'AUTH_PASSWORD_RESET_REQUESTED');
      expect(resetLog).toBeDefined();
      expect(resetLog?.entity_id).toBe(testUserId);
    });

    it('returns generic anti-enumeration response when email does not exist without creating token', async () => {
      const result = await requestPasswordReset(
        { email: 'nonexistent.user@unknown.com', turnstileToken: '1x0000000000000000000000000000000AA' },
        { userRepo, resetRepo, auditRepo }
      );

      expect(result.success).toBe(true);
      expect(result.tokenGenerated).toBe(false);
      expect(result.message).toContain('If an account exists for this email address');
      expect(result.rawToken).toBeUndefined();

      const allTokens = await resetRepo.findMany();
      expect(allTokens.length).toBe(0);
    });

    it('POST /api/auth/forgot-password route returns 200 with generic confirmation', async () => {
      const req = new Request('http://localhost:3000/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          turnstile_token: '1x0000000000000000000000000000000AA',
        }),
      });

      const res = await forgotPasswordHandler(req, { userRepo, resetRepo, auditRepo });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain('If an account exists for this email address');
    });
  });

  describe('Step 060.3 & Quality Gate: Lockout Immunity Guard', () => {
    it('Quality Gate: refuses token creation when account is actively in 2-hour lockout', async () => {
      const now = Date.now();
      const twoHoursLater = new Date(now + 2 * 60 * 60 * 1000).toISOString();

      // Lock user account
      const user = await userRepo.findById(testUserId);
      await userRepo.update(user!.id, user!.version, {
        locked_until: twoHoursLater,
        failed_attempts: 2,
      });

      // Attempt to request password reset
      const result = await requestPasswordReset(
        { email: testEmail, turnstileToken: '1x0000000000000000000000000000000AA' },
        { userRepo, resetRepo, auditRepo, nowMs: now }
      );

      // Caller receives generic anti-enumeration response
      expect(result.success).toBe(true);
      expect(result.tokenGenerated).toBe(false);
      expect(result.isLocked).toBe(true);
      expect(result.rawToken).toBeUndefined();

      // No token is stored in database
      const pendingTokens = await resetRepo.findPendingByUserId(testUserId, now);
      expect(pendingTokens).toBeNull();
    });

    it('Quality Gate: refuses token consumption when account is locked even if token was generated prior to lock', async () => {
      const now = Date.now();

      // 1. Token generated before account gets locked
      const forgotResult = await requestPasswordReset(
        { email: testEmail, turnstileToken: '1x0000000000000000000000000000000AA' },
        { userRepo, resetRepo, auditRepo, nowMs: now }
      );
      expect(forgotResult.tokenGenerated).toBe(true);
      const rawToken = forgotResult.rawToken!;

      // 2. Account subsequently gets locked by brute-force detector
      const user = await userRepo.findById(testUserId);
      const lockUntil = new Date(now + 2 * 60 * 60 * 1000).toISOString();
      await userRepo.update(user!.id, user!.version, {
        locked_until: lockUntil,
        failed_attempts: 2,
      });

      // 3. Attacker tries to consume reset token to bypass 2-hour lockout -> REJECTED
      const resetResult = await executePasswordReset(
        {
          token: rawToken,
          password: 'New_Complex_Password_2026!#',
        },
        { userRepo, resetRepo, sessionRepo, auditRepo, nowMs: now + 5000 }
      );

      expect(resetResult.success).toBe(false);
      expect(resetResult.error).toBe('ACCOUNT_LOCKED');
      expect(resetResult.message).toContain('Password reset cannot circumvent an active security lockout');

      // Verify password was NOT changed
      const unchangedUser = await userRepo.findById(testUserId);
      expect(await verifyPassword(initialPassword, unchangedUser!.password_hash)).toBe(true);

      // Verify token was NOT consumed
      const tokenRecord = await resetRepo.findByTokenHash(hashResetToken(rawToken));
      expect(tokenRecord?.used_at).toBeNull();

      // 4. API endpoint returns HTTP 403 Forbidden
      const apiReq = new Request('http://localhost:3000/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: rawToken,
          password: 'New_Complex_Password_2026!#',
        }),
      });

      const apiRes = await resetPasswordHandler(apiReq, {
        userRepo,
        resetRepo,
        sessionRepo,
        auditRepo,
        nowMs: now + 5000,
      });

      expect(apiRes.status).toBe(403);
      const problem = await apiRes.json();
      expect(problem.title).toBe('Account Locked');
    });
  });

  describe('Step 060.4 & Single-Use Consumption, Expiration & Session Revocation', () => {
    it('Quality Gate: token works once within 1 hour, updates password, revokes all sessions, and rejects reuse', async () => {
      const now = Date.now();
      const device1: DeviceCharacteristics = { ip: '198.51.100.1', userAgent: 'Browser 1' };
      const device2: DeviceCharacteristics = { ip: '198.51.100.2', userAgent: 'Browser 2' };

      // User has 2 active sessions
      const s1 = createSession(testUserId, device1);
      const s2 = createSession(testUserId, device2);

      await sessionRepo.create({
        session_id: s1.id,
        user_id: testUserId,
        company_id: testCompanyId,
        session_family_id: s1.sessionFamilyId,
        token_hash: 'hash_s1',
        device_fingerprint: 'fp1',
        ip_address: device1.ip,
        user_agent: device1.userAgent,
        expires_at: s1.expiresAt,
        last_active_at: s1.lastActiveAt,
      });

      await sessionRepo.create({
        session_id: s2.id,
        user_id: testUserId,
        company_id: testCompanyId,
        session_family_id: s2.sessionFamilyId,
        token_hash: 'hash_s2',
        device_fingerprint: 'fp2',
        ip_address: device2.ip,
        user_agent: device2.userAgent,
        expires_at: s2.expiresAt,
        last_active_at: s2.lastActiveAt,
      });

      expect(getAndValidateSession(s1.rawToken!, device1).valid).toBe(true);
      expect(getAndValidateSession(s2.rawToken!, device2).valid).toBe(true);

      // 1. Request password reset
      const forgotResult = await requestPasswordReset(
        { email: testEmail, turnstileToken: '1x0000000000000000000000000000000AA' },
        { userRepo, resetRepo, auditRepo, nowMs: now }
      );
      const rawToken = forgotResult.rawToken!;

      // 2. Consume token 10 minutes later (well within 1-hour window)
      const newPassword = 'New_Fresh_Secure_Password_2026!$';
      const resetResult = await executePasswordReset(
        {
          token: rawToken,
          password: newPassword,
        },
        { userRepo, resetRepo, sessionRepo, auditRepo, nowMs: now + 10 * 60 * 1000 }
      );

      expect(resetResult.success).toBe(true);
      expect(resetResult.message).toContain('Password has been successfully reset');

      // 3. User can authenticate with new password and cannot authenticate with old password
      const updatedUser = await userRepo.findById(testUserId);
      expect(await verifyPassword(newPassword, updatedUser!.password_hash)).toBe(true);
      expect(await verifyPassword(initialPassword, updatedUser!.password_hash)).toBe(false);

      // 4. All previous active sessions were immediately revoked
      expect(getAndValidateSession(s1.rawToken!, device1).valid).toBe(false);
      expect(getAndValidateSession(s2.rawToken!, device2).valid).toBe(false);

      // 5. Token is now marked used and cannot be consumed again (single-use)
      const reuseAttempt = await executePasswordReset(
        {
          token: rawToken,
          password: 'Another_New_Password_9999!@',
        },
        { userRepo, resetRepo, sessionRepo, auditRepo, nowMs: now + 15 * 60 * 1000 }
      );

      expect(reuseAttempt.success).toBe(false);
      expect(reuseAttempt.error).toBe('TOKEN_ALREADY_USED');
      expect(reuseAttempt.message).toContain('already been used');
    });

    it('rejects expired reset tokens (>1 hour)', async () => {
      const now = Date.now();
      const forgotResult = await requestPasswordReset(
        { email: testEmail, turnstileToken: '1x0000000000000000000000000000000AA' },
        { userRepo, resetRepo, auditRepo, nowMs: now }
      );
      const rawToken = forgotResult.rawToken!;

      // Attempt to consume token after 1 hour + 1 second (3601s)
      const expiredTime = now + RESET_TOKEN_EXPIRY_MS + 1000;
      const resetResult = await executePasswordReset(
        {
          token: rawToken,
          password: 'Valid_Complex_Password_2026!#',
        },
        { userRepo, resetRepo, sessionRepo, auditRepo, nowMs: expiredTime }
      );

      expect(resetResult.success).toBe(false);
      expect(resetResult.error).toBe('TOKEN_EXPIRED');
      expect(resetResult.message).toContain('expired');
    });

    it('rejects weak or known-breached passwords upon reset submission', async () => {
      const now = Date.now();
      const forgotResult = await requestPasswordReset(
        { email: testEmail, turnstileToken: '1x0000000000000000000000000000000AA' },
        { userRepo, resetRepo, auditRepo, nowMs: now }
      );
      const rawToken = forgotResult.rawToken!;

      // Attempt with breached password
      const resetResult = await executePasswordReset(
        {
          token: rawToken,
          password: 'password1234!', // In KNOWN_BREACHED_PASSWORDS dictionary
        },
        { userRepo, resetRepo, sessionRepo, auditRepo, nowMs: now + 5000 }
      );

      expect(resetResult.success).toBe(false);
      expect(resetResult.error).toBe('PWNED_PASSWORD');
    });
  });
});
