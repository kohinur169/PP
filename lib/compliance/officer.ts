// path: lib/compliance/officer.ts

import { z } from 'zod';
import { AbstractRepository, EntityStorageDriver } from '@/lib/db/repository';
import { AuditLogRepository } from '@/lib/db/audit';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { Role } from '@/lib/auth/roles';
import { logger } from '@/lib/logger';
import type { BaseEntity } from '@/types/entity';

/**
 * Compliance Officer Status in Regulatory Governance Lifecycle
 */
export type ComplianceOfficerStatus = 'active' | 'pending_ceo_approval' | 'superseded';

export interface ComplianceOfficerSettingsEntity extends BaseEntity {
  readonly officer_name: string;
  readonly official_email: string;
  readonly regulator_registration_number: string;
  readonly contact_phone: string;
  readonly appointment_date: string;
  readonly jurisdiction: string;
  readonly status: ComplianceOfficerStatus;
  readonly appointed_by: string;
  readonly ceo_approved_by: string | null;
  readonly ceo_approved_at: string | null;
  readonly change_justification: string;
}

export const ComplianceOfficerCreateSchema = z.object({
  officer_name: z.string().min(2).max(255),
  official_email: z.string().email().max(255),
  regulator_registration_number: z.string().min(3).max(100),
  contact_phone: z.string().min(5).max(50),
  appointment_date: z.string().datetime().optional(),
  jurisdiction: z.string().min(2).max(100).default('US-Delaware / EU-EEA'),
  status: z.enum(['active', 'pending_ceo_approval', 'superseded']).default('pending_ceo_approval'),
  appointed_by: z.string().uuid(),
  ceo_approved_by: z.string().uuid().nullable().optional().default(null),
  ceo_approved_at: z.string().datetime().nullable().optional().default(null),
  change_justification: z.string().min(10, 'Justification must be at least 10 characters'),
});

/**
 * Enterprise Repository for Appointed Compliance Officer Registry.
 */
export class ComplianceOfficerRepository extends AbstractRepository<ComplianceOfficerSettingsEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<ComplianceOfficerSettingsEntity> | undefined;
  }) {
    super('ComplianceOfficerSettings', {
      defaultCompanyId:
        options?.defaultCompanyId ?? '00000000-0000-7000-8000-000000000000',
      driver: options?.driver,
    });
  }

  /**
   * Retrieves the currently active designated compliance officer.
   */
  public async getActiveOfficer(): Promise<ComplianceOfficerSettingsEntity | null> {
    const all = await this.findMany({ includeDeleted: false });
    const active = all.find((r) => r.status === 'active');
    return active ?? null;
  }

  /**
   * Retrieves pending appointment awaiting CEO confirmation.
   */
  public async getPendingAppointment(): Promise<ComplianceOfficerSettingsEntity | null> {
    const all = await this.findMany({ includeDeleted: false });
    const pending = all.find((r) => r.status === 'pending_ceo_approval');
    return pending ?? null;
  }
}

const defaultOfficerRepo = new ComplianceOfficerRepository();
const defaultAuditRepo = new AuditLogRepository();

// Initial bootstrap officer for standard regulatory disclosure fallback
const BOOTSTRAP_OFFICER: ComplianceOfficerSettingsEntity = {
  id: '018f6c4c-3500-7fa1-b1e2-990000000001',
  company_id: '00000000-0000-7000-8000-000000000000',
  officer_name: 'Dr. Sarah Jenkins, CAMS',
  official_email: 'compliance.officer@kdsolution.it',
  regulator_registration_number: 'FINCEN-MSB-2026-99128',
  contact_phone: '+1 (800) 555-0199',
  appointment_date: '2026-01-01T00:00:00.000Z',
  jurisdiction: 'US-Delaware / EU-EEA Unified Facilitator',
  status: 'active',
  appointed_by: '018f6c4c-3500-7fa1-b1e2-000000000001',
  ceo_approved_by: '018f6c4c-3500-7fa1-b1e2-100000000001',
  ceo_approved_at: '2026-01-01T00:00:00.000Z',
  change_justification: 'Foundational appointment under FinCEN & EBA Payment Facilitator rules',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  version: 1,
};

let activeOfficerFallback: ComplianceOfficerSettingsEntity = { ...BOOTSTRAP_OFFICER };

/**
 * Resets officer state for test isolation.
 */
export function resetComplianceOfficerForTest(): void {
  activeOfficerFallback = { ...BOOTSTRAP_OFFICER };
}

/**
 * Step 078.3: Formats appointed compliance officer details for public disclosures,
 * legal terms pages, and regulatory inquiry disclosures.
 */
export async function getPublicComplianceOfficerDisclosure(
  repo?: ComplianceOfficerRepository
): Promise<{
  officerName: string;
  officialEmail: string;
  regulatorRegistration: string;
  jurisdiction: string;
  contactPhone: string;
  appointmentDate: string;
}> {
  const officerRepo = repo ?? defaultOfficerRepo;
  const active = (await officerRepo.getActiveOfficer()) ?? activeOfficerFallback;

  return {
    officerName: active.officer_name,
    officialEmail: active.official_email,
    regulatorRegistration: active.regulator_registration_number,
    jurisdiction: active.jurisdiction,
    contactPhone: active.contact_phone,
    appointmentDate: active.appointment_date,
  };
}

/**
 * Step 078.2: Super Admin proposes an updated compliance officer appointment.
 * Sets status to 'pending_ceo_approval' and logs audit trail.
 */
export async function proposeComplianceOfficerAppointment(
  params: {
    readonly officerName: string;
    readonly officialEmail: string;
    readonly regulatorRegistrationNumber: string;
    readonly contactPhone: string;
    readonly jurisdiction?: string | undefined;
    readonly appointedBy: string;
    readonly actorRole: Role;
    readonly justification: string;
  },
  options?: {
    readonly repo?: ComplianceOfficerRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<ComplianceOfficerSettingsEntity> {
  const {
    officerName,
    officialEmail,
    regulatorRegistrationNumber,
    contactPhone,
    jurisdiction,
    appointedBy,
    actorRole,
    justification,
  } = params;

  if (actorRole !== Role.SUPER_ADMIN) {
    throw new Error('Access Denied: Only Super Admin can propose a new Compliance Officer appointment.');
  }

  const officerRepo = options?.repo ?? defaultOfficerRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const validated = ComplianceOfficerCreateSchema.parse({
    officer_name: officerName,
    official_email: officialEmail,
    regulator_registration_number: regulatorRegistrationNumber,
    contact_phone: contactPhone,
    jurisdiction: jurisdiction ?? 'US-Delaware / EU-EEA',
    status: 'pending_ceo_approval',
    appointed_by: appointedBy,
    change_justification: justification,
  });

  const record = await officerRepo.create({
    id: generateUuidV7(),
    company_id: '00000000-0000-7000-8000-000000000000',
    ...validated,
    appointment_date: new Date().toISOString(),
    ceo_approved_by: null,
    ceo_approved_at: null,
  });

  // Step 078.4: Audit log proposal
  try {
    await auditRepo.createLog({
      company_id: '00000000-0000-7000-8000-000000000000',
      actor_id: appointedBy,
      action: 'COMPLIANCE_OFFICER_APPOINTMENT_PROPOSED',
      entity_type: 'compliance_officer_settings',
      entity_id: record.id,
      payload: {
        officerName,
        officialEmail,
        regulatorRegistrationNumber,
        contactPhone,
        justification,
        status: 'pending_ceo_approval',
      },
    });
  } catch (err: unknown) {
    logger.error('Failed to log compliance officer appointment proposal', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('Compliance Officer appointment proposed by Super Admin, awaiting CEO confirmation', {
    appointmentId: record.id,
    officerName,
    appointedBy,
  });

  return record;
}

/**
 * Step 078.2: CEO reviews and approves pending compliance officer appointment.
 * Transitions pending appointment to 'active' and supersedes previous appointment.
 */
export async function approveComplianceOfficerAppointment(
  params: {
    readonly appointmentId: string;
    readonly ceoUserId: string;
    readonly ceoRole: Role;
    readonly approvalNotes?: string | undefined;
  },
  options?: {
    readonly repo?: ComplianceOfficerRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<ComplianceOfficerSettingsEntity> {
  const { appointmentId, ceoUserId, ceoRole, approvalNotes } = params;

  if (ceoRole !== Role.CEO) {
    throw new Error('Access Denied: Only CEO can confirm and finalize Compliance Officer appointments.');
  }

  const officerRepo = options?.repo ?? defaultOfficerRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const target = await officerRepo.findById(appointmentId);
  if (!target) {
    throw new Error(`Appointment record "${appointmentId}" not found.`);
  }

  if (target.status !== 'pending_ceo_approval') {
    throw new Error(`Appointment "${appointmentId}" is not pending CEO confirmation (status: ${target.status}).`);
  }

  // Supersede existing active officer
  const currentActive = await officerRepo.getActiveOfficer();
  if (currentActive) {
    await officerRepo.update(currentActive.id, currentActive.version, {
      status: 'superseded',
    });
  }

  const approvedAt = new Date().toISOString();
  const updated = await officerRepo.update(target.id, target.version, {
    status: 'active',
    ceo_approved_by: ceoUserId,
    ceo_approved_at: approvedAt,
  });

  activeOfficerFallback = { ...updated };

  // Step 078.4: Audit log finalization
  try {
    await auditRepo.createLog({
      company_id: '00000000-0000-7000-8000-000000000000',
      actor_id: ceoUserId,
      action: 'COMPLIANCE_OFFICER_APPOINTMENT_CONFIRMED',
      entity_type: 'compliance_officer_settings',
      entity_id: updated.id,
      payload: {
        officerName: updated.officer_name,
        officialEmail: updated.official_email,
        regulatorRegistrationNumber: updated.regulator_registration_number,
        ceoUserId,
        approvalNotes: approvalNotes ?? 'Formally ratified by Chief Executive Officer',
        approvedAt,
      },
    });
  } catch (err: unknown) {
    logger.error('Failed to log compliance officer appointment approval', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('Compliance Officer appointment confirmed and active platform-wide', {
    appointmentId: updated.id,
    officerName: updated.officer_name,
    ceoUserId,
  });

  return updated;
}
