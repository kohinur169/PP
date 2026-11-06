// path: lib/database/index.ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { MigrationFile, MigrationStatus, MigrationRecord } from './types';

export * from './types';
export * from './runner';
export * from './tenant-types';
export * from './tenant-context';
export * from './client';
export * from './health';
export * from './uuidv7';
export * from './repository';
export * from './tenant';
export * from './companies';
export * from './users';
export * from './memberships';
export * from './audit';
export * from './merkle';
export * from './files';
export * from './email-verify';
export * from '../../types/entity';
export * from '../../types/audit';
export * from '../../types/file';
export * from '../../types/email-verify';

/**
 * Computes a SHA-256 hex checksum of SQL migration content.
 */
export function calculateSqlChecksum(sql: string): string {
  return crypto.createHash('sha256').update(sql.trim(), 'utf8').digest('hex');
}

/**
 * Parses standard migration filename (e.g. 20261103000001_init_extensions.sql or 002_uuidv7_function.down.sql).
 */
export function parseMigrationFilename(filename: string): {
  version: string;
  name: string;
  direction: 'up' | 'down';
} | null {
  const match = filename.match(/^(\d{14}|\d{3})_([a-zA-Z0-9_]+?)(?:\.(up|down))?\.sql$/);
  if (!match || !match[1] || !match[2]) return null;
  return {
    version: match[1],
    name: match[2],
    direction: (match[3] as 'up' | 'down') ?? 'up',
  };
}

/**
 * Scans and loads SQL migration files from the specified migrations directory in ascending order.
 * Pairs every forward migration with its matching rollback migration (.down.sql) if available.
 */
export function loadMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));

  const upMigrationsMap = new Map<string, MigrationFile>();
  const downMigrationsMap = new Map<string, { filepath: string; sql: string }>();

  for (const file of files) {
    const parsed = parseMigrationFilename(file);
    if (!parsed) continue;

    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const checksum = calculateSqlChecksum(sql);

    if (parsed.direction === 'down') {
      downMigrationsMap.set(parsed.version, { filepath: fullPath, sql });
    } else {
      upMigrationsMap.set(parsed.version, {
        version: parsed.version,
        name: parsed.name,
        filepath: fullPath,
        sql,
        checksum,
        direction: 'up',
      });
    }
  }

  // Pair up migrations with down migrations
  const parsedMigrations: MigrationFile[] = [];

  for (const [version, upMigration] of upMigrationsMap.entries()) {
    const down = downMigrationsMap.get(version);
    parsedMigrations.push({
      ...upMigration,
      downFilepath: down?.filepath,
      downSql: down?.sql,
    });
  }

  return parsedMigrations.sort((a, b) => a.version.localeCompare(b.version));
}

/**
 * Scans and loads rollback migration files (.down.sql) in descending order for rollback execution.
 */
export function loadRollbackFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.down.sql'));

  const rollbackMigrations: MigrationFile[] = [];

  for (const file of files) {
    const parsed = parseMigrationFilename(file);
    if (!parsed || parsed.direction !== 'down') continue;

    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const checksum = calculateSqlChecksum(sql);

    rollbackMigrations.push({
      version: parsed.version,
      name: parsed.name,
      filepath: fullPath,
      sql,
      checksum,
      direction: 'down',
    });
  }

  return rollbackMigrations.sort((a, b) => b.version.localeCompare(a.version));
}

/**
 * Calculates diff between available migration files and already applied database records.
 */
export function computeMigrationDiff(
  available: MigrationFile[],
  applied: MigrationRecord[]
): MigrationStatus {
  const appliedVersions = new Set(applied.map((m) => m.version));
  const pending = available.filter((m) => !appliedVersions.has(m.version));

  return {
    appliedCount: applied.length,
    pendingCount: pending.length,
    applied,
    pending,
  };
}
