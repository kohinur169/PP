// path: lib/db/password-reset.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import type { PasswordResetTokenEntity, CreatePasswordResetTokenInput } from '../../types/password-reset';

/**
 * Enterprise Password Reset Token Repository.
 * Manages persisted cryptographic token hashes, expiration intervals, and single-use redemption flags.
 */
export class PasswordResetTokenRepository extends AbstractRepository<PasswordResetTokenEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<PasswordResetTokenEntity> | undefined;
  }) {
    super('PasswordResetToken', options);
  }

  /**
   * Overrides create to provide defaults and ensure company_id fallback.
   */
  public override async create(
    input: CreatePasswordResetTokenInput
  ): Promise<PasswordResetTokenEntity> {
    return await super.create({
      ...input,
      company_id:
        input.company_id ??
        this.defaultCompanyId ??
        '00000000-0000-7000-8000-000000000000',
      used_at: input.used_at ?? null,
    });
  }

  /**
   * Finds a password reset token by its deterministic SHA-256 token hash.
   */
  public async findByTokenHash(
    tokenHash: string
  ): Promise<PasswordResetTokenEntity | null> {
    const all = await this.driver.findMany(
      (record) => record.token_hash === tokenHash && record.deleted_at === null
    );
    return all[0] ?? null;
  }

  /**
   * Finds the latest active, unexpired, and unused reset token for a given user.
   */
  public async findPendingByUserId(
    userId: string,
    currentTime: number = Date.now()
  ): Promise<PasswordResetTokenEntity | null> {
    const all = await this.driver.findMany((record) => {
      if (record.user_id !== userId || record.deleted_at !== null) return false;
      if (record.used_at !== null) return false;
      const exp = new Date(record.expires_at).getTime();
      return exp > currentTime;
    });

    if (all.length === 0) return null;
    all.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return all[0] ?? null;
  }

  /**
   * Marks a reset token as consumed (used_at set to timestamp).
   */
  public async markUsed(
    id: string,
    expectedVersion: number,
    usedAt: string = new Date().toISOString()
  ): Promise<PasswordResetTokenEntity> {
    return await this.update(id, expectedVersion, {
      used_at: usedAt,
    });
  }

  /**
   * Invalidates all existing pending tokens for a user when issuing a fresh one.
   */
  public async invalidatePendingForUser(userId: string): Promise<number> {
    const pending = await this.driver.findMany((record) => {
      if (record.user_id !== userId || record.deleted_at !== null) return false;
      return record.used_at === null;
    });

    let count = 0;
    const nowIso = new Date().toISOString();
    for (const token of pending) {
      await this.update(token.id, token.version, {
        used_at: nowIso,
      });
      count++;
    }

    return count;
  }
}
