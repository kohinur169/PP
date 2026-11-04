// path: lib/db/sessions.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import type { SessionEntity, CreateSessionInput } from '../../types/session';

/**
 * Enterprise Repository for Persisted LR-022 Sessions.
 * Manages active session state, token hash lookups, touch timestamps, and revocation lifecycles.
 */
export class SessionRepository extends AbstractRepository<SessionEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<SessionEntity> | undefined;
  }) {
    super('Session', {
      defaultCompanyId:
        options?.defaultCompanyId ?? '00000000-0000-7000-8000-000000000000',
      driver: options?.driver,
    });
  }

  /**
   * Finds an active or historical session by its cryptographic SHA-256 token hash.
   */
  public async findByTokenHash(tokenHash: string): Promise<SessionEntity | null> {
    const all = await this.findMany({ includeDeleted: false });
    const match = all.find((s) => s.token_hash === tokenHash);
    return match ?? null;
  }

  /**
   * Retrieves all active (non-revoked, non-expired) sessions for a given user.
   */
  public async findActiveByUserId(
    userId: string,
    currentTime: number = Date.now()
  ): Promise<SessionEntity[]> {
    const all = await this.findMany({ includeDeleted: false });
    return all.filter((s) => {
      if (s.user_id !== userId) return false;
      if (s.revoked_at !== null) return false;
      const exp = new Date(s.expires_at).getTime();
      return exp > currentTime;
    });
  }

  /**
   * Updates last_active_at timestamp for a session.
   */
  public async touch(
    sessionId: string,
    lastActiveAt: string = new Date().toISOString()
  ): Promise<SessionEntity | null> {
    const session = await this.findById(sessionId);
    if (!session || session.revoked_at !== null) return null;

    return await this.update(session.id, session.version, {
      last_active_at: lastActiveAt,
    });
  }

  /**
   * Explicitly marks a session as revoked.
   */
  public async revoke(
    sessionId: string,
    reason: string = 'USER_LOGOUT'
  ): Promise<SessionEntity | null> {
    const session = await this.findById(sessionId);
    if (!session) return null;
    if (session.revoked_at !== null) return session;

    return await this.update(session.id, session.version, {
      revoked_at: new Date().toISOString(),
      revocation_reason: reason,
    });
  }

  /**
   * Revokes all active sessions for a user, optionally preserving one specific session.
   */
  public async revokeAllForUser(
    userId: string,
    exceptSessionId?: string,
    reason: string = 'TERMINATE_ALL'
  ): Promise<number> {
    const active = await this.findActiveByUserId(userId);
    let count = 0;

    for (const session of active) {
      if (exceptSessionId && (session.id === exceptSessionId || session.session_id === exceptSessionId)) {
        continue;
      }
      await this.revoke(session.id, reason);
      count++;
    }

    return count;
  }
}
