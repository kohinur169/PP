// path: scripts/lint-rls.ts

import fs from 'node:fs';
import path from 'node:path';

/**
 * Details of RLS posture for a specific database table.
 */
export interface TableRlsDetail {
  readonly tableName: string;
  readonly definedInFile: string;
  readonly rlsEnabled: boolean;
  readonly rlsForced: boolean;
}

/**
 * Comprehensive result of an RLS migration linting run.
 */
export interface RlsLintResult {
  readonly passed: boolean;
  readonly totalTables: number;
  readonly tablesChecked: string[];
  readonly unshieldedTables: string[];
  readonly unforcedTables: string[];
  readonly details: TableRlsDetail[];
}

/**
 * System and internal infrastructure tables exempt from tenant RLS isolation.
 */
const EXEMPT_TABLES = new Set(['_schema_migrations']);

/**
 * Regex matching standard PostgreSQL table creation statements.
 * Captures optional IF NOT EXISTS and optional public. schema qualification.
 */
const CREATE_TABLE_REGEX =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(/gi;

/**
 * Scans a directory of SQL migrations and verifies that every created table
 * explicitly enables and forces Row Level Security (RLS).
 *
 * @param migrationsDirs - Array of directories containing SQL migration files.
 * @returns RlsLintResult summarizing RLS compliance.
 */
export function lintMigrationsForRls(migrationsDirs: string[]): RlsLintResult {
  const allSqlFiles: { filepath: string; content: string; filename: string }[] = [];

  for (const dir of migrationsDirs) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
    for (const file of files) {
      const fullPath = path.join(dir, file);
      allSqlFiles.push({
        filepath: fullPath,
        filename: file,
        content: fs.readFileSync(fullPath, 'utf8'),
      });
    }
  }

  // Combine all SQL migration content to allow multi-file DDL setups
  const combinedSql = allSqlFiles.map((f) => f.content).join('\n');

  // Discover all tables created across migrations
  const createdTablesMap = new Map<string, string>();

  for (const sqlFile of allSqlFiles) {
    let match: RegExpExecArray | null;
    CREATE_TABLE_REGEX.lastIndex = 0;

    while ((match = CREATE_TABLE_REGEX.exec(sqlFile.content)) !== null) {
      const tableName = match[1]!.toLowerCase();
      if (!EXEMPT_TABLES.has(tableName) && !createdTablesMap.has(tableName)) {
        createdTablesMap.set(tableName, sqlFile.filename);
      }
    }
  }

  const details: TableRlsDetail[] = [];
  const unshieldedTables: string[] = [];
  const unforcedTables: string[] = [];

  for (const [tableName, definedInFile] of createdTablesMap.entries()) {
    // Check for ENABLE ROW LEVEL SECURITY
    const enablePattern = new RegExp(
      `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${tableName}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'i'
    );
    // Also check for dynamic batch loops or enable_and_force_rls helper
    const loopOrHelperEnable =
      combinedSql.includes('ENABLE ROW LEVEL SECURITY') &&
      (combinedSql.includes('enable_and_force_rls') || combinedSql.includes('FOR tbl IN'));

    const rlsEnabled = enablePattern.test(combinedSql) || loopOrHelperEnable;

    // Check for FORCE ROW LEVEL SECURITY
    const forcePattern = new RegExp(
      `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${tableName}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'i'
    );
    const loopOrHelperForce =
      combinedSql.includes('FORCE ROW LEVEL SECURITY') &&
      (combinedSql.includes('enable_and_force_rls') || combinedSql.includes('FOR tbl IN'));

    const rlsForced = forcePattern.test(combinedSql) || loopOrHelperForce;

    if (!rlsEnabled) {
      unshieldedTables.push(tableName);
    }
    if (!rlsForced) {
      unforcedTables.push(tableName);
    }

    details.push({
      tableName,
      definedInFile,
      rlsEnabled,
      rlsForced,
    });
  }

  const passed = unshieldedTables.length === 0;

  return {
    passed,
    totalTables: createdTablesMap.size,
    tablesChecked: Array.from(createdTablesMap.keys()),
    unshieldedTables,
    unforcedTables,
    details,
  };
}

/**
 * CLI Entrypoint
 */
export function runRlsLinter(): void {
  const defaultDirs = [
    path.resolve(process.cwd(), 'supabase/migrations'),
    path.resolve(process.cwd(), 'db/migrations'),
  ];

  console.log('=== KD SOLUTION IT: Row Level Security (RLS) Migration Linter ===');
  console.log(`Inspecting migrations in: ${defaultDirs.join(', ')}`);

  const result = lintMigrationsForRls(defaultDirs);

  console.log(`\nDiscovered ${result.totalTables} table(s) requiring RLS enforcement:\n`);

  for (const detail of result.details) {
    const status = detail.rlsEnabled && detail.rlsForced ? '✓ PASS' : '✗ FAIL';
    console.log(
      ` [${status}] Table: ${detail.tableName.padEnd(22)} (from ${detail.definedInFile}) - RLS: ${
        detail.rlsEnabled ? 'ENABLED' : 'MISSING'
      }, FORCE: ${detail.rlsForced ? 'FORCED' : 'NOT FORCED'}`
    );
  }

  if (!result.passed) {
    console.error(
      `\n[RLS LINTER ERROR] ${result.unshieldedTables.length} table(s) do not have Row Level Security enabled!`
    );
    console.error(`Unshielded tables: ${result.unshieldedTables.join(', ')}`);
    process.exit(1);
  }

  console.log('\n[RLS Linter] Clean! 100% of discovered database tables enforce Row Level Security.');
}

// Execute CLI when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runRlsLinter();
}
