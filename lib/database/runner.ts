// path: lib/database/runner.ts
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateSqlChecksum,
  loadMigrationFiles,
  loadRollbackFiles,
  computeMigrationDiff,
} from './index';
import type {
  MigrationFile,
  MigrationRecord,
  MigrationStatus,
  MigrationExecutionResult,
  MigrationCycleResult,
  MigrationRunnerOptions,
} from './types';

/**
 * Validates that all migrations in migrationsDir have matching rollback (.down.sql) scripts.
 */
export function validateRollbackCompleteness(migrationsDir: string): {
  valid: boolean;
  total: number;
  missingDown: string[];
} {
  const migrations = loadMigrationFiles(migrationsDir);
  const missingDown: string[] = [];

  for (const m of migrations) {
    if (!m.downSql || !m.downFilepath) {
      missingDown.push(`${m.version}_${m.name}`);
    }
  }

  return {
    valid: missingDown.length === 0,
    total: migrations.length,
    missingDown,
  };
}

/**
 * Extracts table and function names created in UP scripts and ensures they are dropped in DOWN scripts.
 */
export function inspectSchemaTeardownCompleteness(migrationsDir: string): {
  clean: boolean;
  createdTables: string[];
  droppedTables: string[];
  orphanedTables: string[];
} {
  const migrations = loadMigrationFiles(migrationsDir);
  const createdTablesSet = new Set<string>();
  const droppedTablesSet = new Set<string>();

  for (const m of migrations) {
    // Look for CREATE TABLE [IF NOT EXISTS] [public.]table_name
    const createMatches = m.sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi);
    for (const match of createMatches) {
      if (match[1]) {
        createdTablesSet.add(match[1].toLowerCase());
      }
    }

    if (m.downSql) {
      // Look for DROP TABLE [IF EXISTS] [public.]table_name
      const dropMatches = m.downSql.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi);
      for (const match of dropMatches) {
        if (match[1]) {
          droppedTablesSet.add(match[1].toLowerCase());
        }
      }
    }
  }

  const orphanedTables: string[] = [];
  for (const table of createdTablesSet) {
    if (!droppedTablesSet.has(table)) {
      orphanedTables.push(table);
    }
  }

  return {
    clean: orphanedTables.length === 0,
    createdTables: Array.from(createdTablesSet).sort(),
    droppedTables: Array.from(droppedTablesSet).sort(),
    orphanedTables: orphanedTables.sort(),
  };
}

/**
 * Runs pending forward migrations in ascending order.
 */
export async function runForwardMigrations(
  options: MigrationRunnerOptions
): Promise<{
  results: MigrationExecutionResult[];
  newAppliedRecords: MigrationRecord[];
}> {
  const migrations = loadMigrationFiles(options.migrationsDir);
  const appliedRecords = options.appliedRecords ?? [];
  const diff = computeMigrationDiff(migrations, appliedRecords);

  const pending = options.steps !== undefined ? diff.pending.slice(0, options.steps) : diff.pending;
  const results: MigrationExecutionResult[] = [];
  const newAppliedRecords = [...appliedRecords];

  for (const migration of pending) {
    const startTime = Date.now();
    try {
      if (!options.dryRun && options.executor) {
        await options.executor(migration.sql, migration.version, 'up');
      }
      const executionTime = Date.now() - startTime;
      const result: MigrationExecutionResult = {
        version: migration.version,
        name: migration.name,
        direction: 'up',
        executionTimeMs: executionTime,
        execution_time_ms: executionTime,
        checksum: migration.checksum,
        success: true,
      };
      results.push(result);

      newAppliedRecords.push({
        version: migration.version,
        name: migration.name,
        applied_at: new Date().toISOString(),
        checksum: migration.checksum,
        execution_time_ms: executionTime,
      });
    } catch (err: unknown) {
      const executionTime = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        version: migration.version,
        name: migration.name,
        direction: 'up',
        executionTimeMs: executionTime,
        execution_time_ms: executionTime,
        checksum: migration.checksum,
        success: false,
        error: errorMsg,
      });
      throw new Error(`Migration ${migration.version}_${migration.name} failed: ${errorMsg}`);
    }
  }

  return { results, newAppliedRecords };
}

/**
 * Runs rollback migrations in descending order.
 */
export async function runRollbackMigrations(
  options: MigrationRunnerOptions
): Promise<{
  results: MigrationExecutionResult[];
  remainingAppliedRecords: MigrationRecord[];
}> {
  const migrations = loadMigrationFiles(options.migrationsDir);
  const appliedRecords = [...(options.appliedRecords ?? [])];

  if (appliedRecords.length === 0) {
    return { results: [], remainingAppliedRecords: [] };
  }

  // Determine how many steps to rollback
  const stepsToRollback = options.steps !== undefined ? options.steps : 1;
  const migrationsToRollback = appliedRecords.slice(-stepsToRollback).reverse();

  const migrationMap = new Map<string, MigrationFile>();
  for (const m of migrations) {
    migrationMap.set(m.version, m);
  }

  const results: MigrationExecutionResult[] = [];
  const rolledBackVersions = new Set<string>();

  for (const record of migrationsToRollback) {
    const file = migrationMap.get(record.version);
    if (!file || !file.downSql) {
      throw new Error(
        `Cannot rollback migration ${record.version}_${record.name}: no matching .down.sql script found.`
      );
    }

    const startTime = Date.now();
    try {
      if (!options.dryRun && options.executor) {
        await options.executor(file.downSql, record.version, 'down');
      }
      const executionTime = Date.now() - startTime;
      const downChecksum = calculateSqlChecksum(file.downSql);

      results.push({
        version: record.version,
        name: record.name,
        direction: 'down',
        executionTimeMs: executionTime,
        execution_time_ms: executionTime,
        checksum: downChecksum,
        success: true,
      });
      rolledBackVersions.add(record.version);
    } catch (err: unknown) {
      const executionTime = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        version: record.version,
        name: record.name,
        direction: 'down',
        executionTimeMs: executionTime,
        execution_time_ms: executionTime,
        checksum: 'unknown',
        success: false,
        error: errorMsg,
      });
      throw new Error(`Rollback ${record.version}_${record.name} failed: ${errorMsg}`);
    }
  }

  const remainingAppliedRecords = appliedRecords.filter((r) => !rolledBackVersions.has(r.version));
  return { results, remainingAppliedRecords };
}

/**
 * Performs a complete migration cycle:
 * 1. Checks that every migration has a down migration.
 * 2. Runs forward migrations (UP) for all pending migrations.
 * 3. Runs rollback migrations (DOWN) for all applied migrations in reverse.
 * 4. Validates zero orphaned objects and reports total forward and rollback time.
 */
export async function executeMigrationCycle(
  options: MigrationRunnerOptions
): Promise<MigrationCycleResult> {
  const completeness = validateRollbackCompleteness(options.migrationsDir);
  if (!completeness.valid) {
    return {
      passed: false,
      success: false,
      forwardApplied: 0,
      rollbackReverted: 0,
      upCount: 0,
      downCount: 0,
      forwardExecutionTimeMs: 0,
      rollbackExecutionTimeMs: 0,
      orphanedObjectsCount: completeness.missingDown.length,
      cleanlinessVerified: false,
      errors: [
        `Missing .down.sql rollback script for: ${completeness.missingDown.join(', ')}`,
      ],
      error: `Missing .down.sql rollback script for: ${completeness.missingDown.join(', ')}`,
      details: { forward: [], rollback: [] },
      results: [],
    };
  }

  const teardownCheck = inspectSchemaTeardownCompleteness(options.migrationsDir);
  const errors: string[] = [];
  if (!teardownCheck.clean) {
    errors.push(
      `Teardown incomplete: The following tables are created in UP scripts but missing from DOWN scripts: ${teardownCheck.orphanedTables.join(', ')}`
    );
  }

  let currentApplied = options.appliedRecords ?? [];

  // 1. Forward run
  const forwardRun = await runForwardMigrations({
    ...options,
    appliedRecords: currentApplied,
  });
  currentApplied = forwardRun.newAppliedRecords;

  const totalForwardTime = forwardRun.results.reduce((acc, r) => acc + r.execution_time_ms, 0);

  // 2. Rollback run
  const rollbackRun = await runRollbackMigrations({
    ...options,
    appliedRecords: currentApplied,
    steps: forwardRun.results.length,
  });

  const totalRollbackTime = rollbackRun.results.reduce((acc, r) => acc + r.execution_time_ms, 0);

  const passed =
    errors.length === 0 &&
    rollbackRun.remainingAppliedRecords.length === (options.appliedRecords?.length ?? 0);

  const allResults = [...forwardRun.results, ...rollbackRun.results];

  return {
    passed,
    success: passed,
    forwardApplied: forwardRun.results.length,
    rollbackReverted: rollbackRun.results.length,
    upCount: forwardRun.results.length,
    downCount: rollbackRun.results.length,
    forwardExecutionTimeMs: totalForwardTime,
    rollbackExecutionTimeMs: totalRollbackTime,
    orphanedObjectsCount: teardownCheck.orphanedTables.length,
    cleanlinessVerified: teardownCheck.clean,
    errors,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    details: {
      forward: forwardRun.results,
      rollback: rollbackRun.results,
    },
    results: allResults,
  };
}
