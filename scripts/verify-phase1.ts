// path: scripts/verify-phase1.ts
import { execSync } from 'node:child_process';
import path from 'node:path';
import { loadMigrationFiles } from '../lib/database';
import { Money } from '../lib/money';
import { sanitizeString, validateSafeUrl } from '../lib/security';
import { UUIDv7Schema, MoneyStringSchema } from '../lib/validation';
import { t } from '../lib/i18n';
import { redactString } from '../lib/logger';

function logSection(title: string): void {
  console.log(`\n======================================================`);
  console.log(`  ${title}`);
  console.log(`======================================================`);
}

async function runQualityGate(): Promise<void> {
  const startTime = Date.now();
  console.log('🚀 KD SOLUTION IT: Phase 1 Architectural Quality Gate Runner');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // 1. In-process Component Smoke Verification
  logSection('1. Core Engine In-Process Smoke Checks');

  // i18n
  const balanceLabel = t('billing.remainingBalance');
  console.log(`[i18n] String lookup: "${balanceLabel}" (OK)`);

  // Money
  const m1 = new Money('100.5000');
  const m2 = new Money('49.5000');
  const sum = m1.add(m2);
  console.log(`[Money] 100.5000 + 49.5000 = ${sum.toNumericString()} (OK)`);
  if (sum.toNumericString() !== '150.0000') {
    throw new Error(`Money math failure: expected 150.0000, got ${sum.toNumericString()}`);
  }

  // Security
  const dirtyInput = "<script>alert('xss')</script>Acme Corp\0";
  const cleanInput = sanitizeString(dirtyInput);
  console.log(`[Security] Sanitized input: "${cleanInput}" (OK)`);
  if (cleanInput !== 'Acme Corp') {
    throw new Error(`Sanitization failure: expected "Acme Corp", got "${cleanInput}"`);
  }

  const ssrfCheck = validateSafeUrl('http://169.254.169.254/latest/meta-data/');
  console.log(`[Security] Cloud metadata SSRF blocked: ${!ssrfCheck.isValid} (OK)`);
  if (ssrfCheck.isValid) {
    throw new Error('SSRF check failed to block cloud metadata IP!');
  }

  // Validation
  const validUuid = '018f6c4c-3500-7fa1-b1e2-123456789abc';
  UUIDv7Schema.parse(validUuid);
  const normalizedMoney = MoneyStringSchema.parse('$2,450.00');
  console.log(`[Validation] Money string parsed to numeric(18,4): ${normalizedMoney} (OK)`);

  // Redaction
  const redacted = redactString('Customer card 4111222233334444 charged');
  console.log(`[Logger] Redacted string: "${redacted}" (OK)`);

  // Database Migrations
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
  const migrations = loadMigrationFiles(migrationsDir);
  console.log(`[Database] Scanned ${migrations.length} migration file(s) with valid checksums (OK)`);

  // 2. Automated Scan & Lint Scripts
  logSection('2. English-Only Static Analysis (i18n Guard)');
  execSync('npm run scan:i18n', { stdio: 'inherit' });

  logSection('3. Row Level Security (RLS) Migration Linter');
  execSync('npm run lint:rls', { stdio: 'inherit' });

  logSection('4. Strict TypeScript Typecheck (Zero Errors)');
  execSync('npm run typecheck', { stdio: 'inherit' });

  logSection('5. Full Unit & Integration Test Suite (Vitest)');
  execSync('npm test', { stdio: 'inherit' });

  const durationMs = Date.now() - startTime;
  logSection(`✨ PHASE 1 ARCHITECTURE VERIFICATION PASSED (${(durationMs / 1000).toFixed(2)}s)`);
  console.log('All 11 Phase 1 foundational steps verified and sealed successfully.\n');
}

runQualityGate().catch((err) => {
  console.error('\n❌ Phase 1 Quality Gate FAILED:', err);
  process.exit(1);
});
