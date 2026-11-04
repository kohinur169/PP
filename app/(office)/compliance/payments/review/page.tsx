// path: app/(office)/compliance/payments/review/page.tsx
'use client';

import React, { useState } from 'react';
import {
  AlertOctagon,
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  AlertTriangle,
  Building2,
  Mail,
  ShieldCheck,
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

interface FlaggedPaymentDisplayItem {
  id: string;
  chargeId: string;
  companyId: string;
  merchantName: string;
  amountUsd: number;
  flagReason: 'AMOUNT_EXCEEDS_5K' | 'AVS_MISMATCH' | 'GEO_VELOCITY';
  customerEmail: string;
  processor: 'nmi' | 'payoneer' | 'rainforest' | 'stripe_connect' | 'airwallex';
  status: 'pending_review' | 'released' | 'cancelled_fraud';
}

/**
 * Step 068.3: Manual Payment Review Interface (> $5,000 or AVS Mismatch).
 */
export default function PaymentReviewPage() {
  const [payments, setPayments] = useState<FlaggedPaymentDisplayItem[]>([
    {
      id: 'rev_01',
      chargeId: 'ch_018f6c4c-3500-7fa1-b1e2-000000000101',
      companyId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      merchantName: 'Acme Digital Goods LLC',
      amountUsd: 8500.0,
      flagReason: 'AMOUNT_EXCEEDS_5K',
      customerEmail: 'corporate.buyer@enterprise.com',
      processor: 'stripe_connect',
      status: 'pending_review',
    },
    {
      id: 'rev_02',
      chargeId: 'ch_018f6c4c-3500-7fa1-b1e2-000000000102',
      companyId: '018f6c4c-3500-7fa1-b1e2-987654321def',
      merchantName: 'Apex Logistics International Pte. Ltd.',
      amountUsd: 1250.0,
      flagReason: 'AVS_MISMATCH',
      customerEmail: 'freight.client@transpacific.sg',
      processor: 'nmi',
      status: 'pending_review',
    },
  ]);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  const handleDecision = async (
    paymentId: string,
    decision: 'release' | 'cancel_fraud'
  ) => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/office/compliance/payments/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-role': 'compliance_kyc',
          'x-staff-id': '018f6c4c-3500-7fa1-b1e2-200000000002',
        },
        body: JSON.stringify({
          paymentReviewId: paymentId,
          decision,
          notes:
            decision === 'release'
              ? 'Transaction verified with merchant invoice; cleared for release.'
              : 'AVS mismatch confirmed fraud; cancelled and card blacklisted.',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || 'Failed to decide payment review.');
      }

      setPayments((prev) =>
        prev.map((p) =>
          p.id === paymentId
            ? { ...p, status: decision === 'release' ? 'released' : 'cancelled_fraud' }
            : p
        )
      );

      setNotification(
        `Payment review resolved: funds ${
          decision === 'release' ? 'released to settlement' : 'cancelled as fraud'
        }.`
      );
    } catch (err: unknown) {
      setNotification(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center space-x-2">
          <AlertOctagon className="w-6 h-6 text-amber-600" />
          <span>Manual Payment Fraud Review Interface</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Investigate transactions flagged for exceeding $5,000 USD, AVS address mismatches, or abnormal velocity.
        </p>
      </div>

      {notification && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center space-x-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span>{notification}</span>
        </div>
      )}

      {/* Flagged Payments List */}
      <div className="space-y-6">
        {payments.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2.5">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                    <CardTitle className="text-lg">
                      ${p.amountUsd.toFixed(2)} USD
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        p.flagReason === 'AMOUNT_EXCEEDS_5K'
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-rose-100 text-rose-800 border-rose-200'
                      }`}
                    >
                      {p.flagReason.replace('_', ' ')}
                    </Badge>
                  </div>
                  <CardDescription className="mt-1">
                    Charge ID: <span className="font-mono text-xs">{p.chargeId}</span> | Processor:{' '}
                    <span className="font-semibold text-foreground uppercase">{p.processor}</span>
                  </CardDescription>
                </div>

                <div>
                  <Badge variant={p.status === 'released' ? 'default' : 'outline'} className="text-xs">
                    {p.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-muted/40 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Merchant</p>
                    <p className="font-semibold text-foreground">{p.merchantName}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Cardholder Email</p>
                    <p className="font-semibold text-foreground">{p.customerEmail}</p>
                  </div>
                </div>
              </div>

              {p.status === 'pending_review' && (
                <div className="flex items-center justify-end space-x-3 pt-2 border-t">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDecision(p.id, 'cancel_fraud')}
                    disabled={isProcessing}
                  >
                    <span>Cancel as Fraud</span>
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white space-x-1.5"
                    onClick={() => handleDecision(p.id, 'release')}
                    disabled={isProcessing}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Release to Settlement</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
