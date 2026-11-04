// path: lib/db/sessions.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import { generateUuidV7 } from './uuidv7';
import type { SessionEntity, CreateSessionRecordInput } from '../../types/session';

/**
 * Enterprise Repository for Persisted LR-022 Sessions.
 * Manages active session state, token hash lookups, touch timestamps, session family lineage,
 * and immediate replay invalidation lifecycles.
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
   * Overrides create to provide automatic UUIDv7 defaults for session_family_id and lineage flags.
   */
  public override async create(input: CreateSessionRecordInput): Promise<SessionEntity> {
    return await super.create({
      ...input,
      session_family_id: input.session_family_id ?? generateUuidV7(),
      is_revoked: input.is_revoked ?? false,
      is_consumed: input.is_consumed ?? false,
      consumed_at: input.consumed_at ?? null,
      parent_session_id: input.parent_session_id ?? null,
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
   * Finds a session by either primary key id or session_id alias.
   */
  public async findBySessionId(sessionId: string): Promise<SessionEntity | null> {
    const all = await this.findMany({ includeDeleted: false });
    const match = all.find((s) => s.id === sessionId || s.session_id === sessionId);
    return match ?? null;
  }

  /**
   * Retrieves all session records sharing a given session_family_id lineage.
   */
  public async findByFamilyId(familyId: string): Promise<SessionEntity[]> {
    const all = await this.findMany({ includeDeleted: false });
    return all.filter((s) => s.session_family_id === familyId);
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
      if (s.revoked_at !== null || s.is_revoked) return false;
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
    const session = await this.findBySessionId(sessionId);
    if (!session || session.revoked_at !== null || session.is_revoked) return null;

    return await this.update(session.id, session.version, {
      last_active_at: lastActiveAt,
    });
  }

  /**
   * Marks a session token as consumed following token rotation.
   */
  public async markConsumed(
    sessionId: string,
    consumedAt: string = new Date().toISOString()
  ): Promise<SessionEntity | null> {
    const session = await this.findBySessionId(sessionId);
    if (!session) return null;

    return await this.update(session.id, session.version, {
      is_consumed: true,
      consumed_at: consumedAt,
    });
  }

  /**
   * Explicitly marks a single session as revoked.
   */
  public async revoke(
    sessionId: string,
    reason: string = 'USER_LOGOUT'
  ): Promise<SessionEntity | null> {
    const session = await this.findBySessionId(sessionId);
    if (!session) return null;
    if (session.revoked_at !== null && session.is_revoked) return session;

    return await this.update(session.id, session.version, {
      revoked_at: new Date().toISOString(),
      revocation_reason: reason,
      is_revoked: true,
    });
  }

  /**
   * Step 057.3: Invalidates all sessions belonging to a session_family_id lineage immediately
   * upon detecting a replayed or consumed token.
   */
  public async revokeFamily(
    familyId: string,
    reason: string = 'SESSION_REPLAY_DETECTED'
  ): Promise<number> {
    const familySessions = await this.findByFamilyId(familyId);
    let revokedCount = 0;

    for (const session of familySessions) {
      if (!session.is_revoked || !session.revoked_at) {
        await this.update(session.id, session.version, {
          is_revoked: true,
          revoked_at: new Date().toISOString(),
          revocation_reason: reason,
        });
        revokedCount++;
      }
    }

    return revokedCount;
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
