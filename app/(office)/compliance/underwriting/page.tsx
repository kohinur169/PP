// path: app/(office)/compliance/underwriting/page.tsx
'use client';

import React, { useState } from 'react';
import {
  FileCheck2,
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  FileText,
  UserCheck,
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

interface UnderwritingDisplayItem {
  id: string;
  companyId: string;
  legalName: string;
  dbaName: string;
  businessType: string;
  country: string;
  mcc: string;
  submittedDocuments: string[];
  sanctionsScreeningResult: 'CLEARED' | 'PEP_ALERT' | 'SANCTION_MATCH';
  uboVerified: boolean;
  recommendedRiskTier: 1 | 2 | 3;
  status: 'pending_review' | 'escalated_to_ceo' | 'rejected';
}

/**
 * Step 068.2: Merchant Underwriting Review Queue.
 */
export default function UnderwritingPage() {
  const [items, setItems] = useState<UnderwritingDisplayItem[]>([
    {
      id: 'und_01',
      companyId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      legalName: 'Acme Digital Goods LLC',
      dbaName: 'Acme Software',
      businessType: 'llc',
      country: 'US',
      mcc: '5734',
      submittedDocuments: ['Certificate_of_Formation.pdf', 'Passport_Alice_Owner.pdf', 'Bank_Statement.pdf'],
      sanctionsScreeningResult: 'CLEARED',
      uboVerified: true,
      recommendedRiskTier: 1,
      status: 'pending_review',
    },
    {
      id: 'und_02',
      companyId: '018f6c4c-3500-7fa1-b1e2-987654321def',
      legalName: 'Apex Logistics International Pte. Ltd.',
      dbaName: 'Apex Freight',
      businessType: 'corporation',
      country: 'SG',
      mcc: '4789',
      submittedDocuments: ['ACRA_Business_Profile.pdf', 'Audited_Financials_2025.pdf'],
      sanctionsScreeningResult: 'CLEARED',
      uboVerified: false,
      recommendedRiskTier: 2,
      status: 'pending_review',
    },
  ]);

  const [activeItem, setActiveItem] = useState<UnderwritingDisplayItem | null>(null);
  const [recommendedTier, setRecommendedTier] = useState<1 | 2 | 3>(1);
  const [officerNotes, setOfficerNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isEscalateModalOpen, setIsEscalateModalOpen] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  const openEscalateModal = (item: UnderwritingDisplayItem) => {
    setActiveItem(item);
    setRecommendedTier(item.recommendedRiskTier);
    setOfficerNotes(`Underwriting checks complete. Verified beneficial owners and business registration.`);
    setIsEscalateModalOpen(true);
  };

  const handleConfirmEscalation = async () => {
    if (!activeItem) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/office/compliance/underwriting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-role': 'compliance_kyc',
          'x-staff-id': '018f6c4c-3500-7fa1-b1e2-200000000002',
        },
        body: JSON.stringify({
          reviewId: activeItem.id,
          recommendedRiskTier: recommendedTier,
          officerNotes,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || 'Failed to escalate review.');
      }

      setItems((prev) =>
        prev.map((i) =>
          i.id === activeItem.id ? { ...i, status: 'escalated_to_ceo', recommendedRiskTier: recommendedTier } : i
        )
      );

      setNotification(`Merchant ${activeItem.legalName} escalated to CEO approval queue with Risk Tier ${recommendedTier}.`);
      setIsEscalateModalOpen(false);
      setActiveItem(null);
    } catch (err: unknown) {
      setNotification(err instanceof Error ? err.message : 'Escalation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center space-x-2">
          <FileCheck2 className="w-6 h-6 text-blue-600" />
          <span>Merchant Underwriting Review Queue</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inspect KYB corporate documentation, beneficial ownership verification (UBO), and PEP/sanctions status.
        </p>
      </div>

      {notification && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center space-x-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span>{notification}</span>
        </div>
      )}

      {/* Review Queue Items */}
      <div className="space-y-6">
        {items.map((item) => (
          <Card key={item.id} className={item.status === 'escalated_to_ceo' ? 'border-amber-500/30 bg-amber-500/5' : ''}>
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
                    Structure: <span className="font-semibold text-foreground uppercase">{item.businessType}</span> |
                    Jurisdiction: <span className="font-semibold text-foreground">{item.country}</span> | MCC:{' '}
                    <span className="font-semibold text-foreground">{item.mcc}</span>
                  </CardDescription>
                </div>

                <div>
                  <Badge variant={item.status === 'escalated_to_ceo' ? 'default' : 'outline'} className="text-xs">
                    {item.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-muted/40 rounded-lg">
                <div>
                  <p className="font-semibold text-xs text-foreground uppercase tracking-wider mb-1">
                    Sanctions & PEP Screening:
                  </p>
                  <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    {item.sanctionsScreeningResult}
                  </span>
                </div>

                <div>
                  <p className="font-semibold text-xs text-foreground uppercase tracking-wider mb-1">
                    Beneficial Ownership (UBO 25%+):
                  </p>
                  <span
                    className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded ${
                      item.uboVerified
                        ? 'text-emerald-700 bg-emerald-100'
                        : 'text-amber-800 bg-amber-100'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 mr-1" />
                    {item.uboVerified ? 'UBO Verified' : 'Pending Direct Inspection'}
                  </span>
                </div>
              </div>

              <div>
                <p className="font-semibold text-xs text-foreground uppercase tracking-wider mb-1.5">
                  Attached KYB Verification Files:
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.submittedDocuments.map((doc) => (
                    <div
                      key={doc}
                      className="flex items-center space-x-1.5 px-2.5 py-1 bg-muted/60 border rounded text-xs text-muted-foreground"
                    >
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      <span>{doc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {item.status === 'pending_review' && (
                <div className="flex items-center justify-end pt-2 border-t">
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white space-x-1.5"
                    onClick={() => openEscalateModal(item)}
                  >
                    <span>Complete Review & Escalate to CEO</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Escalation Modal */}
      <Modal open={isEscalateModalOpen} onOpenChange={setIsEscalateModalOpen}>
        <ModalContent>
          <div className="space-y-4">
            <ModalHeader>
              <ModalTitle>Escalate to CEO for Final Approval</ModalTitle>
              <ModalDescription>
                Assign recommended risk tier and underwriting summary notes for {activeItem?.legalName}.
              </ModalDescription>
            </ModalHeader>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Recommended Risk Tier
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setRecommendedTier(tier as 1 | 2 | 3)}
                    className={`p-2.5 border rounded-lg text-center transition-colors ${
                      recommendedTier === tier
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                        : 'hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <p className="text-xs font-bold">Tier {tier}</p>
                    <p className="text-[10px]">
                      {tier === 1 ? 'Low Risk' : tier === 2 ? 'Standard' : 'Elevated'}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Compliance Officer Underwriting Notes
              </label>
              <Input
                value={officerNotes}
                onChange={(e) => setOfficerNotes(e.target.value)}
                placeholder="Underwriting summary for executive review..."
              />
            </div>

            <ModalFooter>
              <Button variant="outline" onClick={() => setIsEscalateModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmEscalation} isLoading={isSubmitting}>
                Escalate to CEO
              </Button>
            </ModalFooter>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
