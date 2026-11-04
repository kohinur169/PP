// path: tests/office/ceo-dashboard.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Role, Permission, hasPermission } from '@/lib/auth/roles';
import {
  executeCeoKycSignOff,
  rejectCeoKyc,
  proposeGovernancePolicy,
  signOffGovernancePolicy,
  seedKycPacketForTest,
  seedGovernanceProposalForTest,
  resetCeoDataForTest,
  listPendingKycPackets,
  getKycPacketById,
  getAllowedOperatingCountries,
  KycPacket,
} from '@/lib/office/ceo-approvals';
import { verifyAuditSignature } from '@/lib/security/audit-signer';
import { CompanyRepository } from '@/lib/db/companies';
import { AuditLogRepository } from '@/lib/db/audit';
import { POST as kycSignOffPostHandler } from '@/app/api/office/ceo/approvals/kyc/[id]/route';
import { POST as governancePostHandler } from '@/app/api/office/ceo/governance/route';

describe('Step 067: CEO Executive Approval & Oversight Dashboard', () => {
  let companyRepo: CompanyRepository;
  let auditRepo: AuditLogRepository;

  const CEO_USER_ID = '018f6c4c-3500-7fa1-b1e2-200000000001';
  const SUPER_ADMIN_ID = '018f6c4c-3500-7fa1-b1e2-000000000002';
  const SUPPORT_USER_ID = '018f6c4c-3500-7fa1-b1e2-300000000003';

  const SAMPLE_COMPANY_ID = '018f6c4c-3500-7fa1-b1e2-123456789abc';
  const SAMPLE_PACKET_ID = 'kyc_018f6c4c-3500-7fa1-b1e2-000000000001';

  beforeEach(async () => {
    companyRepo = new CompanyRepository();
    auditRepo = new AuditLogRepository();
    resetCeoDataForTest();

    // Seed merchant company under review
    await companyRepo.createCompany({
      company_id: SAMPLE_COMPANY_ID,
      legal_name: 'Acme Digital Goods LLC',
      dba_name: 'Acme Software',
      business_type: 'llc',
      registration_number: 'US-REG-CEO-001',
      country: 'US',
      operating_address: {
        street1: '100 Market St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      },
      mcc: '5734',
      risk_tier: 1,
      status: 'under_review',
      custom_fee_percent: '2.5000',
      custom_hold_days: 7,
      reserve_percent: '5.0000',
      reserve_hold_days: 180,
      default_currency: 'USD',
    });

    // Seed KYC packet
    const packet: KycPacket = {
      id: SAMPLE_PACKET_ID,
      companyId: SAMPLE_COMPANY_ID,
      legalName: 'Acme Digital Goods LLC',
      dbaName: 'Acme Software',
      country: 'US',
      mcc: '5734',
      riskTier: 1,
      underwritingSummary: 'SaaS subscription merchant with projected $120k monthly volume.',
      complianceOfficerRecommendation: 'Recommended for Tier 1 onboarding.',
      status: 'pending_ceo_approval',
      submittedAt: '2026-11-04T09:00:00.000Z',
    };
    seedKycPacketForTest(packet);
  });

  describe('Step 067.1: CEO Layout & Executive Permission Matrix', () => {
    it('verifies CEO role possesses executive permissions for KYC approval and governance', () => {
      expect(hasPermission(Role.CEO, Permission.APPROVE_KYC)).toBe(true);
      expect(hasPermission(Role.CEO, Permission.VIEW_KYC)).toBe(true);
      expect(hasPermission(Role.CEO, Permission.ENABLE_DISABLE_COUNTRY)).toBe(true);
      expect(hasPermission(Role.CEO, Permission.APPROVE_PRICING_CHANGE)).toBe(true);
      expect(hasPermission(Role.CEO, Permission.APPROVE_LARGE_PAYOUT)).toBe(true);
    });

    it('verifies Support and Blogger roles are strictly denied from executive KYC approval', () => {
      expect(hasPermission(Role.SUPPORT, Permission.APPROVE_KYC)).toBe(false);
      expect(hasPermission(Role.BLOGGER, Permission.APPROVE_KYC)).toBe(false);
      expect(hasPermission(Role.FINANCE_OPS, Permission.APPROVE_KYC)).toBe(false);
    });
  });

  describe('Step 067.2 & Step 067.4: KYC Final Approval & Ed25519 Digital Sign-Off', () => {
    it('lists pending KYC underwriting packets for CEO oversight', async () => {
      const packets = await listPendingKycPackets();
      expect(packets.length).toBeGreaterThanOrEqual(1);
      const found = packets.find((p) => p.id === SAMPLE_PACKET_ID);
      expect(found).toBeDefined();
      expect(found?.status).toBe('pending_ceo_approval');
      expect(found?.legalName).toBe('Acme Digital Goods LLC');
    });

    it('denies unauthorized staff roles from executing KYC final sign-off', async () => {
      await expect(
        executeCeoKycSignOff({
          packetId: SAMPLE_PACKET_ID,
          actorId: SUPPORT_USER_ID,
          actorRole: Role.SUPPORT,
          companyRepo,
          auditRepo,
        })
      ).rejects.toThrow(/Access Denied/);
    });

    it('executes CEO digital sign-off with Ed25519 signature and unlocks company provisioning', async () => {
      const result = await executeCeoKycSignOff({
        packetId: SAMPLE_PACKET_ID,
        actorId: CEO_USER_ID,
        actorRole: Role.CEO,
        notes: 'Underwriting documents verified. Low chargeback risk SaaS model.',
        companyRepo,
        auditRepo,
      });

      expect(result.success).toBe(true);
      expect(result.packet.status).toBe('approved');
      expect(result.signature).toBeDefined();
      expect(typeof result.signature).toBe('string');
      expect(result.signature.length).toBeGreaterThan(60);

      // Verify Ed25519 signature validity
      const isValid = verifyAuditSignature(result.decisionHash, result.signature);
      expect(isValid).toBe(true);

      // Verify sub-merchant company status transitioned from 'under_review' to 'active'
      const updatedCompany = await companyRepo.findById(SAMPLE_COMPANY_ID);
      expect(updatedCompany?.status).toBe('active');

      // Verify audit log
      const logs = await auditRepo.findMany();
      const kycLog = logs.find((l) => l.action === 'KYC_VERIFICATION_DECISION');
      expect(kycLog).toBeDefined();
      expect(kycLog?.actor_id).toBe(CEO_USER_ID);
      expect(kycLog?.signature).toBe(result.signature);
      expect(kycLog?.payload.decision).toBe('approved');
      expect(kycLog?.payload.unlockedProvisioning).toBe(true);
    });

    it('allows CEO to reject KYC packet with mandatory justification reason', async () => {
      const rejectedPacket = await rejectCeoKyc({
        packetId: SAMPLE_PACKET_ID,
        actorId: CEO_USER_ID,
        actorRole: Role.CEO,
        reason: 'Unable to verify ultimate beneficial owner (UBO) identity docs.',
        auditRepo,
      });

      expect(rejectedPacket.status).toBe('rejected');
      expect(rejectedPacket.rejectionReason).toContain('Unable to verify ultimate beneficial owner');

      const logs = await auditRepo.findMany();
      const rejectLog = logs.find((l) => l.action === 'KYC_VERIFICATION_DECISION');
      expect(rejectLog).toBeDefined();
      expect(rejectLog?.payload.decision).toBe('rejected');
    });
  });

  describe('Step 067.3: Joint Governance Dual-Control Enforcement', () => {
    it('allows Super Admin to propose a country expansion policy', async () => {
      const proposal = await proposeGovernancePolicy({
        type: 'country_enable_disable',
        title: 'Enable New Zealand (NZ)',
        payload: { allowedCountries: ['US', 'SG', 'GB', 'CA', 'AU', 'EU', 'NZ'] },
        actorId: SUPER_ADMIN_ID,
        actorRole: Role.SUPER_ADMIN,
        auditRepo,
      });

      expect(proposal.id).toBeDefined();
      expect(proposal.status).toBe('pending_signoff');
      expect(proposal.proposedByRole).toBe(Role.SUPER_ADMIN);
    });

    it('enforces four-eye check: proposer cannot sign off their own proposal', async () => {
      const proposal = await proposeGovernancePolicy({
        type: 'pricing_structure',
        title: 'Tier 3 Baseline Adjustment',
        payload: { reservePercent: '12.0000' },
        actorId: CEO_USER_ID,
        actorRole: Role.CEO,
        auditRepo,
      });

      // CEO attempts to approve their own proposal!
      await expect(
        signOffGovernancePolicy({
          proposalId: proposal.id,
          actorId: CEO_USER_ID, // SAME ACTOR!
          actorRole: Role.CEO,
          auditRepo,
        })
      ).rejects.toThrow(/Four-eye governance violation: Proposer cannot approve their own policy proposal/);
    });

    it('requires CEO sign-off on policies proposed by Super Admin, activating policy and signing with Ed25519', async () => {
      const proposal = await proposeGovernancePolicy({
        type: 'country_enable_disable',
        title: 'Enable Japan (JP) Corridor',
        payload: { allowedCountries: ['US', 'SG', 'GB', 'CA', 'AU', 'EU', 'JP'] },
        actorId: SUPER_ADMIN_ID,
        actorRole: Role.SUPER_ADMIN,
        auditRepo,
      });

      const signedProposal = await signOffGovernancePolicy({
        proposalId: proposal.id,
        actorId: CEO_USER_ID,
        actorRole: Role.CEO,
        auditRepo,
      });

      expect(signedProposal.status).toBe('active');
      expect(signedProposal.approvedBy).toBe(CEO_USER_ID);
      expect(signedProposal.approvedByRole).toBe(Role.CEO);
      expect(signedProposal.signature).toBeDefined();

      // Verify active allowed countries updated
      expect(getAllowedOperatingCountries()).toContain('JP');

      // Verify audit log
      const logs = await auditRepo.findMany();
      const policyLog = logs.find((l) => l.action === 'POLICY_APPROVED');
      expect(policyLog).toBeDefined();
      expect(policyLog?.signature).toBe(signedProposal.signature);
    });
  });

  describe('HTTP API Endpoints Integration Verification Gate', () => {
    it('POST /api/office/ceo/approvals/kyc/[id] returns 403 Forbidden for unauthorized roles', async () => {
      const request = new Request(`http://localhost:3000/api/office/ceo/approvals/kyc/${SAMPLE_PACKET_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': SUPPORT_USER_ID,
          'x-staff-role': 'support',
        },
        body: JSON.stringify({ action: 'approve' }),
      });

      const response = await kycSignOffPostHandler(request, { params: { id: SAMPLE_PACKET_ID } }, {
        companyRepo,
        auditRepo,
      });

      expect(response.status).toBe(403);
    });

    it('POST /api/office/ceo/approvals/kyc/[id] returns 200 OK and Ed25519 signature when signed by CEO', async () => {
      const request = new Request(`http://localhost:3000/api/office/ceo/approvals/kyc/${SAMPLE_PACKET_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': CEO_USER_ID,
          'x-staff-role': 'ceo',
        },
        body: JSON.stringify({
          action: 'approve',
          notes: 'Executive approval confirmed.',
        }),
      });

      const response = await kycSignOffPostHandler(request, { params: { id: SAMPLE_PACKET_ID } }, {
        companyRepo,
        auditRepo,
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.packet?.status).toBe('approved');
      expect(json.signature).toBeDefined();
    });

    it('POST /api/office/ceo/governance creates policy proposal and enforces dual-control', async () => {
      // 1. Super Admin proposes policy
      const proposeReq = new Request('http://localhost:3000/api/office/ceo/governance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': SUPER_ADMIN_ID,
          'x-staff-role': 'super_admin',
        },
        body: JSON.stringify({
          action: 'propose',
          type: 'country_enable_disable',
          title: 'Add Germany Direct Debit Corridor',
          payload: { allowedCountries: ['US', 'SG', 'GB', 'DE'] },
        }),
      });

      const proposeRes = await governancePostHandler(proposeReq, { auditRepo });
      expect(proposeRes.status).toBe(201);
      const proposeJson = await proposeRes.json();
      const proposalId = proposeJson.proposal.id;

      // 2. CEO signs off policy
      const signOffReq = new Request('http://localhost:3000/api/office/ceo/governance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': CEO_USER_ID,
          'x-staff-role': 'ceo',
        },
        body: JSON.stringify({
          action: 'signoff',
          proposalId,
        }),
      });

      const signOffRes = await governancePostHandler(signOffReq, { auditRepo });
      expect(signOffRes.status).toBe(200);
      const signOffJson = await signOffRes.json();
      expect(signOffJson.success).toBe(true);
      expect(signOffJson.proposal.status).toBe('active');
    });
  });
});
