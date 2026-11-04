// path: lib/db/devices.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import type { UserDeviceEntity } from '../../types/device';

/**
 * Enterprise Repository for Persisted Hardware Devices & Proof Keys.
 * Tracks client device fingerprints, client proof keys, trust states, and confirmation lifecycle.
 */
export class UserDeviceRepository extends AbstractRepository<UserDeviceEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<UserDeviceEntity> | undefined;
  }) {
    super('UserDevice', {
      defaultCompanyId:
        options?.defaultCompanyId ?? '00000000-0000-7000-8000-000000000000',
      driver: options?.driver,
    });
  }

  /**
   * Retrieves a device record by user ID and deterministic hardware fingerprint.
   */
  public async findByUserAndFingerprint(
    userId: string,
    fingerprint: string
  ): Promise<UserDeviceEntity | null> {
    const all = await this.findMany({ includeDeleted: false });
    const match = all.find(
      (d) => d.user_id === userId && d.device_fingerprint === fingerprint
    );
    return match ?? null;
  }

  /**
   * Retrieves a device record by its unique client proof key.
   */
  public async findByProofKey(proofKey: string): Promise<UserDeviceEntity | null> {
    const all = await this.findMany({ includeDeleted: false });
    const match = all.find((d) => d.proof_key === proofKey);
    return match ?? null;
  }

  /**
   * Retrieves all registered devices for a given user.
   */
  public async findUserDevices(userId: string): Promise<UserDeviceEntity[]> {
    const all = await this.findMany({ includeDeleted: false });
    return all.filter((d) => d.user_id === userId);
  }

  /**
   * Updates last_seen_at timestamp and network IP for a recognized device.
   */
  public async touchDevice(
    deviceId: string,
    ip: string,
    userAgent: string
  ): Promise<UserDeviceEntity | null> {
    const device = await this.findById(deviceId);
    if (!device) return null;

    return await this.update(device.id, device.version, {
      last_seen_at: new Date().toISOString(),
      last_ip: ip,
      last_user_agent: userAgent,
    });
  }

  /**
   * Assigns a hashed confirmation code to an unrecognized device.
   */
  public async setConfirmationCode(
    deviceId: string,
    codeHash: string,
    expiresAt: string
  ): Promise<UserDeviceEntity | null> {
    const device = await this.findById(deviceId);
    if (!device) return null;

    return await this.update(device.id, device.version, {
      confirmation_code_hash: codeHash,
      confirmation_code_expires_at: expiresAt,
    });
  }

  /**
   * Marks a device as verified and trusted following successful code confirmation.
   */
  public async markTrusted(deviceId: string): Promise<UserDeviceEntity | null> {
    const device = await this.findById(deviceId);
    if (!device) return null;

    return await this.update(device.id, device.version, {
      is_trusted: true,
      confirmed_at: new Date().toISOString(),
      confirmation_code_hash: null,
      confirmation_code_expires_at: null,
    });
  }
}
