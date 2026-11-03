// path: tests/db/memberships.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { CompanyMemberRepository } from '../../lib/db/memberships';
import { isValidUuidV7 } from '../../lib/db/uuidv7';
import { CreateCompanyMemberInput } from '../../types/membership';

describe('Step 023: Company Memberships & Multi-Tenant Linkage Schema', () => {
  let repository: CompanyMemberRepository;

  const companyA = '018f6c4c-3500-7fa1-b1e2-aaaaaaaaaaaa';
  const companyB = '018f6c4c-3500-7fa1-b1e2-bbbbbbbbbbbb';
  const user1 = '018f6c4c-4500-7fa1-b1e2-111111111111';
  const user2 = '018f6c4c-4500-7fa1-b1e2-222222222222';
  const user3 = '018f6c4c-4500-7fa1-b1e2-333333333333';

  beforeEach(() => {
    repository = new CompanyMemberRepository();
  });

  const createValidMemberInput = (
    companyId: string = companyA,
    userId: string = user1,
    role: CreateCompanyMemberInput['role'] = 'owner'
  ): CreateCompanyMemberInput => ({
    company_id: companyId,
    user_id: userId,
    role,
    status: 'active',
    permissions: ['charges:write', 'refunds:write'],
  });

  describe('Company Member Registration & Base Attributes', () => {
    it('creates company member with UUIDv7, version = 1, and active status', async () => {
      const input = createValidMemberInput(companyA, user1, 'owner');
      const member = await repository.createMember(input);

      expect(isValidUuidV7(member.id)).toBe(true);
      expect(member.company_id).toBe(companyA);
      expect(member.user_id).toBe(user1);
      expect(member.role).toBe('owner');
      expect(member.status).toBe('active');
      expect(member.version).toBe(1);
      expect(member.deleted_at).toBeNull();
      expect(member.permissions).toContain('charges:write');
    });

    it('enforces uniqueness on (company_id, user_id)', async () => {
      await repository.createMember(createValidMemberInput(companyA, user1, 'admin'));

      // Attempt duplicate membership
      await expect(
        repository.createMember(createValidMemberInput(companyA, user1, 'developer'))
      ).rejects.toThrow(/Membership conflict/);
    });

    it('allows same user to hold distinct memberships across different companies', async () => {
      const memberInA = await repository.createMember(createValidMemberInput(companyA, user1, 'owner'));
      const memberInB = await repository.createMember(createValidMemberInput(companyB, user1, 'developer'));

      expect(memberInA.company_id).toBe(companyA);
      expect(memberInB.company_id).toBe(companyB);
      expect(memberInA.user_id).toBe(memberInB.user_id);
    });
  });

  describe('Strictly One-Owner-Per-Company Business Rule', () => {
    it('prohibits creating a second owner for the same company', async () => {
      await repository.createMember(createValidMemberInput(companyA, user1, 'owner'));

      // Attempt second owner in company A
      await expect(
        repository.createMember(createValidMemberInput(companyA, user2, 'owner'))
      ).rejects.toThrow(/Ownership constraint violation/);
    });

    it('prohibits promoting an existing member to owner when company already has an active owner', async () => {
      const owner = await repository.createMember(createValidMemberInput(companyA, user1, 'owner'));
      const admin = await repository.createMember(createValidMemberInput(companyA, user2, 'admin'));

      expect(owner.role).toBe('owner');
      expect(admin.role).toBe('admin');

      // Attempt promote admin -> owner
      await expect(repository.updateRole(admin.id, admin.version, 'owner')).rejects.toThrow(
        /Ownership constraint violation/
      );
    });

    it('atomically transfers ownership between existing company members', async () => {
      const owner = await repository.createMember(createValidMemberInput(companyA, user1, 'owner'));
      const admin = await repository.createMember(createValidMemberInput(companyA, user2, 'admin'));

      const transfer = await repository.transferOwnership(companyA, owner.id, user2);

      expect(transfer.previousOwner.role).toBe('admin');
      expect(transfer.previousOwner.version).toBe(2);

      expect(transfer.newOwner.role).toBe('owner');
      expect(transfer.newOwner.version).toBe(2);

      // Verify active owner is now user2
      const activeOwner = await repository.findCompanyOwner(companyA);
      expect(activeOwner).not.toBeNull();
      expect(activeOwner!.user_id).toBe(user2);
    });
  });

  describe('Multi-Tenant User Membership Resolution', () => {
    it('retrieves all active memberships across companies for a user', async () => {
      await repository.createMember(createValidMemberInput(companyA, user1, 'owner'));
      await repository.createMember(createValidMemberInput(companyB, user1, 'compliance_kyc'));

      const memberships = await repository.getUserCompanyMemberships(user1);
      expect(memberships).toHaveLength(2);

      const companyIds = memberships.map((m) => m.company_id);
      expect(companyIds).toContain(companyA);
      expect(companyIds).toContain(companyB);
    });

    it('excludes revoked or soft-deleted memberships from active user lookups', async () => {
      const member = await repository.createMember(createValidMemberInput(companyA, user1, 'support'));
      await repository.updateStatus(member.id, member.version, 'revoked');

      const memberships = await repository.getUserCompanyMemberships(user1);
      expect(memberships).toHaveLength(0);
    });

    it('retrieves company staff list via getCompanyMembers', async () => {
      await repository.createMember(createValidMemberInput(companyA, user1, 'owner'));
      await repository.createMember(createValidMemberInput(companyA, user2, 'finance_ops'));
      await repository.createMember(createValidMemberInput(companyA, user3, 'blogger'));

      const staff = await repository.getCompanyMembers(companyA);
      expect(staff).toHaveLength(3);
    });
  });

  describe('PostgreSQL Migration DDL & Constraints Integrity', () => {
    it('verifies db/migrations/008_create_company_members_table.sql contains table, indexes, and constraints', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'db/migrations/008_create_company_members_table.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.company_members');
      expect(sql).toContain('chk_company_members_status');
      expect(sql).toContain('chk_company_members_role');
      expect(sql).toContain('uq_company_members_company_user');
      expect(sql).toContain('uq_company_members_one_owner_per_company');
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('FORCE ROW LEVEL SECURITY');
      expect(sql).toContain('pol_company_members_tenant_isolation');
    });

    it('verifies supabase/migrations/20261103000012_create_company_members_table.sql matches schema definitions', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261103000012_create_company_members_table.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('attach_standard_table_triggers');
      expect(sql).toContain('idx_company_members_user_id');
      expect(sql).toContain('idx_company_members_company_id');
    });
  });
});
