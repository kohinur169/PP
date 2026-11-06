// path: tests/idv/registry.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  switchActiveIdvVendor,
  getActiveIdvAdapter,
  dispatchKycVerification,
} from '@/lib/idv/registry';
import { MockIdvAdapter } from '@/lib/idv/mock';

describe('Step 102: IDV Vendor Registry & Single-Active-Provider Super Admin Switch', () => {
  const tenantId = '018f6c4c-3500-7fa1-b1e2-123456789abc';
  const superAdminId = '018f6c4c-3500-7fa1-b1e2-000000000001';

  beforeEach(async () => {
    // Reset to none
    await switchActiveIdvVendor({
      tenantId,
      vendor: 'none',
      totpCode: '123456',
      updatedBy: superAdminId,
    });
  });

  describe('Step 102.1 & Step 102.2: 2FA Protected Vendor Switching', () => {
    it('rejects vendor switch when 2FA code is malformed or invalid', async () => {
      await expect(
        switchActiveIdvVendor({
          tenantId,
          vendor: 'jumio',
          totpCode: '123', // Not 6 digits
          updatedBy: superAdminId,
        })
      ).rejects.toThrow('Invalid 2FA step-up confirmation code');

      await expect(
        switchActiveIdvVendor({
          tenantId,
          vendor: 'didit',
          totpCode: '000000', // Disallowed placeholder
          updatedBy: superAdminId,
        })
      ).rejects.toThrow('Invalid 2FA step-up confirmation code');
    });

    it('successfully switches active vendor to jumio, didit, or sumsub with valid 2FA', async () => {
      const record = await switchActiveIdvVendor({
        tenantId,
        vendor: 'jumio',
        credentials: { apiToken: 'tok_live_123', apiSecret: 'sec_live_456' },
        totpCode: '852963',
        updatedBy: superAdminId,
      });

      expect(record.activeVendor).toBe('jumio');
      expect(record.credentials.apiToken).toBe('tok_live_123');

      const adapter = await getActiveIdvAdapter(tenantId);
      expect(adapter?.vendor).toBe('jumio');
    });
  });

  describe('Step 102.3: Upstream Payment Processor Rejection Precedence Guard', () => {
    it('blocks supplementary IDV check when payment processor has rejected KYB', async () => {
      // Configure active vendor
      await switchActiveIdvVendor({
        tenantId,
        vendor: 'didit',
        totpCode: '654321',
        updatedBy: superAdminId,
      });

      const dispatch = await dispatchKycVerification({
        tenantId,
        request: {
          userId: 'user_merchant_01',
          companyId: 'company_01',
          userEmail: 'director@example.com',
          userFullName: 'Elena Rostova',
        },
        processorKybDecision: 'rejected', // UPSTREAM REJECTION
      });

      expect(dispatch.dispatched).toBe(false);
      expect(dispatch.routing).toBe('BLOCKED_BY_PROCESSOR_REJECTION');
      expect(dispatch.reason).toContain('Payment processor has formally rejected KYB');
    });
  });

  describe('Step 102.4: Fallback to Manual Compliance Review Queue', () => {
    it('routes cleanly to manual compliance review when active vendor is none', async () => {
      await switchActiveIdvVendor({
        tenantId,
        vendor: 'none',
        totpCode: '987654',
        updatedBy: superAdminId,
      });

      const dispatch = await dispatchKycVerification({
        tenantId,
        request: {
          userId: 'user_merchant_02',
          companyId: 'company_02',
          userEmail: 'owner@example.com',
          userFullName: 'Arthur Pendelton',
        },
        processorKybDecision: 'approved',
      });

      expect(dispatch.dispatched).toBe(false);
      expect(dispatch.routing).toBe('MANUAL_COMPLIANCE_REVIEW');
      expect(dispatch.vendor).toBe('none');
      expect(dispatch.reason).toContain('No supplementary IDV vendor is active');
    });

    it('enforces fail-closed: routes to manual compliance queue if vendor session initiation throws', async () => {
      // Mock an adapter that fails during network call
      const failingMock = new MockIdvAdapter();
      failingMock.initiateVerificationSession = async () => {
        throw new Error('IDV vendor network connection timed out');
      };

      const dispatch = await dispatchKycVerification({
        tenantId,
        request: {
          userId: 'user_merchant_03',
          companyId: 'company_03',
          userEmail: 'owner3@example.com',
          userFullName: 'John Smith',
        },
        adapterOverride: failingMock,
      });

      expect(dispatch.dispatched).toBe(false);
      expect(dispatch.routing).toBe('MANUAL_COMPLIANCE_REVIEW');
      expect(dispatch.reason).toContain('fail-closed security policy');
    });

    it('dispatches automated vendor session when active vendor is operational', async () => {
      const operationalMock = new MockIdvAdapter();

      const dispatch = await dispatchKycVerification({
        tenantId,
        request: {
          userId: 'user_merchant_04',
          companyId: 'company_04',
          userEmail: 'owner4@example.com',
          userFullName: 'Alice Walker',
        },
        adapterOverride: operationalMock,
      });

      expect(dispatch.dispatched).toBe(true);
      expect(dispatch.routing).toBe('AUTOMATED_VENDOR');
      expect(dispatch.session).toBeDefined();
      expect(dispatch.session?.redirectUrl).toBeDefined();
    });
  });
});
