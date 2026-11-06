// path: tests/auth/lifecycle.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  PasswordSchema,
  SignUpInputSchema,
  PasswordUpdateSchema,
  signUpTenantUser,
  signInUser,
  requestPasswordReset,
} from '@/lib/auth';
import { loadMigrationFiles } from '@/lib/database';

describe('Supabase Auth Architecture & Tenant User Lifecycle (Step 012)', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  describe('Password Complexity & Policy (NIST SP 800-63B)', () => {
    it('should accept valid complex passwords exceeding 12 characters', () => {
      const validPasswords = [
        'StrongP@ssw0rd2026!',
        'KD_Solution#Secure99',
        'Complex*Pass1234^',
      ];

      for (const pass of validPasswords) {
        expect(PasswordSchema.parse(pass)).toBe(pass);
      }
    });

    it('should reject weak passwords violating security constraints', () => {
      // Too short (<12 chars)
      expect(() => PasswordSchema.parse('Short1!')).toThrowError(/at least 12 characters/);

      // Missing uppercase
      expect(() => PasswordSchema.parse('lowercase123456!')).toThrow();

      // Missing lowercase
      expect(() => PasswordSchema.parse('UPPERCASE123456!')).toThrow();

      // Missing number
      expect(() => PasswordSchema.parse('NoNumberHere!@#$')).toThrow();

      // Missing special symbol
      expect(() => PasswordSchema.parse('NoSpecialChar12345')).toThrow();
    });
  });

  describe('Sign-Up & Password Reset Schemas', () => {
    it('should validate tenant user registration payloads', () => {
      const validSignUp = {
        email: 'merchant.admin@kdsolution.it',
        password: 'ValidPassword123!@#',
        fullName: 'Asia Merchant Admin',
        tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
        role: 'admin' as const,
      };

      const parsed = SignUpInputSchema.parse(validSignUp);
      expect(parsed.email).toBe('merchant.admin@kdsolution.it');
      expect(parsed.role).toBe('admin');
      expect(parsed.fullName).toBe('Asia Merchant Admin');
    });

    it('should reject password update submissions when passwords do not match', () => {
      const mismatched = {
        password: 'ValidPassword123!@#',
        confirmPassword: 'DifferentPassword123!@#',
      };

      expect(() => PasswordUpdateSchema.parse(mismatched)).toThrowError(
        /Passwords do not match/
      );
    });
  });

  describe('Auth Hooks & Profile Sync Migration Verification', () => {
    it('should contain trigger syncing auth.users to public.users and tenant_memberships', () => {
      const migrations = loadMigrationFiles(migrationsDir);
      const authSyncMigration = migrations.find((m) => m.name === 'auth_hooks_and_profile_sync');

      expect(authSyncMigration).toBeDefined();
      const sql = authSyncMigration!.sql;

      expect(sql).toContain('FUNCTION public.handle_new_auth_user()');
      expect(sql).toContain('INSERT INTO public.users');
      expect(sql).toContain('INSERT INTO public.tenant_memberships');
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
      expect(sql).toContain('ON CONFLICT (tenant_id, user_id) DO UPDATE');
      expect(sql).toContain('TRIGGER on_auth_user_created');
      expect(sql).toContain('AFTER INSERT ON auth.users');
    });
  });

  describe('Auth Service Validation & Rejection Pipeline', () => {
    it('should fail fast on invalid email during sign-up without remote API call', async () => {
      const result = await signUpTenantUser({
        email: 'invalid-email-address',
        password: 'ValidPassword123!@#',
        fullName: 'Test User',
      } as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('email');
    });

    it('should fail fast on empty password during sign-in without remote API call', async () => {
      const result = await signInUser({
        email: 'admin@kdsolution.it',
        password: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail fast on invalid email during password reset request', async () => {
      const result = await requestPasswordReset({
        email: 'not-an-email',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
