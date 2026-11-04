// path: lib/db/email-verify.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import {
  EmailVerificationTokenEntity,
  EmailVerificationTokenCreateSchema,
} from '../../types/email-verify';

/**
 * Enterprise Email Verification Token Repository.
 * Manages one-time cryptographic verification tokens with 24-hour expiration.
 */
export class EmailVerificationTokenRepository extends AbstractRepository<EmailVerificationTokenEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<EmailVerificationTokenEntity> | undefined;
  }) {
    super('EmailVerificationToken', options);
  }

  /**
   * Persists a newly generated email verification token record.
   */
  public async createToken(input: {
    readonly userId: string;
    readonly tokenHash: string;
    readonly expiresAt: string;
    readonly companyId?: string | undefined;
  }): Promise<EmailVerificationTokenEntity> {
    const validated = EmailVerificationTokenCreateSchema.parse({
      user_id: input.userId,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      used_at: null,
    });

    return await this.create({
      user_id: validated.user_id,
      token_hash: validated.token_hash,
      expires_at: validated.expires_at,
      used_at: null,
      company_id: input.companyId ?? '00000000-0000-7000-8000-000000000000',
    });
  }

  /**
   * Finds a token record by its SHA-256 token hash.
   */
  public async findByTokenHash(
    tokenHash: string
  ): Promise<EmailVerificationTokenEntity | null> {
    const normalized = tokenHash.toLowerCase().trim();
    const all = await this.findMany({ includeDeleted: false });
    return all.find((t) => t.token_hash.toLowerCase() === normalized) ?? null;
  }

  /**
   * Finds all unconsumed, active tokens for a given user.
   */
  public async findPendingByUserId(
    userId: string
  ): Promise<EmailVerificationTokenEntity[]> {
    const all = await this.findMany({ includeDeleted: false });
    const now = new Date().getTime();
    return all.filter(
      (t) =>
        t.user_id === userId &&
        t.used_at === null &&
        new Date(t.expires_at).getTime() > now
    );
  }

  /**
   * Marks a token as consumed / used.
   */
  public async markUsed(
    id: string,
    expectedVersion: number
  ): Promise<EmailVerificationTokenEntity> {
    return await this.update(id, expectedVersion, {
      used_at: new Date().toISOString(),
    });
  }

  /**
   * Invalidates (marks expired/used) any existing pending tokens for a user
   * before issuing a new one.
   */
  public async invalidatePendingTokensForUser(userId: string): Promise<number> {
    const pending = await this.findPendingByUserId(userId);
    const now = new Date().toISOString();
    let count = 0;

    for (const token of pending) {
      await this.update(token.id, token.version, {
        used_at: now,
      });
      count++;
    }

    return count;
  }
}
