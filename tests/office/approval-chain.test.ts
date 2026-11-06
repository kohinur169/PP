// path: tests/office/approval-chain.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initiateApprovalChain,
  advanceApprovalChain,
  rejectApprovalChain,
  getApprovalChainWorkflow,
  getDispatchedNotifications,
  clearDispatchedNotifications,
} from '@/lib/office/approval-chain';
import { ApprovalChainRepository } from '@/lib/db/approval-chains';
import { AuditLogRepository } from '@/lib/db/audit';
import { Role } from '@/lib/auth/roles';

describe('Step 064: Office Multi-Level Approval Chain Engine (Requester -> CEO -> Super Admin)', () => {
  let chainRepo: ApprovalChainRepository;
  let auditRepo: AuditLogRepository;

  const REQUESTER_ID = '018f6c4c-3500-7fa1-b1e2-100000000001';
  const CEO_ID = '018f6c4c-3500-7fa1-b1e2-200000000002';
  const SUPERADMIN_ID = '018f6c4c-3500-7fa1-b1e2-300000000003';
  const COMPANY_ID = '018f6c4c-3500-7fa1-b1e2-123456789abc';

  beforeEach(() => {
    chainRepo = new ApprovalChainRepository();
    auditRepo = new AuditLogRepository();
    clearDispatchedNotifications();
  });

  describe('Step 064.1: Approval Chains Table & Step Initialization', () => {
    it('initializes a 3-tier sequential approval workflow for a large payout', async () => {
      const payoutPayload = {
        payout_id: 'pay_018f6c4c3500',
        amount_usd: 25000,
        currency: 'USD',
        recipient_bank: 'JPMorgan Chase (****1234)',
      };

      const workflow = await initiateApprovalChain(
        {
          company_id: COMPANY_ID,
          action_type: 'large_payout',
          action_payload: payoutPayload,
          requester_id: REQUESTER_ID,
          requester_role: Role.FINANCE_OPS,
          requester_notes: 'Urgent merchant supplier release above standard threshold ($10,000).',
        },
        { chainRepo, auditRepo }
      );

      expect(workflow.chainId).toBeDefined();
      expect(workflow.totalSteps).toBe(3);
      expect(workflow.status).toBe('in_progress');
      expect(workflow.currentStepOrder).toBe(2);
      expect(workflow.nextRequiredRole).toBe(Role.CEO);

      // Verify individual steps
      const [step1, step2, step3] = workflow.steps;

      // Step 1: Requester
      expect(step1.step_order).toBe(1);
      expect(step1.required_role).toBe(Role.FINANCE_OPS);
      expect(step1.actor_id).toBe(REQUESTER_ID);
      expect(step1.status).toBe('approved');

      // Step 2: CEO (awaiting action)
      expect(step2.step_order).toBe(2);
      expect(step2.required_role).toBe(Role.CEO);
      expect(step2.actor_id).toBeNull();
      expect(step2.status).toBe('awaiting_action');

      // Step 3: Super Admin (pending Step 2)
      expect(step3.step_order).toBe(3);
      expect(step3.required_role).toBe(Role.SUPER_ADMIN);
      expect(step3.actor_id).toBeNull();
      expect(step3.status).toBe('pending');
    });
  });

  describe('Step 064.2 & Step 064.3: Workflow State Machine & Notification Dispatch', () => {
    it('dispatches notification to CEO upon initiation', async () => {
      const workflow = await initiateApprovalChain(
        {
          company_id: COMPANY_ID,
          action_type: 'large_payout',
          action_payload: { amount_usd: 15000 },
          requester_id: REQUESTER_ID,
          requester_role: Role.FINANCE_OPS,
        },
        { chainRepo, auditRepo }
      );

      const notifications = getDispatchedNotifications();
      expect(notifications.length).toBe(1);
      const ceoNotif = notifications[0];
      expect(ceoNotif.recipientRole).toBe(Role.CEO);
      expect(ceoNotif.chainId).toBe(workflow.chainId);
      expect(ceoNotif.subject).toContain('Step 2 Approval Pending');
    });

    it('blocks requester from self-approving Step 2 under dual-control enforcement', async () => {
      const workflow = await initiateApprovalChain(
        {
          company_id: COMPANY_ID,
          action_type: 'large_payout',
          action_payload: { amount_usd: 20000 },
          requester_id: REQUESTER_ID,
          requester_role: Role.FINANCE_OPS,
        },
        { chainRepo, auditRepo }
      );

      await expect(
        advanceApprovalChain(
          {
            chainId: workflow.chainId,
            actorId: REQUESTER_ID, // SAME AS REQUESTER!
            actorRole: Role.CEO,
          },
          { chainRepo, auditRepo }
        )
      ).rejects.toThrow(/Dual-control violation: original requester ".*" cannot approve subsequent steps/);
    });

    it('blocks unauthorized roles from advancing Step 2', async () => {
      const workflow = await initiateApprovalChain(
        {
          company_id: COMPANY_ID,
          action_type: 'large_payout',
          action_payload: { amount_usd: 20000 },
          requester_id: REQUESTER_ID,
          requester_role: Role.FINANCE_OPS,
        },
        { chainRepo, auditRepo }
      );

      await expect(
        advanceApprovalChain(
          {
            chainId: workflow.chainId,
            actorId: CEO_ID,
            actorRole: Role.SUPPORT, // Support cannot approve CEO steps
          },
          { chainRepo, auditRepo }
        )
      ).rejects.toThrow(/Role mismatch: Step 2 requires role "ceo"/);
    });

    it('advances to Step 3 upon CEO sign-off and dispatches notification to Super Admin', async () => {
      const workflow = await initiateApprovalChain(
        {
          company_id: COMPANY_ID,
          action_type: 'large_payout',
          action_payload: { amount_usd: 30000 },
          requester_id: REQUESTER_ID,
          requester_role: Role.FINANCE_OPS,
        },
        { chainRepo, auditRepo }
      );

      clearDispatchedNotifications();

      // CEO signs off on Step 2
      const afterStep2 = await advanceApprovalChain(
        {
          chainId: workflow.chainId,
          actorId: CEO_ID,
          actorRole: Role.CEO,
          decisionNotes: 'CEO counter-signature verified. Transferred to Super Admin.',
        },
        { chainRepo, auditRepo }
      );

      expect(afterStep2.status).toBe('in_progress');
      expect(afterStep2.currentStepOrder).toBe(3);
      expect(afterStep2.nextRequiredRole).toBe(Role.SUPER_ADMIN);

      const step2 = afterStep2.steps.find((s) => s.step_order === 2);
      expect(step2?.status).toBe('approved');
      expect(step2?.actor_id).toBe(CEO_ID);

      const step3 = afterStep2.steps.find((s) => s.step_order === 3);
      expect(step3?.status).toBe('awaiting_action');

      // Verify Super Admin notification was dispatched
      const notifications = getDispatchedNotifications();
      expect(notifications.length).toBe(1);
      const superAdminNotif = notifications[0];
      expect(superAdminNotif.recipientRole).toBe(Role.SUPER_ADMIN);
      expect(superAdminNotif.subject).toContain('Step 3 Approval Pending');
    });

    it('completes entire 3-step workflow upon Super Admin confirmation', async () => {
      const workflow = await initiateApprovalChain(
        {
          company_id: COMPANY_ID,
          action_type: 'large_payout',
          action_payload: { amount_usd: 50000 },
          requester_id: REQUESTER_ID,
          requester_role: Role.FINANCE_OPS,
        },
        { chainRepo, auditRepo }
      );

      // Step 2: CEO approves
      await advanceApprovalChain(
        {
          chainId: workflow.chainId,
          actorId: CEO_ID,
          actorRole: Role.CEO,
        },
        { chainRepo, auditRepo }
      );

      // Step 3: Super Admin confirms release
      const completedWorkflow = await advanceApprovalChain(
        {
          chainId: workflow.chainId,
          actorId: SUPERADMIN_ID,
          actorRole: Role.SUPER_ADMIN,
          decisionNotes: 'Super Admin final release authorized. Payout released.',
        },
        { chainRepo, auditRepo }
      );

      expect(completedWorkflow.status).toBe('completed');
      expect(completedWorkflow.currentStep).toBeUndefined(); // No steps awaiting action

      for (const step of completedWorkflow.steps) {
        expect(step.status).toBe('approved');
        expect(step.actor_id).toBeDefined();
        expect(step.decided_at).toBeDefined();
      }
    });

    it('halts workflow and cancels subsequent steps when CEO rejects Step 2', async () => {
      const workflow = await initiateApprovalChain(
        {
          company_id: COMPANY_ID,
          action_type: 'platform_fee_change',
          action_payload: { new_fee_bps: 10 },
          requester_id: REQUESTER_ID,
          requester_role: Role.CEO,
        },
        { chainRepo, auditRepo }
      );

      const rejectedWorkflow = await rejectApprovalChain(
        {
          chainId: workflow.chainId,
          actorId: CEO_ID,
          actorRole: Role.CEO,
          rejectionReason: 'Fee reduction exceeds platform margin threshold.',
        },
        { chainRepo, auditRepo }
      );

      expect(rejectedWorkflow.status).toBe('rejected');

      const step2 = rejectedWorkflow.steps.find((s) => s.step_order === 2);
      expect(step2?.status).toBe('rejected');
      expect(step2?.decision_notes).toContain('exceeds platform margin threshold');

      const step3 = rejectedWorkflow.steps.find((s) => s.step_order === 3);
      expect(step3?.status).toBe('cancelled');
      expect(step3?.decision_notes).toContain('Cancelled due to Step 2 rejection');
    });
  });

  describe('Step 064.4 & Verification Gate: Full Three-Step Approval Cycle & Audit Trail', () => {
    it('Verification & Quality Gate: Submit large payout proposal; verify CEO receives approval request, followed by Super Admin confirmation gate', async () => {
      // 1. Requester submits large payout proposal ($100,000)
      const workflow = await initiateApprovalChain(
        {
          company_id: COMPANY_ID,
          action_type: 'large_payout',
          action_payload: {
            payout_id: 'pay_enterprise_999',
            amount_usd: 100000,
            merchant_name: 'Acme MegaStore LLC',
          },
          requester_id: REQUESTER_ID,
          requester_role: Role.FINANCE_OPS,
          requester_notes: 'Verified order fulfilment certificates and clean chargeback buffer.',
        },
        { chainRepo, auditRepo }
      );

      // Verify CEO receives approval request immediately
      const notifsAfterInit = getDispatchedNotifications();
      expect(notifsAfterInit.some((n) => n.recipientRole === Role.CEO)).toBe(true);

      // 2. CEO signs off
      clearDispatchedNotifications();
      const step2Workflow = await advanceApprovalChain(
        {
          chainId: workflow.chainId,
          actorId: CEO_ID,
          actorRole: Role.CEO,
          decisionNotes: 'CEO review completed and sanctioned.',
        },
        { chainRepo, auditRepo }
      );

      // Verify Super Admin confirmation gate receives approval request
      const notifsAfterCeo = getDispatchedNotifications();
      expect(notifsAfterCeo.some((n) => n.recipientRole === Role.SUPER_ADMIN)).toBe(true);
      expect(step2Workflow.nextRequiredRole).toBe(Role.SUPER_ADMIN);

      // 3. Super Admin confirms final release
      const finalWorkflow = await advanceApprovalChain(
        {
          chainId: workflow.chainId,
          actorId: SUPERADMIN_ID,
          actorRole: Role.SUPER_ADMIN,
          decisionNotes: 'Super Admin cryptographic release key applied.',
        },
        { chainRepo, auditRepo }
      );

      expect(finalWorkflow.status).toBe('completed');

      // 4. Verify immutable audit log records all state transitions
      const chainEvents = await auditRepo.findByEntity('approval_chains', workflow.chainId);
      expect(chainEvents.length).toBe(3);

      const [initEvent, step2Event, step3Event] = chainEvents;
      expect(initEvent.action).toBe('APPROVAL_CHAIN_INITIATED');
      expect(initEvent.actor_id).toBe(REQUESTER_ID);

      expect(step2Event.action).toBe('APPROVAL_CHAIN_STEP_ADVANCED');
      expect(step2Event.actor_id).toBe(CEO_ID);
      expect(step2Event.payload.stepOrder).toBe(2);

      expect(step3Event.action).toBe('APPROVAL_CHAIN_STEP_ADVANCED');
      expect(step3Event.actor_id).toBe(SUPERADMIN_ID);
      expect(step3Event.payload.stepOrder).toBe(3);
      expect(step3Event.payload.completed).toBe(true);
    });
  });
});
