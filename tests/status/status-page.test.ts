// path: tests/status/status-page.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  savePlatformBranding,
  updateServiceStatus,
  broadcastIncident,
  updateIncidentStatus,
  getPublicStatusPage,
  resetStatusPageStore,
} from '@/lib/status/status-page';
import { resetActivityMailerStore } from '@/lib/email/activity-mailer';

describe('Public Status Page, Incident Broadcasting & Platform Branding (Step 154)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const superAdminId = '99999999-9999-4999-8999-999999999999';
  const merchantUserId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    resetStatusPageStore();
    resetActivityMailerStore();
  });

  describe('Platform Branding & Settings (Step 154.1)', () => {
    it('allows super_admin to configure platform name, logo and corporate details', async () => {
      const branding = await savePlatformBranding({
        tenantId,
        platformName: 'KD Enterprise PayFac Global',
        platformLogoUrl: 'https://cdn.kdsolution.com/assets/logo-vector.svg',
        supportEmail: 'support-desk@kdsolution.com',
        legalCompanyName: 'KD Solution IT International Ltd',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      expect(branding.platformName).toBe('KD Enterprise PayFac Global');
      expect(branding.platformLogoUrl).toContain('logo-vector.svg');
      expect(branding.supportEmail).toBe('support-desk@kdsolution.com');

      const page = await getPublicStatusPage(tenantId);
      expect(page.branding.platformName).toBe('KD Enterprise PayFac Global');
      expect(page.branding.platformLogoUrl).toBe('https://cdn.kdsolution.com/assets/logo-vector.svg');
    });

    it('denies non-super_admin actors from modifying platform branding', async () => {
      await expect(
        savePlatformBranding({
          tenantId,
          platformName: 'Hacked Name',
          platformLogoUrl: 'https://evil.com/logo.png',
          supportEmail: 'evil@evil.com',
          legalCompanyName: 'Evil Corp',
          actorUserId: merchantUserId,
          actorRole: 'merchant_admin',
        })
      ).rejects.toThrow(/Only super_admin can configure platform information/);
    });
  });

  describe('Status Page Health & Incident Broadcasting (Step 154.2)', () => {
    it('accurately computes overall status and broadcasts incidents', async () => {
      // 1. Initial status check -> all operational
      const initialPage = await getPublicStatusPage(tenantId);
      expect(initialPage.overallStatus).toBe('operational');
      expect(initialPage.services.length).toBe(7);
      expect(initialPage.activeIncidents.length).toBe(0);

      // 2. Broadcast critical incident affecting NMI gateway
      const incident = await broadcastIncident({
        tenantId,
        title: 'NMI Direct Post Upstream Latency Investigation',
        impact: 'major',
        status: 'investigating',
        affectedServiceKeys: ['processor_nmi'],
        broadcastMerchantEmail: 'merchant@store.com',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      expect(incident.id).toBeDefined();
      expect(incident.status).toBe('investigating');

      // 3. Inspect public status page during active incident
      const degradedPage = await getPublicStatusPage(tenantId);
      expect(degradedPage.overallStatus).toBe('partial_outage');
      expect(degradedPage.activeIncidents.length).toBe(1);
      expect(degradedPage.activeIncidents[0].title).toContain('NMI Direct Post');

      const nmiSvc = degradedPage.services.find((s) => s.serviceKey === 'processor_nmi');
      expect(nmiSvc?.status).toBe('partial_outage');

      // 4. Resolve incident
      await updateIncidentStatus(
        incident.id,
        'resolved',
        superAdminId,
        'super_admin'
      );

      const restoredPage = await getPublicStatusPage(tenantId);
      expect(restoredPage.overallStatus).toBe('operational');
      expect(restoredPage.activeIncidents.length).toBe(0);
    });

    it('allows super_admin to mark scheduled maintenance', async () => {
      await updateServiceStatus(
        tenantId,
        'payout_engine',
        'maintenance',
        superAdminId,
        'super_admin'
      );

      const page = await getPublicStatusPage(tenantId);
      expect(page.overallStatus).toBe('maintenance');

      const payoutSvc = page.services.find((s) => s.serviceKey === 'payout_engine');
      expect(payoutSvc?.status).toBe('maintenance');
    });
  });
});
