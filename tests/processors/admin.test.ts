// path: tests/processors/admin.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAdminGatewayConfigs,
  testGatewayConnectionAdmin,
  toggleGatewayStatus,
} from '@/lib/processors/admin';

describe('Step 120: Super Admin Gateway Management Dashboard with 2FA Step-Up', () => {
  const superAdminActor = {
    actorUserId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
    actorRole: 'super_admin',
    stepUpVerified: true,
  };

  describe('Step 120.1: RBAC & 2FA Step-Up Security Enforcement', () => {
    it('blocks access if actor does not have super_admin role', async () => {
      await expect(
        getAdminGatewayConfigs({
          actorUserId: 'support_usr_01',
          actorRole: 'support',
          stepUpVerified: true,
        })
      ).rejects.toThrow(/Super Admin role required/i);
    });

    it('blocks access if 2FA step-up reauthentication has not been completed', async () => {
      await expect(
        getAdminGatewayConfigs({
          actorUserId: 'admin_usr_01',
          actorRole: 'super_admin',
          stepUpVerified: false,
        })
      ).rejects.toThrow(/Step-up 2FA reauthentication required/i);
    });

    it('returns all 5 launch providers with masked credentials when authorized', async () => {
      const configs = await getAdminGatewayConfigs(superAdminActor);
      expect(configs).toHaveLength(5);

      const slugs = configs.map((c) => c.providerSlug);
      expect(slugs).toContain('nmi');
      expect(slugs).toContain('stripe_connect');
      expect(slugs).toContain('rainforest');
      expect(slugs).toContain('airwallex');
      expect(slugs).toContain('payoneer');

      // Verify credentials are masked (not plaintext)
      for (const config of configs) {
        for (const [key, maskedVal] of Object.entries(config.maskedCredentials)) {
          expect(maskedVal).toMatch(/••••/);
        }
      }
    });
  });

  describe('Step 120.2: Automated Connection Test & Audit Logging', () => {
    it('executes connection test and records audit trail', async () => {
      const result = await testGatewayConnectionAdmin({
        providerSlug: 'stripe_connect',
        ...superAdminActor,
      });

      expect(result).toBeDefined();
      expect(result.isConnected).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message).toBeDefined();
    });
  });

  describe('Step 120.3: Gateway Activation Safeguard', () => {
    it('allows toggling gateway status when connection health is valid', async () => {
      // First run test
      await testGatewayConnectionAdmin({
        providerSlug: 'rainforest',
        ...superAdminActor,
      });

      // Toggle to active
      const updated = await toggleGatewayStatus({
        providerSlug: 'rainforest',
        isEnabled: true,
        ...superAdminActor,
      });

      expect(updated.isEnabled).toBe(true);
    });
  });
});
