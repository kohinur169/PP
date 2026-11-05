// path: tests/compliance/rescreening-worker.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  runDailySanctionsRescreeningJob,
  seedScreenableEntity,
  seedSanctionsBlocklistName,
  getComplianceAlerts,
  resetRescreeningStore,
} from '@/lib/compliance/rescreening-worker';

describe('Sanctions/PEP Daily Rescreening Worker & Stale Feed Alert Engine (Step 161)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyA = '22222222-2222-4222-8222-222222222222';
  const companyB = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    resetRescreeningStore();
  });

  describe('Daily Rescreening & Instant Payout Freeze Invariant (Step 161.1)', () => {
    it('detects sanctions match, stops payouts immediately, and raises critical alert', async () => {
      // 1. Seed clean owner
      seedScreenableEntity({
        id: 'owner_clean_001',
        tenantId,
        companyId: companyA,
        entityType: 'beneficial_owner',
        fullName: 'David Robinson',
        payoutsBlocked: false,
      });

      // 2. Seed owner who appears on new sanctions list
      seedScreenableEntity({
        id: 'owner_sanctioned_002',
        tenantId,
        companyId: companyB,
        entityType: 'beneficial_owner',
        fullName: 'Sergei Malenkov',
        payoutsBlocked: false,
      });

      // Add to updated OFAC list
      seedSanctionsBlocklistName('Sergei Malenkov');

      const summary = await runDailySanctionsRescreeningJob({
        tenantId,
        runDate: '2026-11-05',
        lastFeedUpdatedAtIso: '2026-11-05T02:00:00Z', // Fresh feed (within 24h)
        nowIso: '2026-11-05T12:00:00Z',
      });

      expect(summary.totalEntitiesScreened).toBe(2);
      expect(summary.matchesDetected).toBe(1);
      expect(summary.payoutsFrozenCount).toBe(1);
      expect(summary.isFeedStale).toBe(false);

      // Verify compliance alerts created
      const alerts = getComplianceAlerts(tenantId);
      const hitAlert = alerts.find((a) => a.alertType === 'sanctions_hit');

      expect(hitAlert).toBeDefined();
      expect(hitAlert?.severity).toBe('critical');
      expect(hitAlert?.title).toContain('Sergei Malenkov');
      expect((hitAlert?.details as Record<string, unknown>).payoutsFrozen).toBe(true);
    });
  });

  describe('Stale Feed Detection Invariant (Step 161.2)', () => {
    it('detects feeds exceeding 24h since last ingestion and emits critical alert', async () => {
      // Feed last updated 30 hours ago (> 24h stale threshold)
      const staleFeedTimestamp = '2026-11-04T06:00:00Z';
      const nowTimestamp = '2026-11-05T12:00:00Z';

      const summary = await runDailySanctionsRescreeningJob({
        tenantId,
        runDate: '2026-11-05',
        lastFeedUpdatedAtIso: staleFeedTimestamp,
        nowIso: nowTimestamp,
      });

      expect(summary.isFeedStale).toBe(true);

      const alerts = getComplianceAlerts(tenantId);
      const staleAlert = alerts.find((a) => a.alertType === 'stale_feed');

      expect(staleAlert).toBeDefined();
      expect(staleAlert?.severity).toBe('critical');
      expect(staleAlert?.title).toContain('Exceeded 24h Threshold');
    });

    it('passes cleanly when feed ingestion was within 24 hours', async () => {
      const freshFeedTimestamp = '2026-11-05T08:00:00Z'; // 4 hours ago
      const nowTimestamp = '2026-11-05T12:00:00Z';

      const summary = await runDailySanctionsRescreeningJob({
        tenantId,
        runDate: '2026-11-05',
        lastFeedUpdatedAtIso: freshFeedTimestamp,
        nowIso: nowTimestamp,
      });

      expect(summary.isFeedStale).toBe(false);

      const alerts = getComplianceAlerts(tenantId);
      expect(alerts.filter((a) => a.alertType === 'stale_feed').length).toBe(0);
    });
  });
});
