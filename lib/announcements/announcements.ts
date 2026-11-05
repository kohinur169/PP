// path: lib/announcements/announcements.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type AnnouncementPriority = 'info' | 'standard' | 'urgent' | 'critical';

export interface AnnouncementRecord {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  isActive: boolean;
  publishedAt: string;
  expiresAt?: string | undefined;
  createdBy?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface PublishAnnouncementInput {
  tenantId: string;
  title: string;
  content: string;
  priority?: AnnouncementPriority | undefined;
  expiresAt?: string | undefined;
  actorUserId: string;
  actorRole: string;
}

export interface AnnouncementDismissalRecord {
  id: string;
  tenantId: string;
  announcementId: string;
  userId: string;
  dismissedAt: string;
}

const announcementStore = new Map<string, AnnouncementRecord>();
const dismissalStore = new Map<string, AnnouncementDismissalRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 152.1: Publish a global platform popup announcement.
 * Section 24: "super_admin publishes announcements that appear as popups everywhere."
 */
export async function publishAnnouncement(
  input: PublishAnnouncementInput
): Promise<AnnouncementRecord> {
  if (input.actorRole !== 'super_admin') {
    throw new Error('Unauthorized: Only super_admin can publish platform announcements.');
  }

  if (!input.title || input.title.trim().length === 0) {
    throw new Error('Announcement title is required.');
  }

  if (!input.content || input.content.trim().length === 0) {
    throw new Error('Announcement content is required.');
  }

  const now = new Date().toISOString();
  const id = generateUuidV7();

  const record: AnnouncementRecord = {
    id,
    tenantId: input.tenantId,
    title: input.title.trim(),
    content: input.content.trim(),
    priority: input.priority ?? 'standard',
    isActive: true,
    publishedAt: now,
    expiresAt: input.expiresAt,
    createdBy: input.actorUserId,
    createdAt: now,
    updatedAt: now,
  };

  announcementStore.set(id, record);

  logger.info('Platform announcement published by super_admin', {
    announcementId: id,
    tenantId: input.tenantId,
    title: record.title,
    priority: record.priority,
  });

  try {
    await auditRepo.append({
      actor_id: input.actorUserId,
      action: 'ANNOUNCEMENT_PUBLISHED',
      entity_type: 'announcement',
      entity_id: id,
      payload: {
        title: record.title,
        priority: record.priority,
        expiresAt: record.expiresAt ?? null,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for announcement publish', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Step 152.2: Dismiss an announcement for a specific user.
 * Section 24: "A user can dismiss an announcement, and a dismissed announcement does not appear again for that user."
 */
export async function dismissAnnouncement(
  announcementId: string,
  userId: string,
  tenantId: string
): Promise<{ dismissed: boolean }> {
  const announcement = announcementStore.get(announcementId);
  if (!announcement) {
    throw new Error(`Announcement '${announcementId}' not found.`);
  }

  const key = `${announcementId}:${userId}`;
  if (dismissalStore.has(key)) {
    return { dismissed: true };
  }

  const dismissal: AnnouncementDismissalRecord = {
    id: generateUuidV7(),
    tenantId,
    announcementId,
    userId,
    dismissedAt: new Date().toISOString(),
  };

  dismissalStore.set(key, dismissal);

  logger.info('Announcement dismissed by user', {
    announcementId,
    userId,
  });

  return { dismissed: true };
}

/**
 * Step 152.3: Retrieve active popup announcements visible to a user.
 * Excludes inactive, expired, or previously dismissed announcements for this user.
 */
export async function getActiveAnnouncementsForUser(
  tenantId: string,
  userId: string
): Promise<AnnouncementRecord[]> {
  const now = new Date().toISOString();
  const visible: AnnouncementRecord[] = [];

  for (const announcement of announcementStore.values()) {
    if (announcement.tenantId !== tenantId) {
      continue;
    }

    if (!announcement.isActive) {
      continue;
    }

    if (announcement.expiresAt && announcement.expiresAt < now) {
      continue;
    }

    // Check if dismissed
    const dismissalKey = `${announcement.id}:${userId}`;
    if (dismissalStore.has(dismissalKey)) {
      continue;
    }

    visible.push(announcement);
  }

  return visible;
}

/**
 * Deactivates an announcement (super_admin only).
 */
export async function deactivateAnnouncement(
  announcementId: string,
  actorUserId: string,
  actorRole: string
): Promise<AnnouncementRecord> {
  if (actorRole !== 'super_admin') {
    throw new Error('Unauthorized: Only super_admin can deactivate announcements.');
  }

  const record = announcementStore.get(announcementId);
  if (!record) {
    throw new Error(`Announcement '${announcementId}' not found.`);
  }

  record.isActive = false;
  record.updatedAt = new Date().toISOString();

  return record;
}

/**
 * Resets in-memory stores for test isolation.
 */
export function resetAnnouncementStore(): void {
  announcementStore.clear();
  dismissalStore.clear();
}
