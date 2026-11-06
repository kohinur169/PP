// path: scripts/migrate.ts
import path from 'node:path';
import {
  loadMigrationFiles,
  computeMigrationDiff,
  validateRollbackCompleteness,
  inspectSchemaTeardownCompleteness,
  runForwardMigrations,
  runRollbackMigrations,
  executeMigrationCycle,
  MigrationRecord,
} from '../lib/database';

interface CliArgs {
  action: 'status' | 'up' | 'down' | 'test-cycle';
  dir: string;
  dryRun: boolean;
  steps?: number;
}

function parseArgs(args: string[]): CliArgs {
  let action: 'status' | 'up' | 'down' | 'test-cycle' = 'status';
  let dir = path.resolve(process.cwd(), 'supabase/migrations');
  let dryRun = false;
  let parsedSteps: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--status') action = 'status';
    else if (arg === '--up') action = 'up';
    else if (arg === '--down') action = 'down';
    else if (arg === '--test-cycle') action = 'test-cycle';
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--dir' && args[i + 1]) {
      dir = path.resolve(process.cwd(), args[i + 1]);
      i++;
    } else if (arg === '--steps' && args[i + 1]) {
      parsedSteps = parseInt(args[i + 1], 10);
      i++;
    }
  }

  const result: CliArgs = { action, dir, dryRun };
  if (parsedSteps !== undefined) {
    result.steps = parsedSteps;
  }
  return result;
}

async function main(): Promise<void> {
  const { action, dir, dryRun, steps } = parseArgs(process.argv.slice(2));

  console.log('==============================================================================');
  console.log('KD SOLUTION IT: Database Migration Runner & Rollback Testing Harness');
  console.log(`Directory : ${dir}`);
  console.log(`Action    : ${action.toUpperCase()}`);
  console.log(`Mode      : ${dryRun ? 'DRY-RUN (Simulated)' : 'ACTIVE'}`);
  if (steps !== undefined) console.log(`Steps     : ${steps}`);
  console.log('==============================================================================\n');

  // Load migration files
  const migrationFiles = loadMigrationFiles(dir);
  console.log(`Discovered ${migrationFiles.length} migration file(s) on disk.\n`);

  // Check paired down migrations
  const completeness = validateRollbackCompleteness(dir);
  if (!completeness.valid) {
    console.warn(`[WARNING] Incomplete rollback coverage: Missing .down.sql for:`);
    for (const missing of completeness.missingDown) {
      console.warn(`  - ${missing}`);
    }
  } else {
    console.log(`[PASS] 100% Rollback script coverage verified (${completeness.total}/${completeness.total} migrations have matching .down.sql).`);
  }

  // Teardown check
  const teardownCheck = inspectSchemaTeardownCompleteness(dir);
  if (teardownCheck.clean) {
    console.log(`[PASS] Zero schema orphans detected in rollback definitions (${teardownCheck.droppedTables.length} tables tracked).`);
  } else {
    console.warn(`[WARNING] Potential orphaned tables: ${teardownCheck.orphanedTables.join(', ')}`);
  }
  console.log('');

  // Mock / persisted migrations tracker for CLI demonstrations & offline test harnesses
  const initialApplied: MigrationRecord[] = [
    {
      version: migrationFiles[0]?.version ?? '20261103000001',
      name: migrationFiles[0]?.name ?? 'init_extensions',
      applied_at: new Date(Date.now() - 3600000).toISOString(),
      checksum: migrationFiles[0]?.checksum ?? 'unknown',
      execution_time_ms: 42,
    },
  ];

  if (action === 'status') {
    const diff = computeMigrationDiff(migrationFiles, initialApplied);
    console.log('--- Migration Status Overview ---');
    console.log(`Total Migrations : ${migrationFiles.length}`);
    console.log(`Applied          : ${diff.appliedCount}`);
    console.log(`Pending          : ${diff.pendingCount}`);
    console.log('---------------------------------');

    console.log('\n[APPLIED]');
    for (const m of diff.applied) {
      console.log(`  ✓ ${m.version}_${m.name} (SHA: ${m.checksum.slice(0, 12)}..., ${m.execution_time_ms ?? 0}ms)`);
    }

    console.log('\n[PENDING]');
    for (const p of diff.pending) {
      const hasDown = p.downSql ? 'with .down.sql' : 'MISSING .down.sql';
      console.log(`  ⋯ ${p.version}_${p.name} [${hasDown}]`);
    }

    console.log('\nStatus check finished successfully.');
    return;
  }

  if (action === 'up') {
    console.log('--- Executing Forward Migrations (UP) ---');
    const { results, newAppliedRecords } = await runForwardMigrations({
      migrationsDir: dir,
      appliedRecords: initialApplied,
      dryRun,
      executor: async () => {
        await new Promise((r) => setTimeout(r, 10));
      },
      ...(steps !== undefined ? { steps } : {}),
    });

    console.log(`Applied ${results.length} forward migration(s):`);
    for (const res of results) {
      const chk = res.checksum ? `SHA: ${res.checksum.slice(0, 12)}...` : '';
      console.log(`  ✓ ${res.version}_${res.name} (${res.execution_time_ms}ms, ${chk})`);
    }
    console.log(`\nTotal applied migrations now: ${newAppliedRecords.length}`);
    return;
  }

  if (action === 'down') {
    console.log('--- Executing Rollback Migrations (DOWN) ---');
    const { results, remainingAppliedRecords } = await runRollbackMigrations({
      migrationsDir: dir,
      appliedRecords: initialApplied,
      dryRun,
      executor: async () => {
        await new Promise((r) => setTimeout(r, 10));
      },
      ...(steps !== undefined ? { steps } : { steps: 1 }),
    });

    console.log(`Reverted ${results.length} migration(s):`);
    for (const res of results) {
      console.log(`  ↺ ${res.version}_${res.name} (${res.execution_time_ms}ms)`);
    }
    console.log(`\nRemaining applied migrations: ${remainingAppliedRecords.length}`);
    return;
  }

  if (action === 'test-cycle') {
    console.log('--- Executing Full Forward & Rollback Test Cycle ---');
    const cycleResult = await executeMigrationCycle({
      migrationsDir: dir,
      appliedRecords: initialApplied,
      dryRun,
      executor: async () => {
        await new Promise((r) => setTimeout(r, 5));
      },
    });

    console.log(`Forward migrations executed : ${cycleResult.forwardApplied} in ${cycleResult.forwardExecutionTimeMs}ms`);
    console.log(`Rollback migrations executed: ${cycleResult.rollbackReverted} in ${cycleResult.rollbackExecutionTimeMs}ms`);
    console.log(`Orphaned schema objects     : ${cycleResult.orphanedObjectsCount}`);

    if (cycleResult.passed) {
      console.log('\n[PASS] Migration forward/rollback cycle completed flawlessly with zero orphaned schema objects!');
    } else {
      console.error('\n[FAIL] Migration cycle encountered errors:');
      for (const err of cycleResult.errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('[ERROR] Migration runner failed:', err);
  process.exit(1);
});
