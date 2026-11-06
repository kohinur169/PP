// path: lib/database/types.ts

export interface MigrationFile {
  version: string;
  name: string;
  filepath: string;
  sql: string;
  checksum: string;
  direction?: 'up' | 'down' | undefined;
  downFilepath?: string | undefined;
  downSql?: string | undefined;
}

export interface MigrationRecord {
  version: string;
  name: string;
  applied_at: string;
  checksum: string;
  execution_time_ms?: number | undefined;
}

export interface MigrationStatus {
  appliedCount: number;
  pendingCount: number;
  applied: MigrationRecord[];
  pending: MigrationFile[];
}

export interface MigrationRunnerOptions {
  migrationsDir: string;
  executor?: ((sql: string, version: string, direction: 'up' | 'down') => Promise<void>) | undefined;
  appliedRecords?: MigrationRecord[] | undefined;
  dryRun?: boolean | undefined;
  mode?: 'up' | 'down' | 'status' | 'test-cycle' | undefined;
  steps?: number | undefined;
}

export interface MigrationExecutionResult {
  version: string;
  name: string;
  direction: 'up' | 'down';
  executionTimeMs: number;
  execution_time_ms: number;
  checksum?: string | undefined;
  success: boolean;
  error?: string | undefined;
}

export interface MigrationCycleResult {
  passed: boolean;
  success: boolean;
  forwardApplied: number;
  rollbackReverted: number;
  upCount: number;
  downCount: number;
  forwardExecutionTimeMs: number;
  rollbackExecutionTimeMs: number;
  orphanedObjectsCount: number;
  cleanlinessVerified: boolean;
  errors: string[];
  error?: string | undefined;
  details?: {
    forward: MigrationExecutionResult[];
    rollback: MigrationExecutionResult[];
  } | undefined;
  results: MigrationExecutionResult[];
}
