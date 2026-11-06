// path: tests/compliance/four-eye.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  computeDiff,
  canInitiateAction,
  canApproveAction,
  proposeHighRiskAction,
  approveHighRiskProposal,
  rejectHighRiskProposal,
  formatDiffForDisplay,
  getPendingProposals,
  getProposalById,
} from '@/lib/compliance/four-eye';
import { PendingApprovalRepository } from '@/lib/db/pending-approvals';
import { AuditLogRepository } from '@/lib/db/audit';
import { Role } from '@/lib/auth/roles';
import { POST as apiCreateProposal, GET as apiListProposals } from '@/app/api/compliance/pending-approvals/route';
import { POST as apiApproveProposal } from '@/app/api/compliance/pending-approvals/[id]/approve/route';
import { POST as apiRejectProposal } from '@/app/api/compliance/pending-approvals/[id]/reject/route';

describe('Step 063: Dual-Control & Four-Eye Review Framework', () => {
  let approvalRepo: PendingApprovalRepository;
  let auditRepo: AuditLogRepository;

  const INITIATOR_ID = '018f6c4c-3500-7fa1-b1e2-100000000001';
  const APPROVER_ID = '018f6c4c-3500-7fa1-b1e2-200000000002';
  const SUPERADMIN_ID = '018f6c4c-3500-7fa1-b1e2-999999999999';
  const COMPANY_ID = '018f6c4c-3500-7fa1-b1e2-123456789abc';

  beforeEach(() => {
    approvalRepo = new PendingApprovalRepository();
    auditRepo = new AuditLogRepository();
  });

  describe('Step 063.1: Table Schema & Proposal Model', () => {
    it('creates a high-risk tier override proposal with computed diff and pending status', async () => {
      const currentState = {
        risk_tier: 1,
        max_transaction_usd: 500,
        monthly_limit_usd: 2500,
        reserve_pct: 10,
      };

      const proposedPayload = {
        risk_tier: 2,
        max_transaction_usd: 2500,
        monthly_limit_usd: 15000,
        reserve_pct: 5,
      };

      const proposal = await proposeHighRiskAction(
        {
          company_id: COMPANY_ID,
          action_type: 'tier_override',
          target_id: COMPANY_ID,
          current_state: currentState,
          proposed_payload: proposedPayload,
          initiator_id: INITIATOR_ID,
          initiator_role: Role.COMPLIANCE_KYC,
          initiator_notes: 'Merchant satisfied Tier 2 requirements: 60 active days and zero fraud flags.',
        },
        { approvalRepo, auditRepo }
      );

      expect(proposal.id).toBeDefined();
      expect(proposal.action_type).toBe('tier_override');
      expect(proposal.status).toBe('pending');
      expect(proposal.initiator_id).toBe(INITIATOR_ID);
      expect(proposal.initiator_role).toBe(Role.COMPLIANCE_KYC);
      expect(proposal.approver_id).toBeNull();
      expect(proposal.approved_at).toBeNull();

      // Verify diff was computed accurately
      expect(proposal.diff_summary).toHaveLength(4);
      const tierDiff = proposal.diff_summary.find((d) => d.field === 'risk_tier');
      expect(tierDiff).toEqual({
        field: 'risk_tier',
        oldValue: 1,
        newValue: 2,
        changeType: 'modified',
      });
    });

    it('rejects proposal initiation when role lacks authority', async () => {
      await expect(
        proposeHighRiskAction(
          {
            company_id: COMPANY_ID,
            action_type: 'tier_override',
            current_state: {},
            proposed_payload: { risk_tier: 2 },
            initiator_id: INITIATOR_ID,
            initiator_role: Role.SUPPORT, // Support has no KYC or tier authority
          },
          { approvalRepo, auditRepo }
        )
      ).rejects.toThrow(/Unauthorized: Role "support" cannot propose "tier_override"/);
    });
  });

  describe('Step 063.2 & Quality Gate: Initiator-Approver Four-Eye Validation', () => {
    it('Verification & Quality Gate: Initiate tier override proposal; attempt approval with same actor ID and verify system blocks action', async () => {
      // 1. Initiate tier override proposal by compliance officer
      const proposal = await proposeHighRiskAction(
        {
          company_id: COMPANY_ID,
          action_type: 'tier_override',
          target_id: COMPANY_ID,
          current_state: { risk_tier: 1 },
          proposed_payload: { risk_tier: 2 },
          initiator_id: INITIATOR_ID,
          initiator_role: Role.COMPLIANCE_KYC,
          initiator_notes: 'Requesting upgrade to Tier 2 based on clean chargeback track record.',
        },
        { approvalRepo, auditRepo }
      );

      // 2. Attempt self-approval using the exact same initiator actor ID
      await expect(
        approveHighRiskProposal(
          {
            proposalId: proposal.id,
            approverId: INITIATOR_ID, // SAME ACTOR ID!
            approverRole: Role.SUPER_ADMIN, // Even with super_admin role!
            approvalNotes: 'Self-approval attempt.',
          },
          { approvalRepo, auditRepo }
        )
      ).rejects.toThrow(
        /Dual-control violation: actor ".*" cannot approve a proposal they initiated\. A distinct approver is required under the four-eye review framework\./
      );

      // 3. Verify proposal status remains strictly 'pending' and unexecuted
      const unmodified = await getProposalById(proposal.id, { approvalRepo });
      expect(unmodified?.status).toBe('pending');
      expect(unmodified?.approver_id).toBeNull();
      expect(unmodified?.approved_at).toBeNull();
    });

    it('successfully approves proposal when reviewed by a distinct authorized actor (CEO)', async () => {
      // 1. Initiate proposal
      const proposal = await proposeHighRiskAction(
        {
          company_id: COMPANY_ID,
          action_type: 'tier_override',
          target_id: COMPANY_ID,
          current_state: { risk_tier: 1 },
          proposed_payload: { risk_tier: 2 },
          initiator_id: INITIATOR_ID,
          initiator_role: Role.COMPLIANCE_KYC,
        },
        { approvalRepo, auditRepo }
      );

      // 2. Approve by distinct actor (CEO)
      const approved = await approveHighRiskProposal(
        {
          proposalId: proposal.id,
          approverId: APPROVER_ID, // DISTINCT ACTOR!
          approverRole: Role.CEO,
          approvalNotes: 'Verified financial volume history. Approved.',
        },
        { approvalRepo, auditRepo }
      );

      expect(approved.status).toBe('approved');
      expect(approved.approver_id).toBe(APPROVER_ID);
      expect(approved.approver_role).toBe(Role.CEO);
      expect(approved.approval_notes).toContain('Approved');
      expect(approved.approved_at).toBeDefined();
      expect(approved.executed_at).toBeDefined();
    });

    it('rejects approval when approver lacks requisite approval role authority', async () => {
      const proposal = await proposeHighRiskAction(
        {
          company_id: COMPANY_ID,
          action_type: 'tier_override',
          current_state: { risk_tier: 1 },
          proposed_payload: { risk_tier: 2 },
          initiator_id: INITIATOR_ID,
          initiator_role: Role.COMPLIANCE_KYC,
        },
        { approvalRepo, auditRepo }
      );

      // Finance Ops cannot approve tier overrides (CEO or Super Admin only)
      await expect(
        approveHighRiskProposal(
          {
            proposalId: proposal.id,
            approverId: APPROVER_ID,
            approverRole: Role.FINANCE_OPS,
          },
          { approvalRepo, auditRepo }
        )
      ).rejects.toThrow(/Unauthorized: Role "finance_ops" cannot approve "tier_override"/);
    });

    it('rejects approval if proposal is not in pending state', async () => {
      const proposal = await proposeHighRiskAction(
        {
          company_id: COMPANY_ID,
          action_type: 'tier_override',
          proposed_payload: { risk_tier: 2 },
          initiator_id: INITIATOR_ID,
          initiator_role: Role.COMPLIANCE_KYC,
        },
        { approvalRepo, auditRepo }
      );

      // First approve
      await approveHighRiskProposal(
        {
          proposalId: proposal.id,
          approverId: APPROVER_ID,
          approverRole: Role.CEO,
        },
        { approvalRepo, auditRepo }
      );

      // Second attempt to approve already approved proposal
      await expect(
        approveHighRiskProposal(
          {
            proposalId: proposal.id,
            approverId: SUPERADMIN_ID,
            approverRole: Role.SUPER_ADMIN,
          },
          { approvalRepo, auditRepo }
        )
      ).rejects.toThrow(/Cannot approve proposal in "approved" state/);
    });
  });

  describe('Step 063.3: Diff Calculation & Review API', () => {
    it('computes granular field-level additions, modifications, and removals', () => {
      const current = {
        tier: 1,
        payout_delay_days: 7,
        legacy_field: 'to_be_removed',
      };

      const proposed = {
        tier: 2,
        payout_delay_days: 3,
        new_feature_enabled: true,
      };

      const diffs = computeDiff(current, proposed);
      expect(diffs).toHaveLength(4);

      const modTier = diffs.find((d) => d.field === 'tier');
      expect(modTier?.changeType).toBe('modified');
      expect(modTier?.oldValue).toBe(1);
      expect(modTier?.newValue).toBe(2);

      const added = diffs.find((d) => d.field === 'new_feature_enabled');
      expect(added?.changeType).toBe('added');
      expect(added?.newValue).toBe(true);

      const removed = diffs.find((d) => d.field === 'legacy_field');
      expect(removed?.changeType).toBe('removed');
      expect(removed?.oldValue).toBe('to_be_removed');
    });

    it('formats diff for UI and human review correctly', () => {
      const diffs = computeDiff({ fee_pct: 2.9 }, { fee_pct: 2.5 });
      const display = formatDiffForDisplay(diffs);
      expect(display).toContain('~ [MODIFIED] fee_pct: 2.9 -> 2.5');
    });

    it('exposes API endpoints for proposal creation, diff listing, approval and rejection', async () => {
      // 1. Create proposal via POST /api/compliance/pending-approvals
      const createReq = new NextRequest('http://localhost:3000/api/compliance/pending-approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          company_id: COMPANY_ID,
          action_type: 'fee_change',
          current_state: { platform_fee_bps: 30 },
          proposed_payload: { platform_fee_bps: 25 },
          initiator_id: INITIATOR_ID,
          initiator_role: Role.CEO,
          initiator_notes: 'Volume discount approved for enterprise partner.',
        }),
      });

      const createRes = await apiCreateProposal(createReq);
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      expect(createBody.success).toBe(true);
      expect(createBody.data.id).toBeDefined();
      const proposalId = createBody.data.id;

      // 2. Query proposals via GET /api/compliance/pending-approvals
      const listReq = new NextRequest('http://localhost:3000/api/compliance/pending-approvals', {
        headers: { 'x-user-role': 'super_admin' },
      });
      const listRes = await apiListProposals(listReq);
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.count).toBeGreaterThanOrEqual(1);

      // 3. Attempt self-approval via API -> Expect 403 Forbidden with dual-control error
      const selfApproveReq = new NextRequest(
        `http://localhost:3000/api/compliance/pending-approvals/${proposalId}/approve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            approver_id: INITIATOR_ID, // SAME ID!
            approver_role: Role.SUPER_ADMIN,
          }),
        }
      );
      const selfApproveRes = await apiApproveProposal(selfApproveReq, {
        params: { id: proposalId },
      });
      expect(selfApproveRes.status).toBe(403);
      const selfApproveBody = await selfApproveRes.json();
      expect(selfApproveBody.error).toBe('Dual Control Violation');
      expect(selfApproveBody.message).toContain('Dual-control violation');

      // 4. Approve via API with distinct actor (Super Admin)
      const validApproveReq = new NextRequest(
        `http://localhost:3000/api/compliance/pending-approvals/${proposalId}/approve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            approver_id: APPROVER_ID,
            approver_role: Role.SUPER_ADMIN,
            approval_notes: 'Confirmed by Super Admin.',
          }),
        }
      );
      const validApproveRes = await apiApproveProposal(validApproveReq, {
        params: { id: proposalId },
      });
      expect(validApproveRes.status).toBe(200);
      const validApproveBody = await validApproveRes.json();
      expect(validApproveBody.success).toBe(true);
      expect(validApproveBody.data.status).toBe('approved');
    });

    it('rejects proposal via reject endpoint with required rejection reason', async () => {
      // Create proposal via API endpoint so it uses the shared default repository
      const createReq = new NextRequest('http://localhost:3000/api/compliance/pending-approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          company_id: COMPANY_ID,
          action_type: 'large_payout',
          proposed_payload: { amount_usd: 50000 },
          initiator_id: INITIATOR_ID,
          initiator_role: Role.FINANCE_OPS,
          initiator_notes: 'Large payout proposal for review.',
        }),
      });

      const createRes = await apiCreateProposal(createReq);
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const proposalId = createBody.data.id;

      const rejectReq = new NextRequest(
        `http://localhost:3000/api/compliance/pending-approvals/${proposalId}/reject`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            approver_id: APPROVER_ID,
            approver_role: Role.CEO,
            rejection_reason: 'Pending documentation from bank regarding high volume deposit.',
          }),
        }
      );

      const rejectRes = await apiRejectProposal(rejectReq, {
        params: { id: proposalId },
      });
      expect(rejectRes.status).toBe(200);
      const rejectBody = await rejectRes.json();
      expect(rejectBody.success).toBe(true);
      expect(rejectBody.data.status).toBe('rejected');
      expect(rejectBody.data.rejection_reason).toContain('Pending documentation');
    });

  });

  describe('Step 063.4: Administrator Self-Approval Prohibition', () => {
    it('strictly forbids super_admin from approving their own high-risk proposal', async () => {
      // Super admin initiates a platform fee change proposal
      const proposal = await proposeHighRiskAction(
        {
          company_id: null, // Platform-wide
          action_type: 'fee_change',
          current_state: { interchange_plus_bps: 20 },
          proposed_payload: { interchange_plus_bps: 15 },
          initiator_id: SUPERADMIN_ID,
          initiator_role: Role.SUPER_ADMIN,
          initiator_notes: 'Lowering platform interchange fee.',
        },
        { approvalRepo, auditRepo }
      );

      // Super admin attempts to sign off on their own proposal
      await expect(
        approveHighRiskProposal(
          {
            proposalId: proposal.id,
            approverId: SUPERADMIN_ID,
            approverRole: Role.SUPER_ADMIN,
          },
          { approvalRepo, auditRepo }
        )
      ).rejects.toThrow(/Dual-control violation/);

      // CEO signs off -> allowed!
      const approved = await approveHighRiskProposal(
        {
          proposalId: proposal.id,
          approverId: APPROVER_ID,
          approverRole: Role.CEO,
          approvalNotes: 'CEO counter-signature verified.',
        },
        { approvalRepo, auditRepo }
      );

      expect(approved.status).toBe('approved');
      expect(approved.initiator_id).toBe(SUPERADMIN_ID);
      expect(approved.approver_id).toBe(APPROVER_ID);
    });
  });

  describe('Audit Trail Verification', () => {
    it('records immutable audit events for proposal creation and approval', async () => {
      const proposal = await proposeHighRiskAction(
        {
          company_id: COMPANY_ID,
          action_type: 'tier_override',
          proposed_payload: { risk_tier: 3 },
          initiator_id: INITIATOR_ID,
          initiator_role: Role.COMPLIANCE_KYC,
        },
        { approvalRepo, auditRepo }
      );

      await approveHighRiskProposal(
        {
          proposalId: proposal.id,
          approverId: APPROVER_ID,
          approverRole: Role.CEO,
          approvalNotes: 'Audit test approval.',
        },
        { approvalRepo, auditRepo }
      );

      const logs = await auditRepo.findByActor(APPROVER_ID);
      expect(logs.length).toBeGreaterThanOrEqual(1);
      const approveLog = logs.find((l) => l.action === 'FOUR_EYE_PROPOSAL_APPROVED');
      expect(approveLog).toBeDefined();
      expect(approveLog?.payload.actionType).toBe('tier_override');
      expect(approveLog?.payload.initiatorId).toBe(INITIATOR_ID);
    });
  });

});
