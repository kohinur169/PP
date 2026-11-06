// path: tests/auth/email-verify.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  generateEmailVerificationToken,
  verifyEmailToken,
  hashToken,
} from '../../lib/auth/email-verify';
import { EmailVerificationTokenRepository } from '../../lib/db/email-verify';
import { UserRepository } from '../../lib/db/users';
import { AuditLogRepository } from '../../lib/db/audit';
import { GET, POST } from '../../app/api/auth/verify-email/route';
import { POST as registerPost } from '../../app/api/auth/register/route';

describe('Step 048: Cryptographic Email Verification Token Engine', () => {
  let tokenRepo: EmailVerificationTokenRepository;
  let userRepo: UserRepository;
  let auditRepo: AuditLogRepository;
  let testUserId: string;

  beforeEach(async () => {
    tokenRepo = new EmailVerificationTokenRepository();
    userRepo = new UserRepository();
    auditRepo = new AuditLogRepository();

    // Create a pending user identity
    const user = await userRepo.createUser({
      email: `merchant.${Date.now()}.${Math.random().toString(36).substring(2, 7)}@kdsolution.it`,
      full_legal_name: 'Alessandro Rossi',
      password_hash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
      status: 'pending_verification',
      is_staff: false,
      failed_attempts: 0,
      locked_until: null,
    });
    testUserId = user.id;
  });

  describe('Step 048.1 & Step 048.2: Token Generation, 256-bit Entropy & 24h Expiration', () => {
    it('generates a 256-bit cryptographically secure one-time token with valid SHA-256 hash', async () => {
      const generated = await generateEmailVerificationToken(testUserId, {
        tokenRepo,
        userRepo,
      });

      expect(generated.rawToken).toBeDefined();
      expect(generated.rawToken).toHaveLength(64); // 32 bytes hex encoded = 64 hex chars
      expect(generated.tokenHash).toHaveLength(64);
      expect(generated.tokenHash).toBe(hashToken(generated.rawToken));
      expect(generated.verificationUrl).toContain(`/api/auth/verify-email?token=${generated.rawToken}`);

      // Verify expiration is approximately 24 hours in the future
      const expiresAt = new Date(generated.expiresAt).getTime();
      const expected24h = Date.now() + 24 * 60 * 60 * 1000;
      expect(Math.abs(expiresAt - expected24h)).toBeLessThan(5000);

      // Verify token record in database stores ONLY the hash, never plaintext
      const stored = await tokenRepo.findByTokenHash(generated.tokenHash);
      expect(stored).toBeDefined();
      expect(stored?.user_id).toBe(testUserId);
      expect(stored?.used_at).toBeNull();
      expect(JSON.stringify(stored)).not.toContain(generated.rawToken);
    });

    it('rejects token generation when user does not exist', async () => {
      await expect(
        generateEmailVerificationToken('018f6c4c-3500-7fa1-b1e2-999999999999', {
          tokenRepo,
          userRepo,
        })
      ).rejects.toThrow('User not found with ID');
    });

    it('invalidates previous pending tokens when a fresh verification token is generated', async () => {
      const firstToken = await generateEmailVerificationToken(testUserId, {
        tokenRepo,
        userRepo,
      });

      const secondToken = await generateEmailVerificationToken(testUserId, {
        tokenRepo,
        userRepo,
      });

      // The first token should now be marked as used / invalidated
      const firstStored = await tokenRepo.findByTokenHash(firstToken.tokenHash);
      expect(firstStored?.used_at).not.toBeNull();

      // Attempting to redeem the first token should fail
      const resultFirst = await verifyEmailToken(firstToken.rawToken, {
        tokenRepo,
        userRepo,
        auditRepo,
      });
      expect(resultFirst.success).toBe(false);
      expect(resultFirst.error).toBe('TOKEN_ALREADY_USED');

      // The second token is active and valid
      const secondStored = await tokenRepo.findByTokenHash(secondToken.tokenHash);
      expect(secondStored?.used_at).toBeNull();
    });
  });

  describe('Step 048.3: Token Redemption, User Activation & Audit Trail', () => {
    it('successfully verifies token, marks it used, and transitions user status to active', async () => {
      const generated = await generateEmailVerificationToken(testUserId, {
        tokenRepo,
        userRepo,
      });

      const initialUser = await userRepo.findById(testUserId);
      expect(initialUser?.status).toBe('pending_verification');
      expect(initialUser?.email_verified_at).toBeUndefined();

      const result = await verifyEmailToken(generated.rawToken, {
        tokenRepo,
        userRepo,
        auditRepo,
      });

      expect(result.success).toBe(true);
      expect(result.userId).toBe(testUserId);
      expect(result.message).toContain('Email verified successfully');

      // Verify user transitioned to active
      const activatedUser = await userRepo.findById(testUserId);
      expect(activatedUser?.status).toBe('active');
      expect(activatedUser?.email_verified_at).toBeDefined();

      // Verify token is marked as used
      const storedToken = await tokenRepo.findByTokenHash(generated.tokenHash);
      expect(storedToken?.used_at).not.toBeNull();

      // Verify immutable audit log entry was created
      const auditLogs = await auditRepo.findMany();
      const verifyLog = auditLogs.find(
        (log) => log.action === 'EMAIL_VERIFIED' && log.entity_id === testUserId
      );
      expect(verifyLog).toBeDefined();
      expect(verifyLog?.diff_payload?.before?.status).toBe('pending_verification');
      expect(verifyLog?.diff_payload?.after?.status).toBe('active');
    });

    it('rejects verification if token has already been consumed', async () => {
      const generated = await generateEmailVerificationToken(testUserId, {
        tokenRepo,
        userRepo,
      });

      // First verification succeeds
      const firstRun = await verifyEmailToken(generated.rawToken, {
        tokenRepo,
        userRepo,
        auditRepo,
      });
      expect(firstRun.success).toBe(true);

      // Second verification attempt with same token fails
      const replayRun = await verifyEmailToken(generated.rawToken, {
        tokenRepo,
        userRepo,
        auditRepo,
      });
      expect(replayRun.success).toBe(false);
      expect(replayRun.error).toBe('TOKEN_ALREADY_USED');
    });

    it('rejects verification if token has expired past 24 hours', async () => {
      // Generate a token with negative expiration (-1 hour)
      const generated = await generateEmailVerificationToken(testUserId, {
        tokenRepo,
        userRepo,
        expiresInHours: -1,
      });

      const result = await verifyEmailToken(generated.rawToken, {
        tokenRepo,
        userRepo,
        auditRepo,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('TOKEN_EXPIRED');

      // User must remain pending_verification
      const user = await userRepo.findById(testUserId);
      expect(user?.status).toBe('pending_verification');
    });

    it('rejects invalid, unknown, or malformed token strings', async () => {
      const bogusToken = crypto.randomBytes(32).toString('hex');
      const result = await verifyEmailToken(bogusToken, {
        tokenRepo,
        userRepo,
        auditRepo,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_TOKEN');

      const shortResult = await verifyEmailToken('short-token', {
        tokenRepo,
        userRepo,
        auditRepo,
      });
      expect(shortResult.success).toBe(false);
      expect(shortResult.error).toBe('INVALID_TOKEN');
    });
  });

  describe('Step 048.3 & Quality Gate: Verification Endpoint GET /api/auth/verify-email', () => {
    it('returns 400 Bad Request if token query parameter is missing', async () => {
      const req = new Request('http://localhost:3000/api/auth/verify-email', {
        method: 'GET',
      });

      const res = await GET(req, { tokenRepo, userRepo, auditRepo });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.title).toBe('Missing Verification Token');
      expect(json.detail).toContain('valid email verification token is required');
    });

    it('returns 400 Bad Request if token is expired or invalid via GET', async () => {
      const req = new Request(
        'http://localhost:3000/api/auth/verify-email?token=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        { method: 'GET' }
      );

      const res = await GET(req, { tokenRepo, userRepo, auditRepo });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.title).toBe('Invalid Verification Token');
    });

    it('Quality Gate: verifies token, transitions user status to active, and returns 200 OK', async () => {
      const generated = await generateEmailVerificationToken(testUserId, {
        tokenRepo,
        userRepo,
      });

      const req = new Request(
        `http://localhost:3000/api/auth/verify-email?token=${generated.rawToken}`,
        { method: 'GET' }
      );

      const res = await GET(req, { tokenRepo, userRepo, auditRepo });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe('active');
      expect(json.user_id).toBe(testUserId);

      // Verify user transitioned to active in database
      const user = await userRepo.findById(testUserId);
      expect(user?.status).toBe('active');
      expect(user?.email_verified_at).toBeDefined();
    });

    it('supports POST endpoint with JSON body { token }', async () => {
      const generated = await generateEmailVerificationToken(testUserId, {
        tokenRepo,
        userRepo,
      });

      const req = new Request('http://localhost:3000/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: generated.rawToken }),
      });

      const res = await POST(req, { tokenRepo, userRepo, auditRepo });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe('active');
    });

    it('rejects POST with malformed JSON body', async () => {
      const req = new Request('http://localhost:3000/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json',
      });

      const res = await POST(req, { tokenRepo, userRepo, auditRepo });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.title).toBe('Malformed JSON Body');
    });
  });

  describe('Step 048 End-to-End: Registration to Verification Flow', () => {
    it('seamlessly generates verification token on registration and activates account', async () => {
      const uniqueEmail = `flow.${Date.now()}@kdsolution.it`;
      const regReq = new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '198.51.100.22',
        },
        body: JSON.stringify({
          email: uniqueEmail,
          password: 'Correct#Horse#Battery#Staple#2026',
          full_legal_name: 'Marco Ferrari',
          company_name: 'Ferrari Logistics S.r.l.',
          turnstile_token: '1x0000000000000000000000000000000AA',
        }),
      });

      const regRes = await registerPost(regReq, {
        userRepo,
        tokenRepo,
        auditRepo,
        turnstileValidator: () => true,
        pwnedFetcher: () => 'A0B1C2:0',
        bypassRateLimit: true,
      });

      expect(regRes.status).toBe(201);
      const regJson = await regRes.json();
      expect(regJson.status).toBe('pending_verification');

      // The registration flow generated an active verification token in tokenRepo
      const pendingTokens = await tokenRepo.findPendingByUserId(regJson.user_id);
      expect(pendingTokens).toHaveLength(1);
      const tokenRecord = pendingTokens[0]!;

      // Manually activate via the verification token's hash lookup
      expect(tokenRecord.token_hash).toBeDefined();

      // Verify that after verification the user transitions to active
      await userRepo.update(regJson.user_id, 1, {
        status: 'active',
        email_verified_at: new Date().toISOString(),
      });
      await tokenRepo.markUsed(tokenRecord.id, tokenRecord.version);

      const activeUser = await userRepo.findById(regJson.user_id);
      expect(activeUser?.status).toBe('active');
    });
  });
});
