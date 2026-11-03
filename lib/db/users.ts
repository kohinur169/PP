// path: lib/db/users.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import {
  UserEntity,
  CreateUserInput,
  UpdateUserInput,
  UserAccountStatus,
  UserCreateSchema,
} from '../../types/user';

/**
 * Enterprise User Identity Repository.
 * Enforces KD Solution IT security baselines:
 * - RFC 9562 UUIDv7 Primary Keys
 * - Lowercase unique email address constraints
 * - Failed login attempt tracking and automated lockout triggers
 * - Secure password rotation timestamp tracking
 * - Optimistic concurrency control and safe soft-deletion
 */
export class UserRepository extends AbstractRepository<UserEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<UserEntity> | undefined;
  }) {
    super('User', options);
  }

  /**
   * Registers a new user identity with validated email, credentials, and default lockout state.
   */
  public async createUser(input: CreateUserInput): Promise<UserEntity> {
    const validated = UserCreateSchema.parse({
      email: input.email,
      full_legal_name: input.full_legal_name,
      password_hash: input.password_hash,
      phone: input.phone ?? null,
      phone_hash: input.phone_hash ?? null,
      failed_attempts: input.failed_attempts ?? 0,
      locked_until: input.locked_until ?? null,
      is_staff: input.is_staff ?? false,
      status: input.status ?? 'pending_verification',
    });

    // Check lowercase unique email
    const existing = await this.findByEmail(validated.email);
    if (existing) {
      throw new Error(`Email address conflict: User with email "${validated.email}" already exists.`);
    }

    const now = new Date().toISOString();

    return await this.create({
      ...input,
      ...validated,
      email: validated.email.toLowerCase().trim(),
      company_id: input.company_id ?? '00000000-0000-7000-8000-000000000000', // global user or company-linked
      password_changed_at: now,
    });
  }

  /**
   * Finds an active or soft-deleted user by lowercase email.
   */
  public async findByEmail(email: string): Promise<UserEntity | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const allUsers = await this.findMany({ includeDeleted: true });

    const found = allUsers.find((u) => u.email.toLowerCase().trim() === normalizedEmail);
    return found ?? null;
  }

  /**
   * Finds a user by cryptographic phone hash.
   */
  public async findByPhoneHash(phoneHash: string): Promise<UserEntity | null> {
    const allUsers = await this.findMany({ includeDeleted: true });
    const found = allUsers.find((u) => u.phone_hash === phoneHash);
    return found ?? null;
  }

  /**
   * Increments failed login attempt counter. If attempts reach maxAttempts (default: 5),
   * automatically locks the account for lockoutMinutes (default: 30 minutes).
   */
  public async recordFailedLogin(
    id: string,
    expectedVersion: number,
    maxAttempts: number = 5,
    lockoutMinutes: number = 30
  ): Promise<UserEntity> {
    const user = await this.findByIdOrThrow(id);
    const newAttempts = user.failed_attempts + 1;

    let lockedUntil: string | null = user.locked_until;
    let newStatus: UserAccountStatus = user.status;

    if (newAttempts >= maxAttempts) {
      const lockDate = new Date(Date.now() + lockoutMinutes * 60 * 1000);
      lockedUntil = lockDate.toISOString();
      newStatus = 'locked';
    }

    return await this.update(id, expectedVersion, {
      failed_attempts: newAttempts,
      locked_until: lockedUntil,
      status: newStatus,
    });
  }

  /**
   * Resets failed login attempt counter to 0 upon successful authentication.
   */
  public async resetFailedLogin(id: string, expectedVersion: number): Promise<UserEntity> {
    return await this.update(id, expectedVersion, {
      failed_attempts: 0,
      locked_until: null,
      status: 'active',
    });
  }

  /**
   * Unlocks an account explicitly (e.g. by compliance/admin action or step-up reauthentication).
   */
  public async unlockAccount(id: string, expectedVersion: number): Promise<UserEntity> {
    return await this.update(id, expectedVersion, {
      failed_attempts: 0,
      locked_until: null,
      status: 'active',
    });
  }

  /**
   * Rotates user password hash and updates password_changed_at timestamp.
   */
  public async updatePassword(
    id: string,
    expectedVersion: number,
    newPasswordHash: string
  ): Promise<UserEntity> {
    return await this.update(id, expectedVersion, {
      password_hash: newPasswordHash,
      password_changed_at: new Date().toISOString(),
      failed_attempts: 0,
      locked_until: null,
    });
  }

  /**
   * Updates user account status.
   */
  public async updateStatus(
    id: string,
    expectedVersion: number,
    status: UserAccountStatus
  ): Promise<UserEntity> {
    return await this.update(id, expectedVersion, { status });
  }
}
