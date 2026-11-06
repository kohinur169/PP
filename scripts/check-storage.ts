// path: scripts/check-storage.ts

import { scanStorageIntegrity, STORAGE_HEALTH_SCAN_CRON } from '../lib/storage/health';

/**
 * Step 045: Storage Integrity Scanner & Health Checker Utility
 * CLI tool running integrity verification on cloud object storage assets.
 * Usage:
 *   npm run storage:check
 *   tsx scripts/check-storage.ts [--company-id <uuid>] [--limit <n>] [--json]
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');

  let companyId: string | undefined;
  const companyIndex = args.indexOf('--company-id');
  if (companyIndex !== -1 && args[companyIndex + 1]) {
    companyId = args[companyIndex + 1];
  }

  let limit: number | undefined;
  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
KD SOLUTION IT: Object Storage Integrity Scanner
Usage:
  tsx scripts/check-storage.ts [options]

Options:
  --company-id <uuid>  Limit scan to a specific tenant company
  --limit <number>     Maximum files to inspect
  --json               Output machine-readable JSON report
  --help               Display this help text
`);
    process.exit(0);
  }

  if (!isJson) {
    console.log('===============================================================');
    console.log(' KD SOLUTION IT: Storage Integrity Scanner & Health Checker   ');
    console.log(' Step 045: Cloud Checksum Verification, Bit Rot & Missing Guard');
    console.log('===============================================================');
    console.log(`Scheduled Cron    : ${STORAGE_HEALTH_SCAN_CRON} (Weekly Sundays 02:00 UTC)`);
    console.log(`Timestamp         : ${new Date().toISOString()}`);
    if (companyId) console.log(`Company Filter    : ${companyId}`);
    console.log('---------------------------------------------------------------\n');
    console.log('Scanning file metadata records and cloud storage objects...');
  }

  try {
    const report = await scanStorageIntegrity({
      companyId,
      limit,
    });

    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.isHealthy ? 0 : 1);
    }

    console.log('\n--- SCAN RESULTS ---');
    console.log(`Scan ID           : ${report.scanId}`);
    console.log(`Duration          : ${report.durationMs}ms`);
    console.log(`Files Evaluated   : ${report.totalFilesScanned}`);
    console.log(`Checksum Verified : ${report.verifiedCount}`);
    console.log(`Missing Objects   : ${report.missingCount}`);
    console.log(`Hash Mismatches   : ${report.mismatchCount}`);
    console.log(`Crypto-Shredded   : ${report.shreddedCount}`);
    console.log(`Total Stored Vol  : ${report.totalStoredGigabytes} GB (${report.totalStoredBytes.toLocaleString()} bytes)`);
    console.log('---------------------------------------------------------------');

    if (report.isHealthy) {
      console.log('\n[✓ PASS] 100% OBJECT STORAGE INTEGRITY VERIFIED');
      console.log('         Zero missing objects and zero bit-rot checksum mismatches.');
      process.exit(0);
    } else {
      console.error('\n[✗ ALERT] OBJECT STORAGE INTEGRITY VIOLATIONS DETECTED:');
      for (const item of report.items) {
        if (item.status === 'MISSING_OBJECT') {
          console.error(`  - [MISSING] File "${item.fileId}" (${item.originalName}): ${item.error}`);
        } else if (item.status === 'HASH_MISMATCH') {
          console.error(`  - [BIT-ROT] File "${item.fileId}" (${item.originalName}): ${item.error}`);
        }
      }
      process.exit(1);
    }
  } catch (err: unknown) {
    console.error('\n[FATAL] Storage integrity scan encountered an unhandled error:');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// Direct execution guard
if (require.main === module || process.argv[1]?.endsWith('check-storage.ts')) {
  main();
}
