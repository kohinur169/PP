// path: app/(office)/ceo/approvals/kyc/page.tsx
'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Building2,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  Lock,
  Stamp,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/Modal';

interface KycDisplayPacket {
  id: string;
  companyId: string;
  legalName: string;
  dbaName: string;
  country: string;
  mcc: string;
  riskTier: 1 | 2 | 3;
  underwritingSummary: string;
  complianceOfficerRecommendation: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  ceoSignature?: string;
}

/**
 * Step 067.2 & Step 067.4: CEO Final KYC Approval Queue with Ed25519 Digital Sign-Off.
 */
export default function CeoKycApprovalsPage() {
  const [packets, setPackets] = useState<KycDisplayPacket[]>([
    {
      id: 'kyc_018f6c4c-3500-7fa1-b1e2-000000000001',
      companyId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      legalName: 'Acme Digital Goods LLC',
      dbaName: 'Acme Software',
      country: 'US',
      mcc: '5734',
      riskTier: 1,
      underwritingSummary:
        'SaaS recurring subscription model. Verified $120k projected monthly volume. Clean corporate registry filing and beneficial owner identity verification complete.',
      complianceOfficerRecommendation:
        'Recommended for Tier 1 onboarding. 7-day settlement hold, 5.0000% rolling reserve.',
      status: 'pending',
      submittedAt: '2026-11-04 09:15 UTC',
    },
    {
      id: 'kyc_018f6c4c-3500-7fa1-b1e2-000000000002',
      companyId: '018f6c4c-3500-7fa1-b1e2-987654321def',
      legalName: 'Apex Logistics International Pte. Ltd.',
      dbaName: 'Apex Freight',
      country: 'SG',
      mcc: '4789',
      riskTier: 2,
      underwritingSummary:
        'Freight and forwarding B2B marketplace. Clean ACRA business profile, audited financial statements provided. High average ticket size ($3,500 USD).',
      complianceOfficerRecommendation:
        'Recommended for Tier 2 onboarding. Standard 14-day hold, 10.0000% reserve.',
      status: 'pending',
      submittedAt: '2026-11-04 11:30 UTC',
    },
  ]);

  const [activePacket, setActivePacket] = useState<KycDisplayPacket | null>(null);
  const [approvalNotes, setApprovalNotes] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleExecuteSignOff = async (packet: KycDisplayPacket) => {
    setIsApproving(true);
    setNotification(null);

    try {
      const res = await fetch(`/api/office/ceo/approvals/kyc/${packet.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-role': 'ceo',
          'x-staff-id': '018f6c4c-3500-7fa1-b1e2-200000000001',
        },
        body: JSON.stringify({
          action: 'approve',
          notes: approvalNotes || 'CEO final approval granted following underwriting review.',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || 'Failed to sign off KYC packet.');
      }

      const resJson = await res.json();
      const signature = resJson.signature;

      setPackets((prev) =>
        prev.map((p) =>
          p.id === packet.id ? { ...p, status: 'approved', ceoSignature: signature } : p
        )
      );

      setNotification({
        type: 'success',
        message: `Ed25519 digital sign-off completed for ${packet.legalName}. Sub-merchant provisioning unlocked and company transitioned to active.`,
      });
      setActivePacket(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-off failed.';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsApproving(false);
    }
  };

  const handleExecuteReject = async () => {
    if (!activePacket || !rejectionReason.trim()) return;

    setIsApproving(true);
    try {
      const res = await fetch(`/api/office/ceo/approvals/kyc/${activePacket.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-role': 'ceo',
          'x-staff-id': '018f6c4c-3500-7fa1-b1e2-200000000001',
        },
        body: JSON.stringify({
          action: 'reject',
          reason: rejectionReason.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || 'Failed to reject KYC packet.');
      }

      setPackets((prev) =>
        prev.map((p) => (p.id === activePacket.id ? { ...p, status: 'rejected' } : p))
      );

      setNotification({
        type: 'error',
        message: `KYC application for ${activePacket.legalName} has been rejected.`,
      });

      setIsRejectModalOpen(false);
      setActivePacket(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rejection failed.';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center space-x-2">
          <Stamp className="w-6 h-6 text-amber-600" />
          <span>KYC Final Approval & Underwriting Sign-Off</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review underwriting packets and execute asymmetric Ed25519 digital sign-offs to unlock merchant provisioning.
        </p>
      </div>

      {/* Security Gating Notice */}
      <div className="p-4 bg-muted/40 border border-muted rounded-xl flex items-start space-x-3 text-sm">
        <ShieldCheck className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">
            Step 067.4: CEO Digital Signature Protocol:
          </p>
          <p>
            Sub-merchants remain in restricted review status until the CEO reviews compliance summaries
            and grants final authorization. Signing records an immutable Ed25519 signature into the audit trail,
            permanently binding the decision hash to the CEO identity.
          </p>
        </div>
      </div>

      {notification && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center space-x-2.5 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-destructive" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* KYC Packets List */}
      <div className="space-y-6">
        {packets.map((item) => (
          <Card key={item.id} className={item.status === 'approved' ? 'border-emerald-500/30' : ''}>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2.5">
                    <Building2 className="w-5 h-5 text-primary" />
                    <CardTitle className="text-lg">{item.legalName}</CardTitle>
                    <span className="text-sm text-muted-foreground font-normal">
                      (DBA: {item.dbaName})
                    </span>
                  </div>
                  <CardDescription className="mt-1">
                    Jurisdiction: <span className="font-semibold text-foreground">{item.country}</span> | MCC:{' '}
                    <span className="font-semibold text-foreground">{item.mcc}</span> | Risk Tier:{' '}
                    <Badge variant="outline" className="ml-1 text-xs">
                      Tier {item.riskTier}
                    </Badge>
                  </CardDescription>
                </div>

                <div>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                      item.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.status === 'rejected'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.status === 'approved' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    ) : item.status === 'rejected' ? (
                      <XCircle className="w-3.5 h-3.5 mr-1" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 mr-1" />
                    )}
                    {item.status.toUpperCase()}
                  </span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 text-sm">
              <div className="p-3.5 bg-muted/40 rounded-lg space-y-1">
                <p className="font-semibold text-xs text-foreground uppercase tracking-wider">
                  Underwriting & Risk Analysis:
                </p>
                <p className="text-muted-foreground">{item.underwritingSummary}</p>
              </div>

              <div className="p-3.5 bg-primary/5 border border-primary/10 rounded-lg space-y-1">
                <p className="font-semibold text-xs text-primary uppercase tracking-wider">
                  Compliance Officer Recommendation:
                </p>
                <p className="text-foreground">{item.complianceOfficerRecommendation}</p>
              </div>

              {item.status === 'approved' && item.ceoSignature && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-mono text-emerald-700 truncate">
                  <span className="font-semibold">Ed25519 Signature: </span>
                  {item.ceoSignature}
                </div>
              )}

              {item.status === 'pending' && (
                <div className="flex items-center justify-end space-x-3 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActivePacket(item);
                      setIsRejectModalOpen(true);
                    }}
                    disabled={isApproving}
                  >
                    Reject Application
                  </Button>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white space-x-1.5"
                    onClick={() => handleExecuteSignOff(item)}
                    isLoading={isApproving && activePacket?.id === item.id}
                    disabled={isApproving}
                  >
                    <Stamp className="w-4 h-4" />
                    <span>Execute Ed25519 Sign-Off</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reject Reason Modal */}
      <Modal open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <ModalContent>
          <div className="space-y-4">
            <ModalHeader>
              <ModalTitle>Reject KYC Onboarding Packet</ModalTitle>
              <ModalDescription>
                Provide a formal rejection reason for {activePacket?.legalName}.
              </ModalDescription>
            </ModalHeader>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Rejection Justification
              </label>
              <Input
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Prohibited business model or incomplete beneficial ownership documentation"
              />
            </div>

            <ModalFooter>
              <Button variant="outline" onClick={() => setIsRejectModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleExecuteReject} isLoading={isApproving}>
                Confirm Rejection
              </Button>
            </ModalFooter>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
