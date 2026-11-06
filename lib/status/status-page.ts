// path: lib/status/status-page.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { dispatchActivityEmail } from '@/lib/email/activity-mailer';

export type ServiceHealthStatus =
  | 'operational'
  | 'degraded_performance'
  | 'partial_outage'
  | 'major_outage'
  | 'maintenance';

export type IncidentImpact = 'none' | 'minor' | 'major' | 'critical';
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';

export interface ServiceStateRecord {
  id: string;
  tenantId: string;
  serviceKey: string;
  displayName: string;
  status: ServiceHealthStatus;
  lastCheckedAt: string;
  updatedBy?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformIncidentRecord {
  id: string;
  tenantId: string;
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  affectedServiceKeys: string[];
  resolvedAt?: string | undefined;
  createdBy?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformBrandingRecord {
  tenantId: string;
  platformName: string;
  platformLogoUrl: string;
  supportEmail: string;
  legalCompanyName: string;
  updatedBy: string;
  updatedAt: string;
}

export interface PublicStatusPageSummary {
  overallStatus: ServiceHealthStatus;
  branding: PlatformBrandingRecord;
  services: ServiceStateRecord[];
  activeIncidents: PlatformIncidentRecord[];
  generatedAt: string;
}

const serviceStore = new Map<string, ServiceStateRecord>();
const incidentStore = new Map<string, PlatformIncidentRecord>();
const brandingStore = new Map<string, PlatformBrandingRecord>();
const auditRepo = new AuditLogRepository();

export const DEFAULT_PLATFORM_SERVICES: Array<{ key: string; name: string }> = [
  { key: 'api_gateway', name: 'API & Public Payment Intents' },
  { key: 'hosted_checkout', name: 'Collect.js Hosted Tokenization Fields' },
  { key: 'processor_nmi', name: 'NMI Primary Payment Gateway' },
  { key: 'processor_airwallex', name: 'Airwallex Connected Gateway Rails' },
  { key: 'processor_stripe', name: 'Stripe Connect Processing Rails' },
  { key: 'payout_engine', name: 'Payoneer Mass Payout Disbursement' },
  { key: 'webhooks', name: 'Webhook Event Dispatcher' },
];

/**
 * Initializes default service records for a tenant.
 */
export function ensureDefaultServices(tenantId: string): void {
  const now = new Date().toISOString();
  for (const svc of DEFAULT_PLATFORM_SERVICES) {
    const key = `${tenantId}:${svc.key}`;
    if (!serviceStore.has(key)) {
      serviceStore.set(key, {
        id: generateUuidV7(),
        tenantId,
        serviceKey: svc.key,
        displayName: svc.name,
        status: 'operational',
        lastCheckedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

/**
 * Step 154.1: super_admin sets platform logo and platform information.
 * Section 24: "super_admin sets the platform logo and all platform information from settings."
 */
export async function savePlatformBranding(input: {
  tenantId: string;
  platformName: string;
  platformLogoUrl: string;
  supportEmail: string;
  legalCompanyName: string;
  actorUserId: string;
  actorRole: string;
}): Promise<PlatformBrandingRecord> {
  if (input.actorRole !== 'super_admin') {
    throw new Error('Unauthorized: Only super_admin can configure platform information and logo.');
  }

  if (!input.platformName || input.platformName.trim().length === 0) {
    throw new Error('Platform name is required.');
  }

  if (!input.platformLogoUrl || !input.platformLogoUrl.startsWith('http')) {
    throw new Error('Valid platform logo URL is required.');
  }

  const record: PlatformBrandingRecord = {
    tenantId: input.tenantId,
    platformName: input.platformName.trim(),
    platformLogoUrl: input.platformLogoUrl.trim(),
    supportEmail: input.supportEmail.trim().toLowerCase(),
    legalCompanyName: input.legalCompanyName.trim(),
    updatedBy: input.actorUserId,
    updatedAt: new Date().toISOString(),
  };

  brandingStore.set(input.tenantId, record);

  logger.info('Platform branding and information updated', {
    tenantId: input.tenantId,
    platformName: record.platformName,
  });

  try {
    await auditRepo.append({
      actor_id: input.actorUserId,
      action: 'PLATFORM_BRANDING_UPDATED',
      entity_type: 'platform_branding',
      entity_id: input.tenantId,
      payload: {
        platformName: record.platformName,
        platformLogoUrl: record.platformLogoUrl,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for branding update', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Step 154.2: Update individual service health status.
 */
export async function updateServiceStatus(
  tenantId: string,
  serviceKey: string,
  status: ServiceHealthStatus,
  actorUserId: string,
  actorRole: string
): Promise<ServiceStateRecord> {
  if (actorRole !== 'super_admin') {
    throw new Error('Unauthorized: Only super_admin can update service status.');
  }

  ensureDefaultServices(tenantId);
  const key = `${tenantId}:${serviceKey}`;
  const service = serviceStore.get(key);
  if (!service) {
    throw new Error(`Service '${serviceKey}' not found.`);
  }

  const now = new Date().toISOString();
  service.status = status;
  service.lastCheckedAt = now;
  service.updatedBy = actorUserId;
  service.updatedAt = now;

  logger.info('Service status updated', {
    serviceKey,
    status,
  });

  return service;
}

/**
 * Step 154.3: Announce and broadcast incident on status page and by email.
 * Section 24: "A public status page shows service state, and incidents are announced on the status page and by email."
 */
export async function broadcastIncident(input: {
  tenantId: string;
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  affectedServiceKeys: string[];
  broadcastMerchantEmail?: string | undefined;
  actorUserId: string;
  actorRole: string;
}): Promise<PlatformIncidentRecord> {
  if (input.actorRole !== 'super_admin') {
    throw new Error('Unauthorized: Only super_admin can broadcast platform incidents.');
  }

  ensureDefaultServices(input.tenantId);

  const now = new Date().toISOString();
  const id = generateUuidV7();

  const incident: PlatformIncidentRecord = {
    id,
    tenantId: input.tenantId,
    title: input.title.trim(),
    impact: input.impact,
    status: input.status,
    affectedServiceKeys: input.affectedServiceKeys,
    resolvedAt: input.status === 'resolved' ? now : undefined,
    createdBy: input.actorUserId,
    createdAt: now,
    updatedAt: now,
  };

  incidentStore.set(id, incident);

  // Automatically update affected service states
  const targetHealth: ServiceHealthStatus =
    input.status === 'resolved'
      ? 'operational'
      : input.impact === 'critical'
      ? 'major_outage'
      : input.impact === 'major'
      ? 'partial_outage'
      : 'degraded_performance';

  for (const svcKey of input.affectedServiceKeys) {
    const key = `${input.tenantId}:${svcKey}`;
    const svc = serviceStore.get(key);
    if (svc) {
      svc.status = targetHealth;
      svc.lastCheckedAt = now;
      svc.updatedAt = now;
    }
  }

  logger.info('Platform incident broadcasted on status page', {
    incidentId: id,
    title: incident.title,
    impact: incident.impact,
    status: incident.status,
  });

  // Announce by email if recipient provided
  if (input.broadcastMerchantEmail) {
    try {
      await dispatchActivityEmail({
        tenantId: input.tenantId,
        templateKey: 'service_stop_restore',
        recipient: input.broadcastMerchantEmail,
        variables: {
          serviceStatus: incident.status.toUpperCase(),
          statusDetail: `${incident.title} - Impact: ${incident.impact}`,
        },
      });
    } catch (err: unknown) {
      logger.warn('Failed to send incident email announcement', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return incident;
}

/**
 * Step 154.4: Update an existing incident's status and lifecycle.
 */
export async function updateIncidentStatus(
  incidentId: string,
  newStatus: IncidentStatus,
  actorUserId: string,
  actorRole: string
): Promise<PlatformIncidentRecord> {
  if (actorRole !== 'super_admin') {
    throw new Error('Unauthorized: Only super_admin can update incident status.');
  }

  const incident = incidentStore.get(incidentId);
  if (!incident) {
    throw new Error(`Incident '${incidentId}' not found.`);
  }

  const now = new Date().toISOString();
  incident.status = newStatus;
  if (newStatus === 'resolved') {
    incident.resolvedAt = now;

    // Restore affected services to operational
    for (const svcKey of incident.affectedServiceKeys) {
      const key = `${incident.tenantId}:${svcKey}`;
      const svc = serviceStore.get(key);
      if (svc) {
        svc.status = 'operational';
        svc.lastCheckedAt = now;
        svc.updatedAt = now;
      }
    }
  }
  incident.updatedAt = now;

  logger.info('Platform incident status updated', {
    incidentId,
    status: newStatus,
  });

  return incident;
}

/**
 * Step 154.5: Public status page data provider.
 */
export async function getPublicStatusPage(
  tenantId: string
): Promise<PublicStatusPageSummary> {
  ensureDefaultServices(tenantId);

  const services: ServiceStateRecord[] = [];
  for (const svc of serviceStore.values()) {
    if (svc.tenantId === tenantId) {
      services.push(svc);
    }
  }

  const activeIncidents: PlatformIncidentRecord[] = [];
  for (const inc of incidentStore.values()) {
    if (inc.tenantId === tenantId && inc.status !== 'resolved') {
      activeIncidents.push(inc);
    }
  }

  // Determine overall status
  let overallStatus: ServiceHealthStatus = 'operational';
  if (services.some((s) => s.status === 'major_outage')) {
    overallStatus = 'major_outage';
  } else if (services.some((s) => s.status === 'partial_outage')) {
    overallStatus = 'partial_outage';
  } else if (services.some((s) => s.status === 'degraded_performance')) {
    overallStatus = 'degraded_performance';
  } else if (services.some((s) => s.status === 'maintenance')) {
    overallStatus = 'maintenance';
  }

  const branding = brandingStore.get(tenantId) ?? {
    tenantId,
    platformName: 'KD Solution PayFac',
    platformLogoUrl: 'https://kdsolution.example.com/logo.png',
    supportEmail: 'support@kdsolution.example.com',
    legalCompanyName: 'KD Solution IT Pte Ltd',
    updatedBy: '00000000-0000-0000-0000-000000000000',
    updatedAt: new Date().toISOString(),
  };

  return {
    overallStatus,
    branding,
    services,
    activeIncidents,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Resets in-memory stores for test isolation.
 */
export function resetStatusPageStore(): void {
  serviceStore.clear();
  incidentStore.clear();
  brandingStore.clear();
}
