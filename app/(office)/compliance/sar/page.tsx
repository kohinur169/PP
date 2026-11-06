// path: app/(office)/compliance/sar/page.tsx
'use client';

import React, { useState } from 'react';
import {
  Lock,
  ShieldAlert,
  FileText,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Plus,
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

interface SarDisplayItem {
  id: string;
  caseNumber: string;
  subjectName: string;
  suspectedActivity: string;
  totalSuspiciousAmountUsd: number;
  narrative: string;
  fincenFilingStatus: 'draft' | 'ready_for_filing' | 'filed_with_fincen';
  preparedAt: string;
}

/**
 * Step 068.4: Confidential SAR Case Workspace (FinCEN Suspicious Activity Reports).
 */
export default function SarWorkspacePage() {
  const [sarList, setSarList] = useState<SarDisplayItem[]>([
    {
      id: 'sar_01',
      caseNumber: 'SAR-2026-0001',
      subjectName: 'Anonymous Off-Shore Wholesale Buyer',
      suspectedActivity: 'STRUCTURING',
      totalSuspiciousAmountUsd: 28500.0,
      narrative:
        'Series of three consecutive $9,500 USD payments executed within 18 minutes across two virtual cards to evade $10k FinCEN CTR threshold.',
      fincenFilingStatus: 'draft',
      preparedAt: '2026-11-04 12:00 UTC',
    },
  ]);

  const [isDraftModalOpen, setIsDraftModalOpen] = useState<boolean>(false);
  const [subjectName, setSubjectName] = useState<string>('');
  const [activity, setActivity] = useState<string>('STRUCTURING');
  const [suspiciousAmount, setSuspiciousAmount] = useState<string>('15000');
  const [narrative, setNarrative] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  const handleCreateSar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim() || !narrative.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/office/compliance/sar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-role': 'compliance_kyc',
          'x-staff-id': '018f6c4c-3500-7fa1-b1e2-200000000002',
        },
        body: JSON.stringify({
          companyId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
          subjectName: subjectName.trim(),
          suspectedActivity: activity,
          narrative: narrative.trim(),
          totalSuspiciousAmountUsd: parseFloat(suspiciousAmount) || 10000,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || 'Failed to create SAR case.');
      }

      const resJson = await res.json();
      const newSar: SarDisplayItem = {
        id: resJson.sarCase.id,
        caseNumber: resJson.sarCase.caseNumber,
        subjectName: resJson.sarCase.subjectName,
        suspectedActivity: resJson.sarCase.suspectedActivity,
        totalSuspiciousAmountUsd: resJson.sarCase.totalSuspiciousAmountUsd,
        narrative: resJson.sarCase.narrative,
        fincenFilingStatus: 'draft',
        preparedAt: new Date().toISOString(),
      };

      setSarList([newSar, ...sarList]);
      setNotification(`Confidential SAR case ${newSar.caseNumber} drafted successfully.`);
      setIsDraftModalOpen(false);
      setSubjectName('');
      setNarrative('');
    } catch (err: unknown) {
      setNotification(err instanceof Error ? err.message : 'Drafting failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center space-x-2">
            <Lock className="w-6 h-6 text-purple-600" />
            <span>Confidential SAR Workspace (FinCEN)</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bank Secrecy Act / Anti-Money Laundering Suspicious Activity Report preparation portal.
          </p>
        </div>

        <Button
          className="space-x-1.5 bg-purple-600 hover:bg-purple-700 text-white"
          onClick={() => setIsDraftModalOpen(true)}
        >
          <Plus className="w-4 h-4" />
          <span>Draft New SAR Case</span>
        </Button>
      </div>

      {/* Confidentiality Warning Banner */}
      <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-start space-x-3 text-sm">
        <ShieldAlert className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
        <div className="text-purple-900 dark:text-purple-300 space-y-1">
          <p className="font-semibold">
            Strict Statutory Confidentiality (31 U.S.C. 5318(g)(2)):
          </p>
          <p>
            SAR filings and drafts are legally privileged and confidential. Unauthorized disclosure to
            subjects or non-compliance personnel is a federal violation. This workspace is architecturally
            hidden and barred via RLS from all non-compliance roles.
          </p>
        </div>
      </div>

      {notification && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center space-x-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span>{notification}</span>
        </div>
      )}

      {/* SAR Cases List */}
      <div className="space-y-4">
        {sarList.map((sar) => (
          <Card key={sar.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5">
                  <FileText className="w-5 h-5 text-purple-600" />
                  <CardTitle className="text-base font-semibold">{sar.caseNumber}</CardTitle>
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                    {sar.suspectedActivity}
                  </Badge>
                </div>
                <Badge variant={sar.fincenFilingStatus === 'filed_with_fincen' ? 'default' : 'outline'} className="text-xs">
                  {sar.fincenFilingStatus.replace(/_/g, ' ').toUpperCase()}
                </Badge>
              </div>
              <CardDescription>
                Subject: <span className="font-semibold text-foreground">{sar.subjectName}</span> | Total Suspicious Amount:{' '}
                <span className="font-semibold text-emerald-700">${sar.totalSuspiciousAmountUsd.toFixed(2)} USD</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1 uppercase tracking-wider text-[11px]">
                  Narrative & Investigation Findings:
                </p>
                <p>{sar.narrative}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Draft SAR Modal */}
      <Modal open={isDraftModalOpen} onOpenChange={setIsDraftModalOpen}>
        <ModalContent className="max-w-xl">
          <form onSubmit={handleCreateSar} className="space-y-4">
            <ModalHeader>
              <ModalTitle>Draft Confidential Suspicious Activity Report</ModalTitle>
              <ModalDescription>
                Record factual observations regarding suspected structuring, money laundering, or sanctions evasion.
              </ModalDescription>
            </ModalHeader>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Subject Name or Entity
              </label>
              <Input
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="e.g. John Doe / Transglobal Holdings"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Suspected Activity Type
                </label>
                <select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="STRUCTURING">STRUCTURING</option>
                  <option value="MONEY_LAUNDERING">MONEY LAUNDERING</option>
                  <option value="TERROR_FINANCING">TERROR FINANCING</option>
                  <option value="SANCTIONS_EVASION">SANCTIONS EVASION</option>
                  <option value="IDENTITY_THEFT">IDENTITY THEFT</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Suspicious Amount (USD)
                </label>
                <Input
                  type="number"
                  value={suspiciousAmount}
                  onChange={(e) => setSuspiciousAmount(e.target.value)}
                  placeholder="25000"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Factual Narrative
              </label>
              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Detailed timeline of suspicious transactions, card numbers, IP anomalies, and structuring pattern..."
                required
              />
            </div>

            <ModalFooter>
              <Button type="button" variant="outline" onClick={() => setIsDraftModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting} className="bg-purple-600 hover:bg-purple-700 text-white">
                Save Confidential SAR Draft
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
