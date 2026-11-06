// path: lib/auth/device.ts

import crypto from 'node:crypto';
import type { DeviceCharacteristics } from './session-types';
import { generateDeviceFingerprint } from './fingerprint';
import { UserDeviceRepository } from '../db/devices';
import { AuditLogRepository } from '../db/audit';
import type {
  UserDeviceEntity,
  DeviceRecognitionResult,
  NewDeviceAlertEmailParams,
  NewDeviceAlertEmailResult,
  ConfirmDeviceResult,
} from '../../types/device';
import { logger } from '../logger';

export const DEVICE_CONFIRMATION_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export interface DeviceRecognitionOptions {
  readonly deviceRepo?: UserDeviceRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly nowMs?: number | undefined;
  readonly emailDispatcher?: ((params: NewDeviceAlertEmailParams) => Promise<boolean> | boolean) | undefined;
}

const defaultDeviceRepo = new UserDeviceRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Generates an ephemeral cryptographic client proof key.
 * Formatted as "dpk_" followed by a 256-bit cryptographically secure hexadecimal string.
 */
export function generateDeviceProofKey(): string {
  const entropy = crypto.randomBytes(32).toString('hex');
  return `dpk_${entropy}`;
}

/**
 * Hashes a 6-digit verification confirmation code using SHA-256 for secure database storage.
 */
export function hashConfirmationCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim(), 'utf8').digest('hex');
}

/**
 * Generates a 6-digit numeric confirmation code for email verification.
 */
export function generateConfirmationCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Parses user agent string to provide a human-friendly device and browser summary.
 */
export function parseDeviceName(userAgent: string): string {
  if (!userAgent || typeof userAgent !== 'string') {
    return 'Unknown Device';
  }

  const ua = userAgent.toLowerCase();
  let browser = 'Browser';
  let os = 'Unknown OS';

  // Detect OS (check mobile OS before desktop OS)
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) os = 'iOS';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';

  // Detect Browser
  if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome/') && !ua.includes('edg/')) browser = 'Chrome';
  else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari';
  else if (ua.includes('firefox/')) browser = 'Firefox';

  return `${browser} on ${os}`;
}

/**
 * Step 056.3: Dispatches a security alert email when login from an unrecognized device is detected.
 */
export async function dispatchNewDeviceLoginAlert(
  params: NewDeviceAlertEmailParams,
  options?: DeviceRecognitionOptions
): Promise<NewDeviceAlertEmailResult> {
  const subject = `Security Notice: New Device Login Alert (Verification Code: ${params.confirmationCode})`;

  if (options?.emailDispatcher) {
    await options.emailDispatcher(params);
  }

  logger.warn('New device login security alert dispatched to user', {
    userId: params.userId,
    recipient: params.email,
    deviceName: params.deviceName,
    ipAddress: params.ipAddress,
    subject,
  });

  return {
    dispatched: true,
    recipient: params.email,
    subject,
    confirmationCode: params.confirmationCode,
  };
}

/**
 * Step 056.2 & Step 056.3: Compares incoming device fingerprint against known devices in user_devices.
 * If unrecognized or unverified, triggers security alert email and returns confirmation requirement.
 */
export async function recognizeDevice(
  params: {
    readonly userId: string;
    readonly userEmail: string;
    readonly device: DeviceCharacteristics;
    readonly companyId?: string | undefined;
    readonly proofKey?: string | undefined;
  },
  options?: DeviceRecognitionOptions
): Promise<DeviceRecognitionResult> {
  const deviceRepo = options?.deviceRepo ?? defaultDeviceRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const fingerprint = generateDeviceFingerprint(params.device);
  const existingDevice = await deviceRepo.findByUserAndFingerprint(
    params.userId,
    fingerprint
  );

  // Case 1: Known and trusted device
  if (existingDevice && existingDevice.is_trusted) {
    const updated = await deviceRepo.touchDevice(
      existingDevice.id,
      params.device.ip,
      params.device.userAgent
    );

    return {
      isNewDevice: false,
      device: updated ?? existingDevice,
      requiresConfirmation: false,
    };
  }

  // Case 2: New or untrusted device requiring verification
  const confirmationCode = generateConfirmationCode();
  const codeHash = hashConfirmationCode(confirmationCode);
  const expiresAt = new Date(nowMs + DEVICE_CONFIRMATION_EXPIRY_MS).toISOString();
  const deviceName = parseDeviceName(params.device.userAgent);
  const proofKey = params.proofKey || generateDeviceProofKey();

  let targetDevice: UserDeviceEntity;

  if (existingDevice) {
    // Refresh confirmation code on existing untrusted record
    targetDevice = (await deviceRepo.setConfirmationCode(
      existingDevice.id,
      codeHash,
      expiresAt
    )) ?? existingDevice;
  } else {
    // Register fresh device record
    targetDevice = await deviceRepo.create({
      user_id: params.userId,
      company_id: params.companyId ?? '00000000-0000-7000-8000-000000000000',
      device_fingerprint: fingerprint,
      proof_key: proofKey,
      device_name: deviceName,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      last_ip: params.device.ip,
      last_user_agent: params.device.userAgent,
      is_trusted: false,
      confirmation_code_hash: codeHash,
      confirmation_code_expires_at: expiresAt,
      confirmed_at: null,
    });
  }

  // Dispatch instant security notification email
  await dispatchNewDeviceLoginAlert(
    {
      email: params.userEmail,
      userId: params.userId,
      confirmationCode,
      ipAddress: params.device.ip,
      userAgent: params.device.userAgent,
      deviceName,
      detectedAt: nowIso,
    },
    options
  );

  // Audit event for unrecognized device detection
  await auditRepo.append({
    action: 'NEW_DEVICE_LOGIN_DETECTED',
    entity_type: 'user_device',
    entity_id: targetDevice.id,
    actor_id: params.userId,
    company_id: params.companyId ?? '00000000-0000-7000-8000-000000000000',
    ip_address: params.device.ip,
    user_agent: params.device.userAgent,
    payload: {
      userId: params.userId,
      deviceId: targetDevice.id,
      fingerprint,
      deviceName,
      proofKeyPrefix: proofKey.slice(0, 10),
    },
  });

  return {
    isNewDevice: true,
    device: targetDevice,
    requiresConfirmation: true,
    confirmationCode,
    alertDispatched: true,
  };
}

/**
 * Step 056.3: Confirms and trusts a newly recognized device using the 6-digit email confirmation code.
 */
export async function confirmNewDevice(
  params: {
    readonly userId: string;
    readonly fingerprint: string;
    readonly code: string;
  },
  options?: DeviceRecognitionOptions
): Promise<ConfirmDeviceResult> {
  const deviceRepo = options?.deviceRepo ?? defaultDeviceRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const nowMs = options?.nowMs ?? Date.now();

  const device = await deviceRepo.findByUserAndFingerprint(
    params.userId,
    params.fingerprint
  );

  if (!device) {
    return {
      success: false,
      error: 'DEVICE_NOT_FOUND',
      message: 'Unrecognized device record not found.',
    };
  }

  // Check code expiration
  if (device.confirmation_code_expires_at) {
    const expiresMs = new Date(device.confirmation_code_expires_at).getTime();
    if (nowMs > expiresMs) {
      return {
        success: false,
        error: 'CODE_EXPIRED',
        message: 'Device confirmation code has expired. Please request a fresh code.',
      };
    }
  }

  // Verify code hash
  const candidateHash = hashConfirmationCode(params.code);
  if (!device.confirmation_code_hash || candidateHash !== device.confirmation_code_hash) {
    logger.warn('Device confirmation failed: invalid code', {
      userId: params.userId,
      deviceId: device.id,
    });

    return {
      success: false,
      error: 'INVALID_CODE',
      message: 'Invalid confirmation code supplied.',
    };
  }

  // Mark device as verified and trusted
  const trusted = await deviceRepo.markTrusted(device.id);

  await auditRepo.append({
    action: 'NEW_DEVICE_CONFIRMED',
    entity_type: 'user_device',
    entity_id: device.id,
    actor_id: params.userId,
    company_id: device.company_id,
    ip_address: device.last_ip,
    user_agent: device.last_user_agent,
    payload: {
      userId: params.userId,
      deviceId: device.id,
      fingerprint: params.fingerprint,
    },
  });

  return {
    success: true,
    device: trusted ?? device,
    message: 'Device successfully verified and trusted.',
  };
}
