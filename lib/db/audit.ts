// path: lib/db/audit.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import { generateUuidV7 } from './uuidv7';
import {
  AuditLogEntity,
  CreateAuditLogInput,
  AuditLogCreateSchema,
  AuditLogEntitySchema,
  GENESIS_HASH,
} from '../../types/audit';
import { computeAuditHash, verifyAuditHash } from '../audit/hasher';
import { signAuditEntry } from '../security/audit-signer';

/**
 * Result returned by audit chain integrity verification.
 */
export interface AuditChainVerificationResult {
  readonly valid: boolean;
  readonly verifiedCount: number;
  readonly brokenSequenceId?: number | undefined;
  readonly reason?: string | undefined;
}

/**
 * Enterprise Repository for Append-Only Cryptographic Hash-Chained Audit Logs.
 * Enforces cryptographic chaining, monotonic sequences, and physical immutability.
 */
export class AuditLogRepository extends AbstractRepository<AuditLogEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<AuditLogEntity> | undefined;
  }) {
    super('AuditLog', options);
  }

  /**
   * Appends an immutable, cryptographic hash-chained audit log entry.
   * Chaining rule: current_hash = SHA256(prev_hash + ":" + sequence_id + ":" + canonicalJson(payload))
   */
  public async append(input: CreateAuditLogInput): Promise<AuditLogEntity> {
    const validated = AuditLogCreateSchema.parse({
      id: input.id,
      sequence_id: input.sequence_id,
      company_id: input.company_id ?? this.defaultCompanyId ?? undefined,
      actor_id: input.actor_id ?? null,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      diff_payload: input.diff_payload ?? null,
      payload: input.payload ?? {},
      prev_hash: input.prev_hash,
      current_hash: input.current_hash,
      signature: input.signature,
      ip_address: input.ip_address ?? null,
      user_agent: input.user_agent ?? null,
    });

    // 1. Determine monotonic sequence_id and previous hash
    const lastEntry = await this.getLastEntry();
    const sequenceId =
      validated.sequence_id ?? (lastEntry ? lastEntry.sequence_id + 1 : 1);
    const prevHash =
      validated.prev_hash ?? (lastEntry ? lastEntry.current_hash : GENESIS_HASH);

    // 2. Compute SHA-256 current_hash if not explicitly provided
    const currentHash =
      validated.current_hash ??
      computeAuditHash(prevHash, sequenceId, validated.payload);

    // 3. Compute Ed25519 signature if not explicitly provided
    const signature = validated.signature ?? signAuditEntry(currentHash);

    const now = new Date().toISOString();

    const entity: AuditLogEntity = {
      id: validated.id ?? generateUuidV7(),
      company_id: validated.company_id ?? '00000000-0000-0000-0000-000000000000',
      sequence_id: sequenceId,
      actor_id: validated.actor_id ?? null,
      action: validated.action,
      entity_type: validated.entity_type,
      entity_id: validated.entity_id ?? null,
      diff_payload: (validated.diff_payload as any) ?? null,
      payload: validated.payload,
      prev_hash: prevHash,
      current_hash: currentHash,
      entry_hash: currentHash,
      signature: signature ?? null,
      ip_address: validated.ip_address ?? null,
      user_agent: validated.user_agent ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      version: 1,
    };

    this.validate(entity);
    return this.driver.insert(entity);
  }

  /**
   * Alias for append, matching standard repository creation syntax.
   */
  public async createLog(input: CreateAuditLogInput): Promise<AuditLogEntity> {
    return this.append(input);
  }

  /**
   * Retrieves the most recently appended audit log entry across the entire platform or company.
   */
  public async getLastEntry(companyId?: string | null): Promise<AuditLogEntity | null> {
    const entries = await this.driver.findMany((entry) => {
      if (companyId) {
        return entry.company_id === companyId;
      }
      return true;
    });

    if (entries.length === 0) {
      return null;
    }

    entries.sort((a, b) => b.sequence_id - a.sequence_id);
    return entries[0]!;
  }

  /**
   * Retrieves an audit log entry by its monotonic sequence ID.
   */
  public async findBySequenceId(sequenceId: number): Promise<AuditLogEntity | null> {
    const results = await this.driver.findMany((entry) => entry.sequence_id === sequenceId);
    return results[0] ?? null;
  }

  /**
   * Retrieves all audit log entries targeting a specific entity type and ID.
   */
  public async findByEntity(entityType: string, entityId: string): Promise<AuditLogEntity[]> {
    const results = await this.driver.findMany(
      (entry) => entry.entity_type === entityType && entry.entity_id === entityId
    );
    return results.sort((a, b) => a.sequence_id - b.sequence_id);
  }

  /**
   * Retrieves all audit entries triggered by a specific actor user ID.
   */
  public async findByActor(actorId: string): Promise<AuditLogEntity[]> {
    const results = await this.driver.findMany((entry) => entry.actor_id === actorId);
    return results.sort((a, b) => a.sequence_id - b.sequence_id);
  }

  /**
   * Retrieves all audit entries for a specific action.
   */
  public async findByAction(action: string): Promise<AuditLogEntity[]> {
    const results = await this.driver.findMany((entry) => entry.action === action);
    return results.sort((a, b) => a.sequence_id - b.sequence_id);
  }

  /**
   * Retrieves all audit entries belonging to a specific company/tenant.
   */
  public async findByCompany(companyId: string): Promise<AuditLogEntity[]> {
    const results = await this.driver.findMany((entry) => entry.company_id === companyId);
    return results.sort((a, b) => a.sequence_id - b.sequence_id);
  }

  /**
   * Scans and verifies the cryptographic chain integrity of stored audit logs.
   * Asserts:
   * 1. Entry #1 starts from GENESIS_HASH.
   * 2. Every entry's current_hash matches SHA256(prev_hash + sequence_id + payload).
   * 3. For any subsequent entry N, entry[N].prev_hash === entry[N-1].current_hash.
   */
  public async verifyChainIntegrity(
    startSequence = 1,
    limit?: number
  ): Promise<AuditChainVerificationResult> {
    const all = await this.driver.findMany((entry) => entry.sequence_id >= startSequence);
    all.sort((a, b) => a.sequence_id - b.sequence_id);

    const entriesToVerify = limit ? all.slice(0, limit) : all;

    if (entriesToVerify.length === 0) {
      return { valid: true, verifiedCount: 0 };
    }

    for (let i = 0; i < entriesToVerify.length; i++) {
      const current = entriesToVerify[i]!;

      // 1. If this is sequence #1, verify prev_hash matches GENESIS_HASH
      if (current.sequence_id === 1 && current.prev_hash !== GENESIS_HASH) {
        return {
          valid: false,
          verifiedCount: i,
          brokenSequenceId: current.sequence_id,
          reason: `Genesis hash mismatch at sequence 1. Expected "${GENESIS_HASH}", got "${current.prev_hash}".`,
        };
      }

      // 2. If preceded by an entry in this batch, verify chaining link
      if (i > 0) {
        const prev = entriesToVerify[i - 1]!;
        if (current.prev_hash !== prev.current_hash) {
          return {
            valid: false,
            verifiedCount: i,
            brokenSequenceId: current.sequence_id,
            reason: `Broken hash chain between sequence ${prev.sequence_id} and ${current.sequence_id}. Current prev_hash does not match prior current_hash.`,
          };
        }
      }

      // 3. Verify entry self-hash integrity
      const isHashValid = verifyAuditHash({
        prev_hash: current.prev_hash,
        sequence_id: current.sequence_id,
        payload: current.payload,
        current_hash: current.current_hash,
      });

      if (!isHashValid) {
        return {
          valid: false,
          verifiedCount: i,
          brokenSequenceId: current.sequence_id,
          reason: `Hash corruption detected at sequence ${current.sequence_id}. Entry payload or hash was tampered with.`,
        };
      }
    }

    return {
      valid: true,
      verifiedCount: entriesToVerify.length,
    };
  }

  // ============================================================================
  // Immutability Enforcement: Override Mutation and Deletion Methods
  // ============================================================================

  public override async update(
    _id: string,
    _expectedVersion: number,
    _input: any
  ): Promise<never> {
    throw new Error('Audit logs are strictly append-only; update is forbidden.');
  }

  public override async softDelete(
    _id: string,
    _expectedVersion: number
  ): Promise<never> {
    throw new Error('Audit logs are strictly append-only; soft deletion is forbidden.');
  }

  public override async restore(
    _id: string,
    _expectedVersion: number
  ): Promise<never> {
    throw new Error('Audit logs are strictly append-only; restoration is forbidden.');
  }

  public override async hardDelete(
    _id: string,
    _expectedVersion?: number
  ): Promise<never> {
    throw new Error('Audit logs are strictly append-only; hard deletion is forbidden.');
  }

  protected validate(entity: AuditLogEntity): void {
    AuditLogEntitySchema.parse(entity);
  }
}
