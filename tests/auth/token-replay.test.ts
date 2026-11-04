// path: tests/auth/token-replay.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import {
  createSession,
  getAndValidateSession,
  clearSessionRegistry,
  rotateSession,
  validateAndDetectReplay,
} from '@/lib/auth';
import type { DeviceCharacteristics } from '@/lib/auth/session-types';
import { SessionRepository } from '@/lib/db/sessions';
import { AuditLogRepository } from '@/lib/db/audit';
import { loadMigrationFiles } from '@/lib/database';

describe('Step 057: Rotating Session Tokens & Family Invalidation on Replay Detection', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
  const dbMigrationsDir = path.resolve(process.cwd(), 'db/migrations');

  beforeEach(() => {
    clearSessionRegistry();
  });

  describe('Step 057.1: Database Migration Verification & Session Lineage Columns', () => {
    it('should define session_family_id, is_revoked, is_consumed, consumed_at, and parent_session_id', () => {
      const migrations = loadMigrationFiles(migrationsDir);
      const migration = migrations.find(
        (m) => m.name === 'add_session_family_and_replay_detection'
      );

      expect(migration).toBeDefined();
      const sql = migration!.sql;

      expect(sql).toContain('ALTER TABLE public.sessions');
      expect(sql).toContain('session_family_id uuid NOT NULL DEFAULT generate_uuid_v7()');
      expect(sql).toContain('is_revoked boolean NOT NULL DEFAULT false');
      expect(sql).toContain('is_consumed boolean NOT NULL DEFAULT false');
      expect(sql).toContain('consumed_at timestamptz NULL');
      expect(sql).toContain('parent_session_id uuid NULL REFERENCES public.sessions(id)');
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_sessions_family_id');
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_sessions_family_revoked');
    });

    it('should verify dual migration in db/migrations matches supabase/migrations', () => {
      const dbMigrations = loadMigrationFiles(dbMigrationsDir);
      const dbMigration = dbMigrations.find(
        (m) => m.name === 'add_session_family_and_replay_detection'
      );

      expect(dbMigration).toBeDefined();
      expect(dbMigration!.sql).toContain('session_family_id');
      expect(dbMigration!.sql).toContain('is_revoked');
      expect(dbMigration!.sql).toContain('is_consumed');
    });
  });

  describe('Step 057.2: Session Token Rotation Mechanism', () => {
    it('rotates active session into fresh child token within identical session_family_id lineage', async () => {
      const sessionRepo = new SessionRepository();
      const auditRepo = new AuditLogRepository();

      const userId = '018f6c4c-3500-7fa1-b1e2-100000000001';
      const device: DeviceCharacteristics = {
        ip: '198.51.100.50',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      };

      // 1. Initial Login: Session 1 is created
      const session1 = createSession(userId, device);
      const familyId = session1.sessionFamilyId;
      expect(familyId).toBeDefined();
      expect(session1.isConsumed).toBe(false);

      // 2. Rotate Session 1 -> Session 2
      const rotationResult = await rotateSession(session1.id, {
        sessionRepo,
        auditRepo,
        device,
      });

      expect(rotationResult.success).toBe(true);
      expect(rotationResult.session).toBeDefined();

      const session2 = rotationResult.session!;
      expect(session2.id).not.toBe(session1.id);
      expect(session2.sessionFamilyId).toBe(familyId);
      expect(session2.parentSessionId).toBe(session1.id);
      expect(session2.rawToken).not.toBe(session1.rawToken);
      expect(session2.cookieValue).toBeDefined();
      expect(session2.isConsumed).toBe(false);

      // Verify Session 1 is now marked consumed
      expect(session1.isConsumed).toBe(true);
      expect(session1.consumedAt).toBeDefined();

      // Verify Session 2 is active and valid
      const validation2 = getAndValidateSession(session2.rawToken!, device);
      expect(validation2.valid).toBe(true);
      expect(validation2.session?.id).toBe(session2.id);

      // 3. Verify audit log entry
      const auditLogs = await auditRepo.findMany();
      const rotateLog = auditLogs.find((l) => l.action === 'SESSION_ROTATED');
      expect(rotateLog).toBeDefined();
      expect(rotateLog?.actor_id).toBe(userId);
    });
  });

  describe('Step 057.3, Step 057.4 & Quality Gate: Replay Attack Invalidation', () => {
    it('Quality Gate: detects replayed consumed session cookie, immediately revokes all family sessions, and logs out user', async () => {
      const sessionRepo = new SessionRepository();
      const auditRepo = new AuditLogRepository();

      const userId = '018f6c4c-3500-7fa1-b1e2-200000000002';
      const device: DeviceCharacteristics = {
        ip: '203.0.113.10',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0',
      };

      // 1. Legitimate user logs in: Session 1 created
      const session1 = createSession(userId, device);
      const stolenToken1 = session1.rawToken!;
      const familyId = session1.sessionFamilyId!;

      // 2. Legitimate user rotates token: Session 1 -> Session 2
      const rot1 = await rotateSession(session1.id, { sessionRepo, auditRepo, device });
      expect(rot1.success).toBe(true);
      const session2 = rot1.session!;

      // 3. Legitimate user rotates token again: Session 2 -> Session 3
      const rot2 = await rotateSession(session2.id, { sessionRepo, auditRepo, device });
      expect(rot2.success).toBe(true);
      const session3 = rot2.session!;

      // Session 3 is currently active and healthy
      expect(getAndValidateSession(session3.rawToken!, device).valid).toBe(true);

      // 4. ATTACK SIMULATION: Adversary attempts to replay the already-consumed Session 1 token
      const replayAttempt = await validateAndDetectReplay(stolenToken1, device, {
        sessionRepo,
        auditRepo,
      });

      // Verify replay attack was detected
      expect(replayAttempt.valid).toBe(false);
      expect(replayAttempt.replayDetected).toBe(true);
      expect(replayAttempt.errorCode).toBe('REVOKED');
      expect(replayAttempt.message).toContain('Replayed or stolen session token detected');

      // 5. Verification: Entire session family must now be revoked!
      // Session 3 (the legitimate user's active session) must now be invalidated immediately
      const validationAfterAttack = getAndValidateSession(session3.rawToken!, device);
      expect(validationAfterAttack.valid).toBe(false);
      expect(validationAfterAttack.errorCode).toBe('REVOKED');

      // Verify Session 2 is also revoked
      expect(session2.isRevoked).toBe(true);
      expect(session3.isRevoked).toBe(true);

      // 6. Verify audit log recorded tamper-evident replay incident
      const auditEntries = await auditRepo.findMany();
      const replayLog = auditEntries.find((e) => e.action === 'SESSION_REPLAY_DETECTED');
      expect(replayLog).toBeDefined();
      expect(replayLog?.entity_id).toBe(familyId);
      expect(replayLog?.actor_id).toBe(userId);
    });

    it('rejects rotation attempt when replaying an already-consumed token and terminates lineage', async () => {
      const sessionRepo = new SessionRepository();
      const auditRepo = new AuditLogRepository();

      const userId = '018f6c4c-3500-7fa1-b1e2-300000000003';
      const device: DeviceCharacteristics = {
        ip: '198.51.100.99',
        userAgent: 'Mobile Safari / iOS',
      };

      const s1 = createSession(userId, device);
      const rot = await rotateSession(s1.id, { sessionRepo, auditRepo, device });
      const s2 = rot.session!;

      // Attacker attempts rotateSession with consumed s1 token
      const attackerRotation = await rotateSession(s1.rawToken!, {
        sessionRepo,
        auditRepo,
        device,
      });

      expect(attackerRotation.success).toBe(false);
      expect(attackerRotation.replayDetected).toBe(true);
      expect(attackerRotation.familyRevoked).toBe(true);
      expect(attackerRotation.error).toBe('REPLAY_DETECTED');

      // Legitimate session s2 is revoked as a safety measure
      expect(s2.isRevoked).toBe(true);
    });
  });
});
