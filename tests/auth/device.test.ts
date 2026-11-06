// path: tests/auth/device.test.ts

import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import {
  generateDeviceProofKey,
  hashConfirmationCode,
  generateConfirmationCode,
  parseDeviceName,
  dispatchNewDeviceLoginAlert,
  recognizeDevice,
  confirmNewDevice,
  DEVICE_CONFIRMATION_EXPIRY_MS,
} from '@/lib/auth/device';
import { UserDeviceRepository } from '@/lib/db/devices';
import { AuditLogRepository } from '@/lib/db/audit';
import { loadMigrationFiles } from '@/lib/database';
import type { DeviceCharacteristics } from '@/lib/auth/session-types';
import type { NewDeviceAlertEmailParams } from '@/types/device';

describe('Step 056: Per-Device Proof Key & Hardware Fingerprinting Engine', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
  const dbMigrationsDir = path.resolve(process.cwd(), 'db/migrations');

  describe('Step 056.1: Database Migration Verification & user_devices Table', () => {
    it('should define user_devices table with user_id, device_fingerprint, proof_key, first_seen_at, last_ip, and RLS', () => {
      const migrations = loadMigrationFiles(migrationsDir);
      const migration = migrations.find((m) => m.name === 'create_user_devices');

      expect(migration).toBeDefined();
      const sql = migration!.sql;

      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.user_devices');
      expect(sql).toContain('user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE');
      expect(sql).toContain('device_fingerprint varchar(64) NOT NULL');
      expect(sql).toContain('proof_key varchar(128) NOT NULL');
      expect(sql).toContain('first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp()');
      expect(sql).toContain('last_ip varchar(45) NOT NULL');
      expect(sql).toContain('ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE public.user_devices FORCE ROW LEVEL SECURITY');
    });

    it('should verify dual migration in db/migrations matches supabase/migrations', () => {
      const dbMigrations = loadMigrationFiles(dbMigrationsDir);
      const dbMigration = dbMigrations.find((m) => m.name === 'create_user_devices');

      expect(dbMigration).toBeDefined();
      expect(dbMigration!.sql).toContain('CREATE TABLE IF NOT EXISTS public.user_devices');
      expect(dbMigration!.sql).toContain('attach_standard_table_triggers');
    });
  });

  describe('Step 056.2: Proof Key & Hardware Fingerprint Engine', () => {
    it('generates high-entropy device proof key with dpk_ prefix', () => {
      const proofKey1 = generateDeviceProofKey();
      const proofKey2 = generateDeviceProofKey();

      expect(proofKey1).toMatch(/^dpk_[0-9a-f]{64}$/);
      expect(proofKey2).toMatch(/^dpk_[0-9a-f]{64}$/);
      expect(proofKey1).not.toBe(proofKey2);
    });

    it('generates and cryptographically hashes 6-digit confirmation codes', () => {
      const code = generateConfirmationCode();
      expect(code).toMatch(/^[0-9]{6}$/);

      const hash = hashConfirmationCode(code);
      expect(hash).toHaveLength(64); // SHA-256 hex digest
      expect(hashConfirmationCode(code)).toBe(hash);
    });

    it('parses user agent into human-readable device and OS descriptor', () => {
      expect(
        parseDeviceName(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
      ).toBe('Chrome on macOS');

      expect(
        parseDeviceName(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        )
      ).toBe('Safari on iOS');

      expect(
        parseDeviceName(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
        )
      ).toBe('Firefox on Windows');
    });
  });

  describe('Step 056.3 & Quality Gate: New Device Detection & Alert Dispatch', () => {
    it('Quality Gate: detects login from new user agent and IP, flags as new device, and dispatches security alert email', async () => {
      const deviceRepo = new UserDeviceRepository();
      const auditRepo = new AuditLogRepository();
      const dispatchedEmails: NewDeviceAlertEmailParams[] = [];

      const userId = '018f6c4c-3500-7fa1-b1e2-100000000001';
      const userEmail = 'merchant.owner@kdsolution.it';

      // 1. Initial login from unrecognized device (New User Agent & New IP)
      const newDevice: DeviceCharacteristics = {
        ip: '203.0.113.88',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US',
      };

      const result = await recognizeDevice(
        {
          userId,
          userEmail,
          device: newDevice,
          companyId: '018f6c4c-3500-7fa1-b1e2-000000000001',
        },
        {
          deviceRepo,
          auditRepo,
          emailDispatcher: (params) => {
            dispatchedEmails.push(params);
            return true;
          },
        }
      );

      // Verify device flagged as new
      expect(result.isNewDevice).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.confirmationCode).toBeDefined();
      expect(result.confirmationCode).toMatch(/^[0-9]{6}$/);
      expect(result.alertDispatched).toBe(true);
      expect(result.device.is_trusted).toBe(false);

      // Verify security alert email was dispatched
      expect(dispatchedEmails.length).toBe(1);
      const alert = dispatchedEmails[0]!;
      expect(alert.email).toBe(userEmail);
      expect(alert.userId).toBe(userId);
      expect(alert.ipAddress).toBe(newDevice.ip);
      expect(alert.confirmationCode).toBe(result.confirmationCode);
      expect(alert.deviceName).toBe('Chrome on macOS');

      // Verify audit log event was written
      const auditEntries = await auditRepo.findMany();
      const alertLog = auditEntries.find((e) => e.action === 'NEW_DEVICE_LOGIN_DETECTED');
      expect(alertLog).toBeDefined();
      expect(alertLog?.actor_id).toBe(userId);
    });

    it('confirms new device with valid email code, marks trusted, and records audit event', async () => {
      const deviceRepo = new UserDeviceRepository();
      const auditRepo = new AuditLogRepository();

      const userId = '018f6c4c-3500-7fa1-b1e2-100000000002';
      const userEmail = 'merchant.partner@kdsolution.it';

      const device: DeviceCharacteristics = {
        ip: '198.51.100.45',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36',
      };

      const recognition = await recognizeDevice(
        { userId, userEmail, device },
        { deviceRepo, auditRepo }
      );

      const code = recognition.confirmationCode!;
      const fingerprint = recognition.device.device_fingerprint;

      // Confirm with correct code
      const confirmResult = await confirmNewDevice(
        { userId, fingerprint, code },
        { deviceRepo, auditRepo }
      );

      expect(confirmResult.success).toBe(true);
      expect(confirmResult.device?.is_trusted).toBe(true);
      expect(confirmResult.device?.confirmed_at).not.toBeNull();

      // Verify confirmed audit log event
      const auditEntries = await auditRepo.findMany();
      const confirmLog = auditEntries.find((e) => e.action === 'NEW_DEVICE_CONFIRMED');
      expect(confirmLog).toBeDefined();

      // Subsequent login from same device is recognized as trusted without triggering fresh alert
      let freshAlertFired = false;
      const secondRecognition = await recognizeDevice(
        { userId, userEmail, device },
        {
          deviceRepo,
          auditRepo,
          emailDispatcher: () => {
            freshAlertFired = true;
            return true;
          },
        }
      );

      expect(secondRecognition.isNewDevice).toBe(false);
      expect(secondRecognition.requiresConfirmation).toBe(false);
      expect(freshAlertFired).toBe(false);
      expect(secondRecognition.device.is_trusted).toBe(true);
    });

    it('rejects confirmation when code is invalid or expired', async () => {
      const deviceRepo = new UserDeviceRepository();
      const auditRepo = new AuditLogRepository();

      const userId = '018f6c4c-3500-7fa1-b1e2-100000000003';
      const userEmail = 'merchant.security@kdsolution.it';

      const device: DeviceCharacteristics = {
        ip: '192.168.10.12',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1',
      };

      const recognition = await recognizeDevice(
        { userId, userEmail, device },
        { deviceRepo, auditRepo }
      );

      const fingerprint = recognition.device.device_fingerprint;

      // 1. Wrong code
      const wrongResult = await confirmNewDevice(
        { userId, fingerprint, code: '000000' },
        { deviceRepo, auditRepo }
      );

      expect(wrongResult.success).toBe(false);
      expect(wrongResult.error).toBe('INVALID_CODE');

      // 2. Expired code (>15 minutes)
      const expiredResult = await confirmNewDevice(
        { userId, fingerprint, code: recognition.confirmationCode! },
        {
          deviceRepo,
          auditRepo,
          nowMs: Date.now() + DEVICE_CONFIRMATION_EXPIRY_MS + 1000,
        }
      );

      expect(expiredResult.success).toBe(false);
      expect(expiredResult.error).toBe('CODE_EXPIRED');

      // 3. Unknown device fingerprint
      const unknownResult = await confirmNewDevice(
        { userId, fingerprint: 'non_existent_fingerprint_hash', code: '123456' },
        { deviceRepo, auditRepo }
      );

      expect(unknownResult.success).toBe(false);
      expect(unknownResult.error).toBe('DEVICE_NOT_FOUND');
    });
  });
});
