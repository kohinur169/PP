// path: lib/database/index.ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { MigrationFile, MigrationStatus, MigrationRecord } from './types';

export * from './types';
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
export * from '../../types/entity';
export * from '../../types/audit';

/**
 * Computes a SHA-256 hex checksum of SQL migration content.
 */
export function calculateSqlChecksum(sql: string): string {
  return crypto.createHash('sha256').update(sql.trim(), 'utf8').digest('hex');
}

/**
 * Parses standard timestamp-prefixed migration filename (e.g. 20261103000001_init_extensions.sql).
 */
export function parseMigrationFilename(filename: string): { version: string; name: string } | null {
  const match = filename.match(/^(\d{14})_(.+)\.sql$/);
  if (!match || !match[1] || !match[2]) return null;
  return {
    version: match[1],
    name: match[2],
  };
}

/**
 * Scans and loads SQL migration files from the specified migrations directory in ascending order.
 */
export function loadMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));

  const parsedMigrations: MigrationFile[] = [];

  for (const file of files) {
    const parsed = parseMigrationFilename(file);
    if (!parsed) continue;

    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const checksum = calculateSqlChecksum(sql);

    parsedMigrations.push({
      version: parsed.version,
      name: parsed.name,
      filepath: fullPath,
      sql,
      checksum,
    });
  }

  return parsedMigrations.sort((a, b) => a.version.localeCompare(b.version));
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
