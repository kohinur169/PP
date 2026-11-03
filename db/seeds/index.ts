// path: db/seeds/index.ts

import { seedCountries, CountrySeedResult } from './countries';
import {
  seedSuperAdmin,
  SuperAdminSeedResult,
  SeedDependencies,
} from './super-admin';

export * from './countries';
export * from './super-admin';

export interface SeedOptions {
  readonly silent?: boolean | undefined;
  readonly deps?: SeedDependencies | undefined;
}

export interface SeedRunResult {
  readonly success: boolean;
  readonly durationMs: number;
  readonly countries: CountrySeedResult;
  readonly superAdmin: SuperAdminSeedResult;
  readonly timestamp: string;
}

/**
 * Orchestrates complete database seed execution in proper foreign key order:
 * 1. ISO 3166-1 country catalog & sanctions policy verification
 * 2. Root system company provisioning (KD Solution IT Platform HQ)
 * 3. Initial super_admin account creation with secure credentials
 * 4. Super_admin membership and role assignment
 * 5. Cryptographic hash-chained audit logging
 */
export async function runSeeds(options?: SeedOptions): Promise<SeedRunResult> {
  const startTime = Date.now();
  const silent = options?.silent ?? false;

  if (!silent) {
    console.log('==============================================================================');
    console.log('KD SOLUTION IT: Database Seed Engine & Super Admin Provisioning');
    console.log(`Timestamp : ${new Date().toISOString()}`);
    console.log('==============================================================================\n');
  }

  // 1. Seed and validate country catalog
  if (!silent) console.log('1. Seeding ISO 3166-1 Country Controls & Sanctions Catalog...');
  const countriesResult = await seedCountries();
  if (!silent) {
    console.log(
      `   ✓ Verified ${countriesResult.totalCountries} countries: ` +
        `${countriesResult.enabledCount} enabled, ` +
        `${countriesResult.disabledCount} disabled, ` +
        `${countriesResult.sanctionedCount} permanently sanctioned.\n`
    );
  }

  // 2. Seed Super Admin, System Company, and Audit Trail
  if (!silent) console.log('2. Provisioning System Company & Super Admin Credentials...');
  const superAdminResult = await seedSuperAdmin(options?.deps);
  if (!silent) {
    console.log(`   ✓ System Company   : ${superAdminResult.company.legal_name} (${superAdminResult.company.id})`);
    console.log(`   ✓ Super Admin User : ${superAdminResult.user.email} (${superAdminResult.user.id})`);
    console.log(`   ✓ Role Assigned    : ${superAdminResult.member.role}`);
    console.log(
      `   ✓ Audit Entry Log  : Sequence #${superAdminResult.auditLog.sequence_id} ` +
        `(Hash: ${superAdminResult.auditLog.current_hash.slice(0, 16)}...)\n`
    );
  }

  const durationMs = Date.now() - startTime;
  if (!silent) {
    console.log(`[PASS] Database seeding completed successfully in ${durationMs}ms.`);
    console.log('==============================================================================\n');
  }

  return {
    success: true,
    durationMs,
    countries: countriesResult,
    superAdmin: superAdminResult,
    timestamp: new Date().toISOString(),
  };
}

// Execute directly if run as main script via CLI
if (
  process.argv[1] &&
  (process.argv[1].endsWith('seeds/index.ts') || process.argv[1].endsWith('seeds/index.js'))
) {
  runSeeds()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[ERROR] Database seed execution failed:', err);
      process.exit(1);
    });
}
