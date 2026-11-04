// path: lib/db/backup-codes.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import type { UserBackupCodeEntity } from '../../types/backup-codes';

/**
 * Enterprise Repository for Single-Use 2FA Backup Recovery Codes.
 * Manages persisted code hashes, single-use consumption, and complete lifecycle invalidation.
 */
export class UserBackupCodesRepository extends AbstractRepository<UserBackupCodeEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<UserBackupCodeEntity> | undefined;
  }) {
    super('UserBackupCode', {
      defaultCompanyId:
        options?.defaultCompanyId ?? '00000000-0000-7000-8000-000000000000',
      driver: options?.driver,
    });
  }

  /**
   * Retrieves all backup code records for a specific user.
   */
  public async findByUserId(userId: string): Promise<UserBackupCodeEntity[]> {
    const all = await this.findMany({ includeDeleted: false });
    return all.filter((item) => item.user_id === userId);
  }

  /**
   * Retrieves only unused, active backup code records for a specific user.
   */
  public async findActiveByUserId(userId: string): Promise<UserBackupCodeEntity[]> {
    const all = await this.findByUserId(userId);
    return all.filter((item) => item.used_at === null);
  }

  /**
   * Stores a batch of hashed backup codes in database.
   */
  public async storeHashedCodes(
    userId: string,
    codeHashes: string[],
    companyId?: string
  ): Promise<UserBackupCodeEntity[]> {
    const created: UserBackupCodeEntity[] = [];

    for (const codeHash of codeHashes) {
      const record = await this.create({
        user_id: userId,
        company_id: companyId ?? this.defaultCompanyId ?? '00000000-0000-7000-8000-000000000000',
        code_hash: codeHash,
        used_at: null,
      });
      created.push(record);
    }

    return created;
  }

  /**
   * Marks a backup recovery code as used, preventing subsequent re-use.
   */
  public async markUsed(id: string, version: number): Promise<UserBackupCodeEntity> {
    return await this.update(id, version, {
      used_at: new Date().toISOString(),
    });
  }

  /**
   * Invalidates (soft-deletes) all existing backup recovery codes for a user.
   * Invoked prior to generating 10 fresh replacement codes.
   */
  public async invalidateAllForUser(userId: string): Promise<number> {
    const existing = await this.findByUserId(userId);
    let count = 0;

    for (const record of existing) {
      await this.softDelete(record.id, record.version);
      count++;
    }

    return count;
  }

  /**
   * Returns count of active (unused and un-revoked) backup codes.
   */
  public async countActiveForUser(userId: string): Promise<number> {
    const active = await this.findActiveByUserId(userId);
    return active.length;
  }
}
