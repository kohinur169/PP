// path: tests/db/users.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { UserRepository } from '../../lib/db/users';
import { isValidUuidV7 } from '../../lib/db/uuidv7';
import { CreateUserInput } from '../../types/user';
import { OptimisticLockError } from '../../types/entity';

describe('Step 022: Users & Staff Identities Schema Migration', () => {
  let repository: UserRepository;

  beforeEach(() => {
    repository = new UserRepository();
  });

  const createValidUserInput = (email: string = 'merchant.owner@kdsolution.it'): CreateUserInput => ({
    email,
    full_legal_name: 'John Merchant',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$synthetic_hash_value',
    phone: '+14155552671',
    phone_hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    failed_attempts: 0,
    locked_until: null,
    is_staff: false,
    status: 'pending_verification',
  });

  describe('User Registration & Baseline Columns', () => {
    it('creates user identity with UUIDv7, version = 1, and lowercase normalized email', async () => {
      const input = createValidUserInput('CeO@kdsolution.it');
      const user = await repository.createUser(input);

      expect(isValidUuidV7(user.id)).toBe(true);
      expect(user.email).toBe('ceo@kdsolution.it');
      expect(user.full_legal_name).toBe('John Merchant');
      expect(user.failed_attempts).toBe(0);
      expect(user.locked_until).toBeNull();
      expect(user.is_staff).toBe(false);
      expect(user.status).toBe('pending_verification');
      expect(user.version).toBe(1);
      expect(user.password_changed_at).toBeDefined();
    });

    it('enforces lowercase uniqueness on email address', async () => {
      await repository.createUser(createValidUserInput('finance@kdsolution.it'));

      // Attempt second user with differing case
      const duplicateInput = createValidUserInput('FINANCE@KDSOLUTION.IT');
      await expect(repository.createUser(duplicateInput)).rejects.toThrow(
        /Email address conflict/
      );
    });

    it('finds user by cryptographic phone hash', async () => {
      const user = await repository.createUser(createValidUserInput('user1@domain.com'));
      const found = await repository.findByPhoneHash(
        'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
      );

      expect(found).not.toBeNull();
      expect(found!.id).toBe(user.id);
    });
  });

  describe('Account Lockout & Security Triggers', () => {
    it('increments failed attempts and triggers automated lockout after 5 consecutive failures', async () => {
      let user = await repository.createUser(createValidUserInput('lockout.target@kdsolution.it'));
      expect(user.failed_attempts).toBe(0);
      expect(user.status).toBe('pending_verification');

      // Attempts 1 to 4
      for (let i = 1; i <= 4; i++) {
        user = await repository.recordFailedLogin(user.id, user.version, 5, 30);
        expect(user.failed_attempts).toBe(i);
        expect(user.locked_until).toBeNull();
        expect(user.status).toBe('pending_verification');
      }

      // 5th attempt triggers lockout
      user = await repository.recordFailedLogin(user.id, user.version, 5, 30);
      expect(user.failed_attempts).toBe(5);
      expect(user.status).toBe('locked');
      expect(user.locked_until).not.toBeNull();

      const lockDate = new Date(user.locked_until!);
      expect(lockDate.getTime()).toBeGreaterThan(Date.now());
    });

    it('resets failed login attempts and clears lockout timestamp upon successful authentication', async () => {
      let user = await repository.createUser(createValidUserInput('reset.target@kdsolution.it'));
      user = await repository.recordFailedLogin(user.id, user.version);
      user = await repository.recordFailedLogin(user.id, user.version);
      expect(user.failed_attempts).toBe(2);

      const resetUser = await repository.resetFailedLogin(user.id, user.version);
      expect(resetUser.failed_attempts).toBe(0);
      expect(resetUser.locked_until).toBeNull();
      expect(resetUser.status).toBe('active');
    });

    it('allows explicit administrative unlocking via unlockAccount', async () => {
      let user = await repository.createUser(createValidUserInput('admin.unlock@kdsolution.it'));

      // Force lock
      for (let i = 0; i < 5; i++) {
        user = await repository.recordFailedLogin(user.id, user.version, 5);
      }
      expect(user.status).toBe('locked');

      const unlocked = await repository.unlockAccount(user.id, user.version);
      expect(unlocked.status).toBe('active');
      expect(unlocked.failed_attempts).toBe(0);
      expect(unlocked.locked_until).toBeNull();
    });
  });

  describe('Password Rotation & Status Updates', () => {
    it('rotates password hash, updates timestamp, and increments version with optimistic locking', async () => {
      const user = await repository.createUser(createValidUserInput('pwd.rotate@kdsolution.it'));
      expect(user.version).toBe(1);

      const initialTimestamp = user.password_changed_at;

      // Small delay to ensure timestamp progression
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repository.updatePassword(
        user.id,
        1,
        '$argon2id$v=19$m=65536,t=3,p=4$new_rotated_password_hash'
      );

      expect(updated.password_hash).toBe(
        '$argon2id$v=19$m=65536,t=3,p=4$new_rotated_password_hash'
      );
      expect(updated.version).toBe(2);
      expect(new Date(updated.password_changed_at).getTime()).toBeGreaterThanOrEqual(
        new Date(initialTimestamp).getTime()
      );

      // Fails on stale version
      await expect(
        repository.updatePassword(user.id, 1, 'another_hash')
      ).rejects.toThrow(OptimisticLockError);
    });

    it('updates user lifecycle status', async () => {
      const user = await repository.createUser(createValidUserInput('status.test@kdsolution.it'));

      const activeUser = await repository.updateStatus(user.id, 1, 'active');
      expect(activeUser.status).toBe('active');
      expect(activeUser.version).toBe(2);

      const suspendedUser = await repository.updateStatus(user.id, 2, 'suspended');
      expect(suspendedUser.status).toBe('suspended');
      expect(suspendedUser.version).toBe(3);
    });
  });

  describe('Zod Validation Boundaries', () => {
    it('rejects malformed email addresses', async () => {
      const invalidEmailInput = {
        ...createValidUserInput(),
        email: 'not-an-email',
      };

      await expect(repository.createUser(invalidEmailInput)).rejects.toThrow();
    });

    it('rejects short legal names', async () => {
      const shortNameInput = {
        ...createValidUserInput(),
        full_legal_name: 'A',
      };

      await expect(repository.createUser(shortNameInput)).rejects.toThrow();
    });
  });

  describe('PostgreSQL Migration DDL & Constraints Integrity', () => {
    it('verifies db/migrations/007_create_users_table.sql contains table, constraints, and indexes', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'db/migrations/007_create_users_table.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.users');
      expect(sql).toContain('chk_users_status');
      expect(sql).toContain('uq_users_email_lower');
      expect(sql).toContain('idx_users_phone_hash');
      expect(sql).toContain('idx_users_status');
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('FORCE ROW LEVEL SECURITY');
      expect(sql).toContain('pol_users_self_isolation');
    });

    it('verifies supabase/migrations/20261103000011_create_users_table.sql matches schema definitions', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261103000011_create_users_table.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('attach_standard_table_triggers');
      expect(sql).toContain('is_staff');
      expect(sql).toContain('failed_attempts');
    });
  });
});
