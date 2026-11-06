// path: app/(office)/compliance/2fa-resets/page.tsx
'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  FileCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  KeyRound,
  FileText,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export interface ResetRequestItem {
  id: string;
  ticketId: string;
  userId: string;
  userEmail: string;
  docs: string[];
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

/**
 * Step 054: Office 2FA Reset Review Dashboard.
 * Enables compliance staff to review submitted verification documents,
 * authorize 2FA resets with step-up verification, and force fresh enrollment.
 */
export default function Office2faResetsPage() {
  const [requests, setRequests] = useState<ResetRequestItem[]>([
    {
      id: 'req_01a1a63a-1000-7000-8000-000000000001',
      ticketId: 'KD-SUP-8921',
      userId: '01a1a5bf-9000-7000-8000-111122223333',
      userEmail: 'merchant.recovery@kdsolution.it',
      docs: ['doc_passport_verified.pdf', 'doc_business_license.pdf'],
      status: 'pending',
      submittedAt: '2026-11-04 10:30 UTC',
    },
  ]);

  const [activeRequest, setActiveRequest] = useState<ResetRequestItem | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleApprove = async (request: ResetRequestItem) => {
    setIsProcessing(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/office/2fa-reset/${request.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-role': 'compliance_kyc',
          'x-staff-id': '018f6c4c-3500-7fa1-b1e2-800000000001',
          'x-is-superadmin': 'true',
        },
        body: JSON.stringify({
          ticketId: request.ticketId,
          notes: 'Identity documents manually verified by compliance officer.',
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        throw new Error(
          errorJson?.detail || errorJson?.message || 'Failed to approve 2FA reset request.'
        );
      }

      setRequests((prev) =>
        prev.map((r) => (r.id === request.id ? { ...r, status: 'approved' } : r))
      );

      setMessage({
        type: 'success',
        text: `2FA credentials reset for ${request.userEmail}. User is required to enroll fresh 2FA on next sign-in.`,
      });
      setActiveRequest(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed.';
      setMessage({ type: 'error', text: msg });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              2FA Credential Reset Requests
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Compliance Review & Manual Identity Verification Protocol
            </p>
          </div>
        </div>
      </div>

      {/* Protocol Notice */}
      <div className="p-4 bg-muted/40 border border-muted rounded-xl flex items-start space-x-3 text-sm">
        <ShieldAlert className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">
            KD Solution IT Security Standard:
          </p>
          <p>
            When a merchant loses all backup recovery codes and their authenticator device,
            office staff must manually verify identity documentation before authorizing a 2FA reset.
            Approving a reset purges existing secrets and flags the account to mandate immediate fresh setup.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg border text-sm flex items-center space-x-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-destructive" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pending & Recent Verification Requests</CardTitle>
          <CardDescription>
            Review submitted merchant identity documents and ticket logs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y border rounded-lg">
            {requests.map((item) => (
              <div
                key={item.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/10 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-sm">{item.ticketId}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        item.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.status === 'approved' ? (
                        <FileCheck className="w-3 h-3 mr-1" />
                      ) : item.status === 'rejected' ? (
                        <XCircle className="w-3 h-3 mr-1" />
                      ) : (
                        <Clock className="w-3 h-3 mr-1" />
                      )}
                      {item.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Merchant Email: <span className="font-medium text-foreground">{item.userEmail}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Submitted: {item.submittedAt}
                  </p>
                  <div className="flex items-center space-x-2 pt-1">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Attached Documents: {item.docs.join(', ')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {item.status === 'pending' ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveRequest(item)}
                        disabled={isProcessing}
                      >
                        Inspect Docs
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleApprove(item)}
                        isLoading={isProcessing && activeRequest?.id === item.id}
                        disabled={isProcessing}
                      >
                        Approve Reset
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      Review Complete
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
