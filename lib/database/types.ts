// path: lib/database/types.ts

export interface MigrationFile {
  version: string;
  name: string;
  filepath: string;
  sql: string;
  checksum: string;
}

export interface MigrationRecord {
  version: string;
  name: string;
  applied_at: string;
  checksum: string;
}

export interface MigrationStatus {
  appliedCount: number;
  pendingCount: number;
  applied: MigrationRecord[];
  pending: MigrationFile[];
}

export interface MigrationRunnerOptions {
  migrationsDir?: string | undefined;
  dryRun?: boolean | undefined;
}
