// path: db/seeds/super-admin.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '../../lib/db/uuidv7';
import { CompanyRepository } from '../../lib/db/companies';
import { UserRepository } from '../../lib/db/users';
import { CompanyMemberRepository } from '../../lib/db/memberships';
import { AuditLogRepository } from '../../lib/db/audit';
import type { CompanyEntity } from '../../types/company';
import type { UserEntity } from '../../types/user';
import type { CompanyMemberEntity } from '../../types/membership';
import type { AuditLogEntity } from '../../types/audit';

export interface SuperAdminSeedConfig {
  readonly email: string;
  readonly fullLegalName: string;
  readonly temporaryPassword: string;
  readonly systemCompanyName: string;
  readonly systemCompanySlug: string;
  readonly systemCountry: string;
  readonly registrationNumber: string;
}

export interface SuperAdminSeedResult {
  readonly company: CompanyEntity;
  readonly user: UserEntity;
  readonly member: CompanyMemberEntity;
  readonly auditLog: AuditLogEntity;
  readonly isNewProvisioning: boolean;
}

export interface SeedDependencies {
  readonly companyRepo?: CompanyRepository | undefined;
  readonly userRepo?: UserRepository | undefined;
  readonly memberRepo?: CompanyMemberRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly config?: Partial<SuperAdminSeedConfig> | undefined;
}

/**
 * Generates secure PBKDF2/SHA-512 password hash formatted with salt.
 */
export function hashPassword(password: string, saltHex?: string): string {
  const salt = saltHex ?? crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto
    .pbkdf2Sync(password, salt, 100_000, 64, 'sha512')
    .toString('hex');
  return `pbkdf2_sha512$100000$${salt}$${derivedKey}`;
}

/**
 * Verifies a password against the PBKDF2/SHA-512 hash format.
 */
export function verifyPassword(password: string, hash: string): boolean {
  const parts = hash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha512') return false;

  const iterations = parseInt(parts[1] ?? '0', 10);
  const salt = parts[2] ?? '';
  const expectedHash = parts[3] ?? '';

  const derivedKey = crypto
    .pbkdf2Sync(password, salt, iterations, 64, 'sha512')
    .toString('hex');

  return crypto.timingSafeEqual(
    Buffer.from(derivedKey, 'hex'),
    Buffer.from(expectedHash, 'hex')
  );
}

/**
 * Idempotently provisions the root platform system company, the initial super_admin account,
 * the super_admin role membership, and records the event in the cryptographic audit trail.
 */
export async function seedSuperAdmin(
  deps?: SeedDependencies
): Promise<SuperAdminSeedResult> {
  const config: SuperAdminSeedConfig = {
    email: deps?.config?.email ?? process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@kdsolution.it',
    fullLegalName: deps?.config?.fullLegalName ?? process.env.SUPER_ADMIN_NAME ?? 'Platform Master Super Admin',
    temporaryPassword:
      deps?.config?.temporaryPassword ??
      process.env.SUPER_ADMIN_PASSWORD ??
      'KdPlatformAdmin#2026!Secure',
    systemCompanyName:
      deps?.config?.systemCompanyName ?? 'KD Solution IT Platform HQ',
    systemCompanySlug: deps?.config?.systemCompanySlug ?? 'kd-solution-hq',
    systemCountry: deps?.config?.systemCountry ?? 'SG',
    registrationNumber: deps?.config?.registrationNumber ?? 'REG-KD-HQ-001',
  };

  const companyRepo = deps?.companyRepo ?? new CompanyRepository();
  const userRepo = deps?.userRepo ?? new UserRepository();
  const memberRepo = deps?.memberRepo ?? new CompanyMemberRepository();
  const auditRepo = deps?.auditRepo ?? new AuditLogRepository();

  let isNewProvisioning = false;

  // 1. Step 030.1: Provision or retrieve system root company
  let company = await companyRepo.findByCountryAndRegistration(
    config.systemCountry,
    config.registrationNumber
  );

  if (!company) {
    const rootCompanyId = generateUuidV7();
    company = await companyRepo.createCompany({
      id: rootCompanyId,
      company_id: rootCompanyId,
      legal_name: config.systemCompanyName,
      dba_name: 'KD Solution IT',
      business_type: 'corporation',
      registration_number: config.registrationNumber,
      country: config.systemCountry,
      operating_address: {
        street1: '1 Marina Boulevard',
        city: 'Singapore',
        postalCode: '018989',
        country: config.systemCountry,
      },
      mcc: '7372',
      risk_tier: 1,
      status: 'active',
      custom_fee_percent: '0.0000',
      custom_hold_days: 0,
      reserve_percent: '0.0000',
      reserve_hold_days: 0,
      default_currency: 'USD',
    });
    isNewProvisioning = true;
  }

  // 2. Step 030.2: Provision or retrieve super_admin user identity
  let user = await userRepo.findByEmail(config.email);

  if (!user) {
    const passwordHash = hashPassword(config.temporaryPassword);
    user = await userRepo.createUser({
      company_id: company.id,
      email: config.email,
      full_legal_name: config.fullLegalName,
      password_hash: passwordHash,
      is_staff: true,
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
    });
    isNewProvisioning = true;
  }

  // 3. Step 030.3: Provision or verify super_admin company membership
  let member = await memberRepo.findByCompanyAndUser(company.id, user.id);

  if (!member) {
    member = await memberRepo.createMember({
      company_id: company.id,
      user_id: user.id,
      role: 'super_admin',
      status: 'active',
      permissions: ['*'],
      invited_at: null,
      accepted_at: new Date().toISOString(),
    });
    isNewProvisioning = true;
  }

  // 4. Step 030.4: Append cryptographic hash-chained audit log entry
  const auditLog = await auditRepo.append({
    company_id: company.id,
    actor_id: user.id,
    action: 'PLATFORM_SYSTEM_SEED_INITIALIZED',
    entity_type: 'Company',
    entity_id: company.id,
    payload: {
      event: 'initial_platform_seed',
      system_company_id: company.id,
      super_admin_id: user.id,
      super_admin_email: user.email,
      role: 'super_admin',
      country: config.systemCountry,
      is_new_provisioning: isNewProvisioning,
      timestamp: new Date().toISOString(),
    },
    ip_address: '127.0.0.1',
    user_agent: 'KD-Solution-Seed-Runner/1.0',
  });

  return {
    company,
    user,
    member,
    auditLog,
    isNewProvisioning,
  };
}
