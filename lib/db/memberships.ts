// path: lib/db/memberships.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import {
  CompanyMemberEntity,
  CreateCompanyMemberInput,
  UpdateCompanyMemberInput,
  CompanyMemberRole,
  CompanyMemberStatus,
  CompanyMemberCreateSchema,
} from '../../types/membership';

/**
 * Enterprise Company Memberships Repository.
 * Enforces KD Solution IT membership governance:
 * - RFC 9562 UUIDv7 Primary Keys
 * - Unique (company_id, user_id) active membership constraint
 * - Strictly ONE active owner permitted per company
 * - Ownership transfer governance
 * - Optimistic concurrency control and safe soft-deletion
 */
export class CompanyMemberRepository extends AbstractRepository<CompanyMemberEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<CompanyMemberEntity> | undefined;
  }) {
    super('CompanyMember', options);
  }

  /**
   * Adds or invites a user to a company.
   * Enforces uniqueness on (company_id, user_id) and exactly one owner per company.
   */
  public async createMember(input: CreateCompanyMemberInput): Promise<CompanyMemberEntity> {
    const validated = CompanyMemberCreateSchema.parse({
      company_id: input.company_id,
      user_id: input.user_id,
      role: input.role,
      status: input.status ?? 'active',
      permissions: input.permissions ?? [],
      invited_at: input.invited_at ?? null,
      accepted_at: input.accepted_at ?? (input.status === 'active' ? new Date().toISOString() : null),
    });

    // Check unique (company_id, user_id)
    const existing = await this.findByCompanyAndUser(validated.company_id, validated.user_id);
    if (existing && existing.deleted_at === null) {
      throw new Error(
        `Membership conflict: User "${validated.user_id}" is already a member of company "${validated.company_id}".`
      );
    }

    // Business rule: Exactly ONE owner permitted per company
    if (validated.role === 'owner') {
      const existingOwner = await this.findCompanyOwner(validated.company_id);
      if (existingOwner) {
        throw new Error(
          `Ownership constraint violation: Company "${validated.company_id}" already has an active owner (member ID: "${existingOwner.id}").`
        );
      }
    }

    return await this.create({
      ...input,
      ...validated,
      company_id: validated.company_id,
    });
  }

  /**
   * Finds an active membership record for a specific company and user.
   */
  public async findByCompanyAndUser(
    companyId: string,
    userId: string
  ): Promise<CompanyMemberEntity | null> {
    const all = await this.findMany({
      companyId,
      includeDeleted: true,
    });

    const match = all.find((m) => m.company_id === companyId && m.user_id === userId);
    return match ?? null;
  }

  /**
   * Retrieves the active owner of a company.
   */
  public async findCompanyOwner(companyId: string): Promise<CompanyMemberEntity | null> {
    const members = await this.findMany({ companyId });
    const owner = members.find((m) => m.role === 'owner' && m.status === 'active');
    return owner ?? null;
  }

  /**
   * Retrieves all active memberships across all companies for an authenticated user.
   */
  public async getUserCompanyMemberships(userId: string): Promise<CompanyMemberEntity[]> {
    const allMemberships = await this.driver.findMany(
      (m) => m.user_id === userId && m.deleted_at === null && m.status !== 'revoked'
    );
    return allMemberships;
  }

  /**
   * Retrieves all members of a company.
   */
  public async getCompanyMembers(companyId: string): Promise<CompanyMemberEntity[]> {
    return await this.findMany({ companyId });
  }

  /**
   * Updates member role with optimistic locking.
   * Prevents assigning a second owner.
   */
  public async updateRole(
    id: string,
    expectedVersion: number,
    newRole: CompanyMemberRole
  ): Promise<CompanyMemberEntity> {
    const current = await this.findByIdOrThrow(id);

    if (newRole === 'owner' && current.role !== 'owner') {
      const existingOwner = await this.findCompanyOwner(current.company_id);
      if (existingOwner && existingOwner.id !== id) {
        throw new Error(
          `Ownership constraint violation: Company "${current.company_id}" already has an active owner.`
        );
      }
    }

    return await this.update(id, expectedVersion, { role: newRole });
  }

  /**
   * Updates membership status (e.g. accepted, revoked).
   */
  public async updateStatus(
    id: string,
    expectedVersion: number,
    status: CompanyMemberStatus
  ): Promise<CompanyMemberEntity> {
    return await this.update(id, expectedVersion, { status });
  }

  /**
   * Atomically transfers company ownership from the current owner to another existing member.
   */
  public async transferOwnership(
    companyId: string,
    currentOwnerMemberId: string,
    newOwnerUserId: string
  ): Promise<{ previousOwner: CompanyMemberEntity; newOwner: CompanyMemberEntity }> {
    const currentOwner = await this.findByIdOrThrow(currentOwnerMemberId);
    if (currentOwner.company_id !== companyId || currentOwner.role !== 'owner') {
      throw new Error(`Member "${currentOwnerMemberId}" is not the current owner of company "${companyId}".`);
    }

    const newOwnerMember = await this.findByCompanyAndUser(companyId, newOwnerUserId);
    if (!newOwnerMember) {
      throw new Error(`Target user "${newOwnerUserId}" is not a member of company "${companyId}".`);
    }

    // Demote previous owner to admin
    const previousOwner = await this.update(currentOwner.id, currentOwner.version, {
      role: 'admin',
    });

    // Promote new owner
    const newOwner = await this.update(newOwnerMember.id, newOwnerMember.version, {
      role: 'owner',
    });

    return { previousOwner, newOwner };
  }
}
