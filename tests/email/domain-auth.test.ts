// path: tests/email/domain-auth.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerDomainAuth,
  verifyDomainRecords,
  assertDomainVerifiedForLaunch,
  getDomainAuth,
  resetDomainAuthStore,
  DomainNotVerifiedForLaunchError,
} from '@/lib/email/domain-auth';

describe('Domain Authentication SPF/DKIM/DMARC Verification Gate (Step 151)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const superAdminId = '99999999-9999-4999-8999-999999999999';
  const supportUserId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    resetDomainAuthStore();
  });

  describe('Domain Purpose Segmentation & Registration (Step 151.1)', () => {
    it('registers separate domains for transactional and marketing sending', async () => {
      // Transactional domain registration
      const txDomain = await registerDomainAuth({
        tenantId,
        domainPurpose: 'transactional',
        domainName: 'tx.kdsolution.example.com',
        spfRecord: 'v=spf1 include:_spf.kdsolution.example.com ~all',
        dkimSelector: 'k1',
        dkimRecord: 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3...',
        dmarcRecord: 'v=DMARC1; p=reject; rua=mailto:dmarc@kdsolution.example.com',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      // Marketing domain registration
      const mktDomain = await registerDomainAuth({
        tenantId,
        domainPurpose: 'marketing',
        domainName: 'marketing.kdsolution.example.com',
        spfRecord: 'v=spf1 include:mail.sendgrid.net -all',
        dkimSelector: 's1',
        dkimRecord: 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC9...',
        dmarcRecord: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@kdsolution.example.com',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      expect(txDomain.id).toBeDefined();
      expect(txDomain.domainPurpose).toBe('transactional');
      expect(txDomain.isVerifiedForLaunch).toBe(false);

      expect(mktDomain.id).toBeDefined();
      expect(mktDomain.domainPurpose).toBe('marketing');
      expect(mktDomain.isVerifiedForLaunch).toBe(false);

      const fetchedTx = await getDomainAuth(tenantId, 'transactional');
      const fetchedMkt = await getDomainAuth(tenantId, 'marketing');

      expect(fetchedTx?.domainName).toBe('tx.kdsolution.example.com');
      expect(fetchedMkt?.domainName).toBe('marketing.kdsolution.example.com');
    });

    it('denies non-super_admin actors from registering domain authentication', async () => {
      await expect(
        registerDomainAuth({
          tenantId,
          domainPurpose: 'transactional',
          domainName: 'mail.kdsolution.com',
          spfRecord: 'v=spf1 ~all',
          dkimSelector: 'k1',
          dkimRecord: 'v=DKIM1; p=key',
          dmarcRecord: 'v=DMARC1; p=none',
          actorUserId: supportUserId,
          actorRole: 'support',
        })
      ).rejects.toThrow(/Only super_admin can configure email domain authentication/);
    });
  });

  describe('SPF, DKIM, and DMARC Verification Gate (Step 151.2)', () => {
    it('blocks launch if domain records have not been verified', async () => {
      await registerDomainAuth({
        tenantId,
        domainPurpose: 'transactional',
        domainName: 'unverified.kdsolution.com',
        spfRecord: 'v=spf1 ~all',
        dkimSelector: 'k1',
        dkimRecord: 'v=DKIM1; p=key',
        dmarcRecord: 'v=DMARC1; p=reject',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      await expect(
        assertDomainVerifiedForLaunch(tenantId, 'transactional')
      ).rejects.toThrow(DomainNotVerifiedForLaunchError);

      await expect(
        assertDomainVerifiedForLaunch(tenantId, 'transactional')
      ).rejects.toThrow(/SPF, DKIM and DMARC verification are mandatory before launch/);
    });

    it('rejects verification if SPF record is malformed or missing enforcement directive', async () => {
      const record = await registerDomainAuth({
        tenantId,
        domainPurpose: 'transactional',
        domainName: 'badspf.kdsolution.com',
        spfRecord: 'ip4:192.0.2.1', // Missing v=spf1 and ~all/-all
        dkimSelector: 'k1',
        dkimRecord: 'v=DKIM1; p=validpubkey',
        dmarcRecord: 'v=DMARC1; p=reject',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      const result = await verifyDomainRecords(record.id, superAdminId);
      expect(result.isVerifiedForLaunch).toBe(false);
      expect(result.spfStatus).toBe('invalid');
      expect(result.details.spfError).toContain('SPF record must begin with v=spf1');

      await expect(
        assertDomainVerifiedForLaunch(tenantId, 'transactional')
      ).rejects.toThrow(DomainNotVerifiedForLaunchError);
    });

    it('approves verification for launch when SPF, DKIM, and DMARC are all strictly valid', async () => {
      const record = await registerDomainAuth({
        tenantId,
        domainPurpose: 'transactional',
        domainName: 'mail.kdsolution.com',
        spfRecord: 'v=spf1 include:_spf.provider.com -all',
        dkimSelector: 'selector1',
        dkimRecord: 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ...',
        dmarcRecord: 'v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      const result = await verifyDomainRecords(record.id, superAdminId);
      expect(result.isVerifiedForLaunch).toBe(true);
      expect(result.spfStatus).toBe('valid');
      expect(result.dkimStatus).toBe('valid');
      expect(result.dmarcStatus).toBe('valid');

      const verifiedRecord = await assertDomainVerifiedForLaunch(tenantId, 'transactional');
      expect(verifiedRecord.isVerifiedForLaunch).toBe(true);
      expect(verifiedRecord.verifiedAt).toBeDefined();
    });
  });
});
