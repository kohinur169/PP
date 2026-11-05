// path: tests/status/health-monitor.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveStatusFromSuccessRate,
  recordSyntheticPing,
  calculateRollingUptime,
  runPlatformHealthMonitorJob,
  seedStatusSubscriber,
  getServiceState,
  getPlatformIncidents,
  resetPlatformStatusStore,
} from '@/lib/status/health-monitor';
import { resetActivityMailerStore } from '@/lib/email/activity-mailer';

describe('Platform Health Status Heartbeat Ping & Synthetic Monitor Worker (Step 168)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    resetPlatformStatusStore();
    resetActivityMailerStore();
  });

  describe('Success Rate to Status Resolution Invariant (Step 168.1)', () => {
    it('maps synthetic success rates to expected operational status levels', () => {
      expect(resolveStatusFromSuccessRate(100)).toBe('operational');
      expect(resolveStatusFromSuccessRate(95)).toBe('degraded_performance');
      expect(resolveStatusFromSuccessRate(75)).toBe('partial_outage');
      expect(resolveStatusFromSuccessRate(40)).toBe('major_outage');
    });
  });

  describe('Rolling Uptime Percentages Calculator (Step 168.2)', () => {
    it('calculates rolling 30, 60, and 90-day uptime accurately', () => {
      const now = '2026-11-05T12:00:00Z';

      // Seed 10 successful pings in the last 10 days
      for (let i = 0; i < 10; i++) {
        const dayStr = String(i + 1).padStart(2, '0');
        recordSyntheticPing({
          id: `ping_recent_${i}`,
          tenantId,
          serviceKey: 'core_api',
          isSuccess: true,
          latencyMs: 35,
          createdAt: `2026-11-${dayStr}T10:00:00Z`,
        });
      }

      // Seed 1 failure 40 days ago (affects 60d and 90d, but NOT 30d)
      recordSyntheticPing({
        id: 'ping_older_fail',
        tenantId,
        serviceKey: 'core_api',
        isSuccess: false,
        latencyMs: 2500,
        errorMessage: 'Connection timeout',
        createdAt: '2026-09-25T10:00:00Z',
      });

      const uptime = calculateRollingUptime(tenantId, 'core_api', now);

      // 30d has 10/10 success = 100%
      expect(uptime.uptime30d).toBe(100);

      // 60d has 10/11 success = 90.91%
      expect(uptime.uptime60d).toBe(90.91);

      // 90d has 10/11 success = 90.91%
      expect(uptime.uptime90d).toBe(90.91);
    });
  });

  describe('Automated Health Monitor Worker & Incident Creation (Step 168.3)', () => {
    it('detects degraded performance, updates service state, opens incident, and alerts subscribers', async () => {
      const now = '2026-11-05T12:00:00Z';

      // 1. Seed subscriber
      seedStatusSubscriber({
        id: 'sub_001',
        tenantId,
        email: 'ops@merchant.test',
        isVerified: true,
      });

      // 2. Seed recent failing pings within 15-minute window for payment_nmi
      // 5 pings: 3 failed, 2 success = 40% success rate -> major_outage
      recordSyntheticPing({
        id: 'p1',
        tenantId,
        serviceKey: 'payment_nmi',
        isSuccess: false,
        latencyMs: 5000,
        createdAt: '2026-11-05T11:50:00Z',
      });
      recordSyntheticPing({
        id: 'p2',
        tenantId,
        serviceKey: 'payment_nmi',
        isSuccess: false,
        latencyMs: 5000,
        createdAt: '2026-11-05T11:52:00Z',
      });
      recordSyntheticPing({
        id: 'p3',
        tenantId,
        serviceKey: 'payment_nmi',
        isSuccess: false,
        latencyMs: 5000,
        createdAt: '2026-11-05T11:55:00Z',
      });
      recordSyntheticPing({
        id: 'p4',
        tenantId,
        serviceKey: 'payment_nmi',
        isSuccess: true,
        latencyMs: 120,
        createdAt: '2026-11-05T11:56:00Z',
      });
      recordSyntheticPing({
        id: 'p5',
        tenantId,
        serviceKey: 'payment_nmi',
        isSuccess: true,
        latencyMs: 110,
        createdAt: '2026-11-05T11:58:00Z',
      });

      const summary = await runPlatformHealthMonitorJob({
        tenantId,
        nowIso: now,
      });

      expect(summary.inspectedServicesCount).toBe(9);
      expect(summary.statusChangesCount).toBe(1);
      expect(summary.incidentsCreatedCount).toBe(1);
      expect(summary.subscriberAlertsSentCount).toBe(1);

      // Verify updated service state
      const nmiState = getServiceState(tenantId, 'payment_nmi');
      expect(nmiState?.status).toBe('major_outage');

      // Verify incident created
      const incidents = getPlatformIncidents(tenantId);
      expect(incidents.length).toBe(1);
      expect(incidents[0].impact).toBe('critical');
      expect(incidents[0].status).toBe('investigating');
      expect(incidents[0].affectedServiceKeys).toContain('payment_nmi');
    });
  });
});
