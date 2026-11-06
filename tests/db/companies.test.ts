// path: tests/db/companies.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { CompanyRepository } from '../../lib/db/companies';
import { isValidUuidV7 } from '../../lib/db/uuidv7';
import { CreateCompanyInput } from '../../types/company';
import { OptimisticLockError } from '../../types/entity';

describe('Step 021: Companies & Sub-Merchant Tenant Schema Migration', () => {
  let repository: CompanyRepository;

  beforeEach(() => {
    repository = new CompanyRepository();
  });

  const validAddress = {
    street1: '100 Marina Bay Financial Centre',
    street2: 'Tower 2, #28-01',
    city: 'Singapore',
    postalCode: '018981',
    country: 'SG',
  };

  const createValidInput = (reg: string = '2026110301K'): CreateCompanyInput => ({
    company_id: '018f6c4c-3500-7fa1-b1e2-123456789abc',
    legal_name: 'KD Solution Asia Pte. Ltd.',
    dba_name: 'KD Pay Asia',
    business_type: 'corporation',
    registration_number: reg,
    country: 'SG',
    operating_address: validAddress,
    mcc: '5411',
    risk_tier: 2,
    status: 'draft',
    custom_fee_percent: '2.9000',
    custom_hold_days: 7,
    reserve_percent: '10.0000',
    reserve_hold_days: 180,
    default_currency: 'USD',
  });

  describe('Sub-Merchant Company Registration & Schema Constraints', () => {
    it('creates sub-merchant company with UUIDv7, version = 1, and USD default currency', async () => {
      const input = createValidInput();
      const company = await repository.createCompany(input);

      expect(isValidUuidV7(company.id)).toBe(true);
      expect(company.legal_name).toBe('KD Solution Asia Pte. Ltd.');
      expect(company.dba_name).toBe('KD Pay Asia');
      expect(company.country).toBe('SG');
      expect(company.mcc).toBe('5411');
      expect(company.risk_tier).toBe(2);
      expect(company.status).toBe('draft');
      expect(company.default_currency).toBe('USD');
      expect(company.version).toBe(1);
      expect(company.deleted_at).toBeNull();
      expect(company.operating_address.city).toBe('Singapore');
    });

    it('enforces uniqueness on (country, registration_number)', async () => {
      const input1 = createValidInput('UNIQUE-REG-01');
      await repository.createCompany(input1);

      // Attempt second registration with same registration_number and country
      const duplicateInput = createValidInput('UNIQUE-REG-01');
      await expect(repository.createCompany(duplicateInput)).rejects.toThrow(
        /Company registration conflict/
      );
    });

    it('allows identical registration numbers in different countries', async () => {
      const sgInput = createValidInput('GLOBAL-REG-99');
      const usInput: CreateCompanyInput = {
        ...createValidInput('GLOBAL-REG-99'),
        country: 'US',
        operating_address: {
          street1: '350 5th Ave',
          city: 'New York',
          postalCode: '10118',
          country: 'US',
        },
      };

      const c1 = await repository.createCompany(sgInput);
      const c2 = await repository.createCompany(usInput);

      expect(c1.country).toBe('SG');
      expect(c2.country).toBe('US');
      expect(c1.registration_number).toBe(c2.registration_number);
    });
  });

  describe('Zod Validation & Attribute Boundaries', () => {
    it('rejects invalid 3-digit or non-numeric MCC codes', async () => {
      const invalidMccInput = {
        ...createValidInput(),
        mcc: '541', // must be 4 digits
      };

      await expect(repository.createCompany(invalidMccInput)).rejects.toThrow();
    });

    it('rejects invalid country codes that are not 2-character ISO codes', async () => {
      const invalidCountryInput = {
        ...createValidInput(),
        country: 'USA', // must be 2 characters
      };

      await expect(repository.createCompany(invalidCountryInput)).rejects.toThrow();
    });

    it('rejects invalid fee string formats', async () => {
      const invalidFeeInput = {
        ...createValidInput(),
        custom_fee_percent: 'invalid',
      };

      await expect(repository.createCompany(invalidFeeInput)).rejects.toThrow();
    });
  });

  describe('Mutations, Optimistic Concurrency & Lifecycle Updates', () => {
    it('updates risk tier with optimistic version increment', async () => {
      const company = await repository.createCompany(createValidInput('REG-RISK-01'));
      expect(company.version).toBe(1);

      const updated = await repository.updateRiskTier(company.id, 1, 3);
      expect(updated.risk_tier).toBe(3);
      expect(updated.version).toBe(2);

      // Conflict on stale version
      await expect(repository.updateRiskTier(company.id, 1, 1)).rejects.toThrow(
        OptimisticLockError
      );
    });

    it('updates company status through valid lifecycle transitions', async () => {
      const company = await repository.createCompany(createValidInput('REG-STATUS-01'));

      const underReview = await repository.updateStatus(company.id, 1, 'under_review');
      expect(underReview.status).toBe('under_review');
      expect(underReview.version).toBe(2);

      const active = await repository.updateStatus(company.id, 2, 'active');
      expect(active.status).toBe('active');
      expect(active.version).toBe(3);
    });

    it('updates custom fee and reserve settings', async () => {
      const company = await repository.createCompany(createValidInput('REG-FEES-01'));

      const updated = await repository.updateFeeSettings(company.id, 1, {
        custom_fee_percent: '1.9500',
        custom_hold_days: 3,
        reserve_percent: '5.0000',
        reserve_hold_days: 90,
      });

      expect(updated.custom_fee_percent).toBe('1.9500');
      expect(updated.custom_hold_days).toBe(3);
      expect(updated.reserve_percent).toBe('5.0000');
      expect(updated.reserve_hold_days).toBe(90);
      expect(updated.version).toBe(2);
    });
  });

  describe('PostgreSQL Migration DDL & Constraints Integrity', () => {
    it('verifies db/migrations/006_create_companies_table.sql contains table, constraints, and indexes', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'db/migrations/006_create_companies_table.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.companies');
      expect(sql).toContain('chk_companies_risk_tier');
      expect(sql).toContain('chk_companies_status');
      expect(sql).toContain('chk_companies_default_currency');
      expect(sql).toContain('uq_companies_country_registration');
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('FORCE ROW LEVEL SECURITY');
      expect(sql).toContain('pol_companies_tenant_isolation');
    });

    it('verifies supabase/migrations/20261103000010_create_companies_table.sql matches schema definitions', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261103000010_create_companies_table.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('attach_standard_table_triggers');
      expect(sql).toContain('idx_companies_country');
      expect(sql).toContain('idx_companies_risk_tier');
    });
  });
});
