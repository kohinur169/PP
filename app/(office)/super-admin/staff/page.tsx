// path: app/(office)/super-admin/staff/page.tsx
'use client';

import React, { useState } from 'react';
import {
  Users,
  ShieldCheck,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ChevronRight,
  ShieldAlert,
  Clock,
  KeyRound,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/Modal';
import { Role } from '@/lib/auth/roles';

interface StaffDisplayItem {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: 'active' | 'suspended';
  mfaEnabled: boolean;
  assignedAt: string;
}

const OFFICE_ROLE_OPTIONS: { role: Role; label: string; description: string }[] = [
  {
    role: Role.CEO,
    label: 'CEO (Chief Executive Officer)',
    description: 'Executive oversight, final KYC sign-off, pricing & country decisions, large payout release',
  },
  {
    role: Role.COMPLIANCE_KYC,
    label: 'Compliance & KYC Officer',
    description: 'KYB/KYC merchant reviews, SAR filings, sanctions screening, manual payment review',
  },
  {
    role: Role.FINANCE_OPS,
    label: 'Finance Operations',
    description: 'Reconciliation mismatch resolution, failed payout investigation, processor bill matching',
  },
  {
    role: Role.SUPPORT,
    label: 'Customer Support',
    description: 'Merchant ticketing and helpdesk. Strictly zero gateway key or KYC approval access',
  },
  {
    role: Role.BLOGGER,
    label: 'Public Blogger / CMS',
    description: 'Public content drafting and publishing. Strictly zero merchant or financial data access',
  },
  {
    role: Role.SUPER_ADMIN,
    label: 'Super Admin (Global Authority)',
    description: 'Root platform settings, gateway management, and staff role delegation',
  },
];

/**
 * Step 066.3 & Step 066.4: Office Staff Role Delegation Console.
 * Allows Super Admin to assign and reassign internal office staff roles,
 * enforcing step-up 2FA reauthentication and logging Ed25519 audit trails.
 */
export default function StaffDelegationPage() {
  const [staffList, setStaffList] = useState<StaffDisplayItem[]>([
    {
      id: '018f6c4c-3500-7fa1-b1e2-200000000001',
      email: 'ceo.executive@kdsolution.it',
      fullName: 'Viktor Executive',
      role: Role.CEO,
      status: 'active',
      mfaEnabled: true,
      assignedAt: '2026-11-01',
    },
    {
      id: '018f6c4c-3500-7fa1-b1e2-200000000002',
      email: 'compliance.officer@kdsolution.it',
      fullName: 'Eleanor Compliance',
      role: Role.COMPLIANCE_KYC,
      status: 'active',
      mfaEnabled: true,
      assignedAt: '2026-11-02',
    },
    {
      id: '018f6c4c-3500-7fa1-b1e2-200000000003',
      email: 'finance.lead@kdsolution.it',
      fullName: 'Marcus Finance',
      role: Role.FINANCE_OPS,
      status: 'active',
      mfaEnabled: true,
      assignedAt: '2026-11-02',
    },
    {
      id: '018f6c4c-3500-7fa1-b1e2-200000000004',
      email: 'support.tier1@kdsolution.it',
      fullName: 'Sarah Support',
      role: Role.SUPPORT,
      status: 'active',
      mfaEnabled: true,
      assignedAt: '2026-11-03',
    },
    {
      id: '018f6c4c-3500-7fa1-b1e2-200000000005',
      email: 'content.creator@kdsolution.it',
      fullName: 'Julian Content',
      role: Role.BLOGGER,
      status: 'active',
      mfaEnabled: true,
      assignedAt: '2026-11-03',
    },
  ]);

  const [selectedStaff, setSelectedStaff] = useState<StaffDisplayItem | null>(null);
  const [targetRole, setTargetRole] = useState<Role>(Role.SUPPORT);
  const [delegationReason, setDelegationReason] = useState<string>('');

  // Step-Up Modal State
  const [isDelegatingModalOpen, setIsDelegatingModalOpen] = useState<boolean>(false);
  const [stepUpCredential, setStepUpCredential] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const openDelegationModal = (member: StaffDisplayItem) => {
    setSelectedStaff(member);
    setTargetRole(member.role);
    setDelegationReason('');
    setStepUpCredential('');
    setModalError(null);
    setFeedback(null);
    setIsDelegatingModalOpen(true);
  };

  const handleConfirmDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;

    if (!delegationReason.trim() || delegationReason.trim().length < 5) {
      setModalError('Please provide a justification reason of at least 5 characters.');
      return;
    }

    if (!stepUpCredential.trim()) {
      setModalError('Please enter your 2FA TOTP code or password for step-up verification.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      // 1. Obtain Step-Up Ticket via POST /api/auth/step-up
      const stepUpRes = await fetch('/api/auth/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DELEGATE_STAFF_ROLE',
          credential: stepUpCredential.trim(),
        }),
      });

      if (!stepUpRes.ok) {
        const errJson = await stepUpRes.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || 'Invalid step-up credentials.');
      }

      const stepUpJson = await stepUpRes.json();
      const ticketId = stepUpJson.ticket?.id || stepUpJson.ticket_id;

      if (!ticketId) {
        throw new Error('Step-up ticket not issued. Please try again.');
      }

      // 2. Perform Role Delegation with Step-Up Ticket
      const delegateRes = await fetch('/api/office/staff/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-step-up-ticket': ticketId,
          'x-staff-role': 'super_admin',
        },
        body: JSON.stringify({
          targetUserId: selectedStaff.id,
          newRole: targetRole,
          reason: delegationReason.trim(),
        }),
      });

      if (!delegateRes.ok) {
        const delErrJson = await delegateRes.json().catch(() => null);
        throw new Error(delErrJson?.detail || delErrJson?.message || 'Failed to delegate role.');
      }

      // Update local state
      setStaffList((prev) =>
        prev.map((s) => (s.id === selectedStaff.id ? { ...s, role: targetRole } : s))
      );

      setFeedback({
        type: 'success',
        message: `Role for ${selectedStaff.fullName} successfully updated to ${targetRole}. Audit log generated and security notification dispatched to CEO.`,
      });

      setIsDelegatingModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delegation failed.';
      setModalError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadgeColor = (role: Role) => {
    switch (role) {
      case Role.SUPER_ADMIN:
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case Role.CEO:
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case Role.COMPLIANCE_KYC:
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case Role.FINANCE_OPS:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case Role.SUPPORT:
        return 'bg-slate-100 text-slate-800 border-slate-200';
      case Role.BLOGGER:
        return 'bg-pink-100 text-pink-800 border-pink-200';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center space-x-2">
          <Users className="w-6 h-6 text-primary" />
          <span>Office Staff Role Delegation</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Delegate and elevate internal RBAC roles across KD Solution IT office staff.
        </p>
      </div>

      {/* Security Standard Banner */}
      <div className="p-4 bg-muted/40 border border-muted rounded-xl flex items-start space-x-3 text-sm">
        <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">
            Principle of Least Privilege & Mandatory 2FA:
          </p>
          <p>
            Office roles follow strict architectural isolation. Support and Blogger roles are denied
            access to gateway API keys and merchant KYC data. Any role change requires Step-Up 2FA
            reauthentication and triggers automated audit recording.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center space-x-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-destructive" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Staff List Table Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Office Personnel</CardTitle>
          <CardDescription>
            Select a staff member to modify their assigned office role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y border rounded-xl overflow-hidden">
            {staffList.map((member) => (
              <div
                key={member.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/10 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2.5">
                    <span className="font-semibold text-sm text-foreground">
                      {member.fullName}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getRoleBadgeColor(
                        member.role
                      )}`}
                    >
                      {member.role.toUpperCase().replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                  <div className="flex items-center space-x-3 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center">
                      <KeyRound className="w-3 h-3 mr-1 text-emerald-600" />
                      2FA Enforced
                    </span>
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      Assigned: {member.assignedAt}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDelegationModal(member)}
                  >
                    <span>Change Role</span>
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delegation & Step-Up Modal */}
      <Modal open={isDelegatingModalOpen} onOpenChange={setIsDelegatingModalOpen}>
        <ModalContent className="max-w-xl">
          <form onSubmit={handleConfirmDelegation} className="space-y-4">
            <ModalHeader>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                <UserCheck className="w-5 h-5" />
              </div>
              <ModalTitle>Delegate Office Role</ModalTitle>
              <ModalDescription>
                Assign a new internal authority role to{' '}
                <span className="font-semibold text-foreground">
                  {selectedStaff?.fullName} ({selectedStaff?.email})
                </span>
                .
              </ModalDescription>
            </ModalHeader>

            {modalError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Target Office Role
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto border p-2 rounded-lg">
                {OFFICE_ROLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.role}
                    className={`flex items-start space-x-2.5 p-2 rounded-md cursor-pointer border text-xs transition-colors ${
                      targetRole === opt.role
                        ? 'bg-primary/10 border-primary text-foreground'
                        : 'border-transparent hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name="office_role"
                      value={opt.role}
                      checked={targetRole === opt.role}
                      onChange={() => setTargetRole(opt.role)}
                      className="mt-0.5 text-primary"
                    />
                    <div className="space-y-0.5">
                      <p className="font-semibold text-foreground">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Justification & Audit Reason
              </label>
              <Input
                value={delegationReason}
                onChange={(e) => setDelegationReason(e.target.value)}
                placeholder="e.g. Promoted to Compliance Officer following background clearance"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-1.5 pt-2 border-t">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-foreground uppercase tracking-wider">
                <Lock className="w-3.5 h-3.5 text-primary" />
                <span>Step-Up 2FA Reauthentication</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your 6-digit TOTP authenticator code or master password to authorize this delegation.
              </p>
              <Input
                type="password"
                value={stepUpCredential}
                onChange={(e) => setStepUpCredential(e.target.value)}
                placeholder="e.g. 123456 or Master Password"
                disabled={isSubmitting}
              />
            </div>

            <ModalFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDelegatingModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
                Authorize & Delegate Role
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
