// path: types/backup-codes.ts

import type { BaseEntity } from './entity';

/**
 * Persisted single-use backup recovery code record.
 * Stores cryptographically secure hash of 8-character alphanumeric recovery codes.
 */
export interface UserBackupCodeEntity extends BaseEntity {
  user_id: string;
  code_hash: string;
  used_at: string | null;
}

/**
 * Input payload for inserting a hashed backup recovery code.
 */
export interface CreateBackupCodeInput {
  user_id: string;
  code_hash: string;
  used_at?: string | null | undefined;
  company_id?: string | undefined;
}

/**
 * Result returned upon generating or regenerating backup codes.
 */
export interface BackupCodeGenerationResult {
  readonly plainCodes: string[];
  readonly count: number;
  readonly generatedAt: string;
}

/**
 * Result returned upon attempting to consume a single-use backup code.
 */
export interface BackupCodeConsumptionResult {
  readonly valid: boolean;
  readonly codeId?: string | undefined;
  readonly remainingCount?: number | undefined;
  readonly error?: string | undefined;
}
