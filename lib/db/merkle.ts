// path: lib/db/merkle.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import { generateUuidV7 } from './uuidv7';
import {
  AuditMerkleRootEntity,
  CreateAuditMerkleRootInput,
  AuditMerkleRootEntitySchema,
} from '../../types/audit';

/**
 * Enterprise Repository for Daily Audit Merkle Roots.
 * Tracks cryptographic roots grouping audit log batches by date.
 */
export class AuditMerkleRootRepository extends AbstractRepository<AuditMerkleRootEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<AuditMerkleRootEntity> | undefined;
  }) {
    super('AuditMerkleRoot', options);
  }

  /**
   * Records a daily batch Merkle root for external audit anchoring.
   */
  public async recordBatchRoot(
    input: CreateAuditMerkleRootInput
  ): Promise<AuditMerkleRootEntity> {
    const now = new Date().toISOString();
    const entity: AuditMerkleRootEntity = {
      id: input.id ?? generateUuidV7(),
      company_id:
        input.company_id ??
        this.defaultCompanyId ??
        '00000000-0000-0000-0000-000000000000',
      batch_date: input.batch_date,
      merkle_root: input.merkle_root.toLowerCase(),
      entry_count: input.entry_count,
      first_sequence_id: input.first_sequence_id,
      last_sequence_id: input.last_sequence_id,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      version: 1,
    };

    this.validate(entity);
    return this.driver.insert(entity);
  }

  /**
   * Retrieves the Merkle root record for a specific calendar date (YYYY-MM-DD).
   */
  public async findByDate(
    batchDate: string,
    companyId?: string
  ): Promise<AuditMerkleRootEntity | null> {
    const results = await this.driver.findMany((record) => {
      if (record.batch_date !== batchDate || record.deleted_at !== null) {
        return false;
      }
      if (companyId) {
        return record.company_id === companyId;
      }
      return true;
    });

    return results[0] ?? null;
  }

  /**
   * Retrieves the most recently anchored Merkle root record.
   */
  public async getLatestRoot(companyId?: string): Promise<AuditMerkleRootEntity | null> {
    const results = await this.driver.findMany((record) => {
      if (record.deleted_at !== null) return false;
      if (companyId) {
        return record.company_id === companyId;
      }
      return true;
    });

    if (results.length === 0) return null;
    results.sort((a, b) => b.batch_date.localeCompare(a.batch_date));
    return results[0]!;
  }

  protected validate(entity: AuditMerkleRootEntity): void {
    AuditMerkleRootEntitySchema.parse(entity);
  }
}
