// path: tests/db/seeds.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  seedCountries,
  getCountryCatalog,
  isCountrySanctioned,
  isCountrySupported,
  SANCTIONED_COUNTRY_CODES,
} from '../../db/seeds/countries';
import {
  seedSuperAdmin,
  hashPassword,
  verifyPassword,
} from '../../db/seeds/super-admin';
import { runSeeds } from '../../db/seeds/index';
import { CompanyRepository } from '../../lib/db/companies';
import { UserRepository } from '../../lib/db/users';
import { CompanyMemberRepository } from '../../lib/db/memberships';
import { AuditLogRepository } from '../../lib/db/audit';
import { isValidUuidV7 } from '../../lib/db/uuidv7';

describe('Step 030: Database Seed Engine & Super Admin Initial Provisioning Script', () => {
  let companyRepo: CompanyRepository;
  let userRepo: UserRepository;
  let memberRepo: CompanyMemberRepository;
  let auditRepo: AuditLogRepository;

  beforeEach(() => {
    companyRepo = new CompanyRepository();
    userRepo = new UserRepository();
    memberRepo = new CompanyMemberRepository();
    auditRepo = new AuditLogRepository();
  });

  describe('Step 030.2: ISO 3166-1 Country Controls & Sanctions Policy', () => {
    it('loads complete ISO 3166-1 country catalog with valid fields', async () => {
      const result = await seedCountries();

      expect(result.totalCountries).toBeGreaterThanOrEqual(30);
      expect(result.enabledCount).toBeGreaterThan(0);
      expect(result.sanctionedCount).toBe(SANCTIONED_COUNTRY_CODES.size);

      for (const country of result.countries) {
        expect(country.code).toMatch(/^[A-Z]{2}$/);
        expect(country.name.length).toBeGreaterThan(0);
        expect(['enabled', 'disabled', 'sanctioned']).toContain(country.status);
        expect([1, 2, 3]).toContain(country.risk_tier_default);
        expect(country.default_currency.length).toBe(3);
      }
    });

    it('enforces permanent sanctioning and disables onboarding for OFAC/UN/EU sanctioned countries', () => {
      const sanctionedList = ['CU', 'IR', 'KP', 'SY', 'RU'];

      for (const code of sanctionedList) {
        expect(isCountrySanctioned(code)).toBe(true);
        expect(isCountrySupported(code)).toBe(false);

        const country = getCountryCatalog().find((c) => c.code === code);
        expect(country).toBeDefined();
        expect(country?.status).toBe('sanctioned');
        expect(country?.is_sanctioned).toBe(true);
        expect(country?.supported_for_merchants).toBe(false);
      }
    });

    it('enables priority Asian market corridors with merchant onboarding support', () => {
      const asianCorridors = ['SG', 'MY', 'PH', 'ID', 'TH', 'VN', 'HK', 'JP'];

      for (const code of asianCorridors) {
        expect(isCountrySanctioned(code)).toBe(false);
        expect(isCountrySupported(code)).toBe(true);

        const country = getCountryCatalog().find((c) => c.code === code);
        expect(country).toBeDefined();
        expect(country?.status).toBe('enabled');
        expect(country?.supported_for_merchants).toBe(true);
      }
    });

    it('enables major worldwide corridors (US, GB, AU, CA, DE, FR, NL, AE)', () => {
      const globalCorridors = ['US', 'GB', 'AU', 'CA', 'DE', 'FR', 'NL', 'AE'];

      for (const code of globalCorridors) {
        expect(isCountrySanctioned(code)).toBe(false);
        expect(isCountrySupported(code)).toBe(true);

        const country = getCountryCatalog().find((c) => c.code === code);
        expect(country?.status).toBe('enabled');
      }
    });
  });

  describe('Password Hashing & Cryptographic Verification', () => {
    it('hashes passwords using PBKDF2/SHA-512 with 100,000 iterations and salt', () => {
      const password = 'SuperAdmin#SecretPassword2026!';
      const hash = hashPassword(password);

      expect(hash).toMatch(/^pbkdf2_sha512\$100000\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
      expect(verifyPassword(password, hash)).toBe(true);
    });

    it('rejects invalid passwords or corrupted hashes', () => {
      const hash = hashPassword('CorrectPassword123!');
      expect(verifyPassword('WrongPassword123!', hash)).toBe(false);
      expect(verifyPassword('CorrectPassword123!', 'invalid-hash-string')).toBe(false);
    });
  });

  describe('Step 030.3: System Super Admin & Root Company Provisioning', () => {
    it('provisions root system company, super_admin user, role membership, and audit record', async () => {
      const result = await seedSuperAdmin({
        companyRepo,
        userRepo,
        memberRepo,
        auditRepo,
      });

      expect(result.isNewProvisioning).toBe(true);

      // Verify Company
      expect(isValidUuidV7(result.company.id)).toBe(true);
      expect(result.company.legal_name).toBe('KD Solution IT Platform HQ');
      expect(result.company.risk_tier).toBe(1);
      expect(result.company.country).toBe('SG');
      expect(result.company.status).toBe('active');
      expect(result.company.default_currency).toBe('USD');

      // Verify User
      expect(isValidUuidV7(result.user.id)).toBe(true);
      expect(result.user.email).toBe('superadmin@kdsolution.it');
      expect(result.user.is_staff).toBe(true);
      expect(result.user.status).toBe('active');
      expect(verifyPassword('KdPlatformAdmin#2026!Secure', result.user.password_hash)).toBe(true);

      // Verify Membership
      expect(result.member.company_id).toBe(result.company.id);
      expect(result.member.user_id).toBe(result.user.id);
      expect(result.member.role).toBe('super_admin');
      expect(result.member.permissions).toContain('*');
      expect(result.member.status).toBe('active');

      // Verify Audit Log
      expect(result.auditLog.action).toBe('PLATFORM_SYSTEM_SEED_INITIALIZED');
      expect(result.auditLog.sequence_id).toBe(1);
      expect(result.auditLog.signature).toBeDefined();
      expect(result.auditLog.current_hash).toBeDefined();
    });

    it('executes idempotently without duplicating entities or crashing on re-run', async () => {
      const deps = { companyRepo, userRepo, memberRepo, auditRepo };

      const firstRun = await seedSuperAdmin(deps);
      expect(firstRun.isNewProvisioning).toBe(true);

      const secondRun = await seedSuperAdmin(deps);
      expect(secondRun.isNewProvisioning).toBe(false);
      expect(secondRun.company.id).toBe(firstRun.company.id);
      expect(secondRun.user.id).toBe(firstRun.user.id);
      expect(secondRun.member.id).toBe(firstRun.member.id);

      // Both audit entries are recorded sequentially in the audit chain
      expect(secondRun.auditLog.sequence_id).toBe(2);
      expect(secondRun.auditLog.prev_hash).toBe(firstRun.auditLog.current_hash);
    });

    it('respects custom configuration passed via dependency injection', async () => {
      const customConfig = {
        email: 'ceo.custom@kdsolution.it',
        fullLegalName: 'Chief Executive Officer',
        temporaryPassword: 'CustomCEO#Pass2026!',
        systemCompanyName: 'KD Solution Enterprise HQ',
        registrationNumber: 'REG-CUSTOM-001',
      };

      const result = await seedSuperAdmin({
        companyRepo,
        userRepo,
        memberRepo,
        auditRepo,
        config: customConfig,
      });

      expect(result.user.email).toBe('ceo.custom@kdsolution.it');
      expect(result.user.full_legal_name).toBe('Chief Executive Officer');
      expect(result.company.legal_name).toBe('KD Solution Enterprise HQ');
      expect(verifyPassword('CustomCEO#Pass2026!', result.user.password_hash)).toBe(true);
    });
  });

  describe('Step 030.1 & 030.4: Full Seed Engine Orchestration', () => {
    it('executes runSeeds() silently and measures positive execution duration', async () => {
      const result = await runSeeds({
        silent: true,
        deps: { companyRepo, userRepo, memberRepo, auditRepo },
      });

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.countries.totalCountries).toBeGreaterThan(0);
      expect(result.superAdmin.user.email).toBe('superadmin@kdsolution.it');
      expect(result.timestamp).toBeDefined();
    });
  });
});
