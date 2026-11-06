// path: tests/announcements/announcements.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  publishAnnouncement,
  dismissAnnouncement,
  getActiveAnnouncementsForUser,
  deactivateAnnouncement,
  resetAnnouncementStore,
} from '@/lib/announcements/announcements';

describe('Platform Announcements Engine & Per-User Dismissal Invariant (Step 152)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const superAdminId = '99999999-9999-4999-8999-999999999999';
  const merchantUserA = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const merchantUserB = 'bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  beforeEach(() => {
    resetAnnouncementStore();
  });

  describe('Publishing Announcements (Step 152.1)', () => {
    it('allows super_admin to publish popups with priority and expiry', async () => {
      const announcement = await publishAnnouncement({
        tenantId,
        title: 'Scheduled Gateway Maintenance Window',
        content: 'NMI and Airwallex rails will undergo routine maintenance on Sunday from 02:00 to 04:00 UTC.',
        priority: 'urgent',
        expiresAt: '2026-11-15T00:00:00Z',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      expect(announcement.id).toBeDefined();
      expect(announcement.isActive).toBe(true);
      expect(announcement.priority).toBe('urgent');
      expect(announcement.title).toContain('Maintenance');
    });

    it('rejects publishing from non-super_admin actors', async () => {
      await expect(
        publishAnnouncement({
          tenantId,
          title: 'Unauthorized Notice',
          content: 'Hello',
          actorUserId: merchantUserA,
          actorRole: 'merchant_admin',
        })
      ).rejects.toThrow(/Only super_admin can publish platform announcements/);
    });
  });

  describe('Per-User Dismissal Invariant (Step 152.2)', () => {
    it('ensures dismissed announcements disappear only for the dismissing user', async () => {
      // 1. Publish global popup
      const announcement = await publishAnnouncement({
        tenantId,
        title: 'New Asian Payment Rails Active',
        content: 'We have enabled PromptPay and DuitNow through Airwallex for all Tier 2+ sub-merchants.',
        priority: 'info',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      // 2. Both User A and User B initially see the popup
      const listA1 = await getActiveAnnouncementsForUser(tenantId, merchantUserA);
      const listB1 = await getActiveAnnouncementsForUser(tenantId, merchantUserB);

      expect(listA1.length).toBe(1);
      expect(listB1.length).toBe(1);
      expect(listA1[0].id).toBe(announcement.id);
      expect(listB1[0].id).toBe(announcement.id);

      // 3. User A dismisses the popup
      const dismissRes = await dismissAnnouncement(announcement.id, merchantUserA, tenantId);
      expect(dismissRes.dismissed).toBe(true);

      // 4. Verify User A no longer sees it, while User B still does!
      const listA2 = await getActiveAnnouncementsForUser(tenantId, merchantUserA);
      const listB2 = await getActiveAnnouncementsForUser(tenantId, merchantUserB);

      expect(listA2.length).toBe(0); // Disappeared for User A
      expect(listB2.length).toBe(1); // Still visible to User B!
      expect(listB2[0].id).toBe(announcement.id);
    });

    it('handles idempotent dismissals gracefully', async () => {
      const announcement = await publishAnnouncement({
        tenantId,
        title: 'Notice',
        content: 'System notice',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      await dismissAnnouncement(announcement.id, merchantUserA, tenantId);
      const secondDismiss = await dismissAnnouncement(announcement.id, merchantUserA, tenantId);
      expect(secondDismiss.dismissed).toBe(true);
    });
  });

  describe('Deactivation & Expiry Filter (Step 152.3)', () => {
    it('hides expired announcements from all users', async () => {
      await publishAnnouncement({
        tenantId,
        title: 'Past Notice',
        content: 'This announcement already expired yesterday.',
        expiresAt: '2026-11-01T00:00:00Z', // In the past relative to 2026-11-05
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      const list = await getActiveAnnouncementsForUser(tenantId, merchantUserA);
      expect(list.length).toBe(0);
    });

    it('hides deactivated announcements from all users', async () => {
      const announcement = await publishAnnouncement({
        tenantId,
        title: 'Temporary Flash Notice',
        content: 'Notice content',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      await deactivateAnnouncement(announcement.id, superAdminId, 'super_admin');

      const list = await getActiveAnnouncementsForUser(tenantId, merchantUserA);
      expect(list.length).toBe(0);
    });
  });
});
