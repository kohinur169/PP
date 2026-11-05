// path: scripts/verify-go-live.ts

import { executeFullGoLiveAudit } from '../lib/release/go-live-gates';

function runGoLiveVerification(): void {
  console.log('================================================================');
  console.log('  KD SOLUTION IT: SECTION 33 PRODUCTION GO-LIVE GATES AUDIT');
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log('================================================================\n');

  const report = executeFullGoLiveAudit();

  for (const gate of report.gates) {
    const symbol = gate.passed ? '✓ [PASS]' : '✗ [FAIL]';
    console.log(`${symbol} ${gate.gateId}: ${gate.name}`);
    console.log(`    Details: ${gate.details}\n`);
  }

  console.log('----------------------------------------------------------------');
  console.log(`Summary: ${report.passedGates}/${report.totalGates} Gates Passed`);
  console.log(`Launch Ready: ${report.isLaunchReady ? 'YES - APPROVED FOR PRODUCTION' : 'NO - BLOCKING GATES PENDING'}`);
  console.log('----------------------------------------------------------------\n');

  if (!report.isLaunchReady) {
    console.error('Launch Gates Failed: Cannot deploy to production until all gates pass.');
    process.exit(1);
  }

  console.log('All Section 33 Go-Live gates satisfied. Production deployment cleared.');
}

runGoLiveVerification();
