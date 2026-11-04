// path: lib/db/mfa.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import type { UserMfaEntity } from '../../types/mfa';

/**
 * Enterprise User MFA Repository.
 * Manages TOTP secret ciphertext envelopes and multi-factor activation flags.
 */
export class UserMfaRepository extends AbstractRepository<UserMfaEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<UserMfaEntity> | undefined;
  }) {
    super('UserMfa', {
      defaultCompanyId:
        options?.defaultCompanyId ?? '00000000-0000-7000-8000-000000000000',
      driver: options?.driver,
    });
  }

  /**
   * Retrieves the MFA record associated with a user ID.
   */
  public async findByUserId(userId: string): Promise<UserMfaEntity | null> {
    const all = await this.findMany({ includeDeleted: false });
    const found = all.find((record) => record.user_id === userId);
    return found ?? null;
  }

  /**
   * Creates or updates a pending TOTP enrollment for a user.
   * Keeps mfa_enabled = false until the first valid 6-digit code is confirmed.
   */
  public async upsertEnrollment(
    userId: string,
    totpSecretEncrypted: string,
    backupCodesHashes: string[] = [],
    companyId?: string
  ): Promise<UserMfaEntity> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return await this.update(existing.id, existing.version, {
        totp_secret_encrypted: totpSecretEncrypted,
        mfa_enabled: false,
        backup_codes_hashes: backupCodesHashes,
        last_used_step: null,
      });
    }

    return await this.create({
      user_id: userId,
      company_id: companyId ?? '00000000-0000-7000-8000-000000000000',
      totp_secret_encrypted: totpSecretEncrypted,
      mfa_enabled: false,
      backup_codes_hashes: backupCodesHashes,
      last_used_step: null,
    });
  }

  /**
   * Activates MFA for a user upon successful code verification.
   */
  public async enableMfa(userId: string, step?: number): Promise<UserMfaEntity> {
    const existing = await this.findByUserId(userId);
    if (!existing) {
      throw new Error(`MFA record not found for user "${userId}".`);
    }

    return await this.update(existing.id, existing.version, {
      mfa_enabled: true,
      last_used_step: step ?? existing.last_used_step,
    });
  }

  /**
   * Disables MFA for a user (e.g., following authorized administrative reset).
   */
  public async disableMfa(userId: string): Promise<UserMfaEntity> {
    const existing = await this.findByUserId(userId);
    if (!existing) {
      throw new Error(`MFA record not found for user "${userId}".`);
    }

    return await this.update(existing.id, existing.version, {
      mfa_enabled: false,
      last_used_step: null,
    });
  }

  /**
   * Updates the last used step to prevent replay attacks within the same 30-second window.
   */
  public async updateLastUsedStep(
    userId: string,
    step: number
  ): Promise<UserMfaEntity> {
    const existing = await this.findByUserId(userId);
    if (!existing) {
      throw new Error(`MFA record not found for user "${userId}".`);
    }

    return await this.update(existing.id, existing.version, {
      last_used_step: step,
    });
  }
}
