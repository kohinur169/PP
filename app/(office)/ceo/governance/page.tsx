// path: app/(office)/ceo/governance/page.tsx
'use client';

import React, { useState } from 'react';
import {
  Globe2,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  Layers,
  ArrowRight,
  Stamp,
  Users,
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

/**
 * Step 067.3: Joint Governance Console for CEO & Super Admin Collaboration.
 */
export default function CeoGovernancePage() {
  const [allowedCountries, setAllowedCountries] = useState<string[]>([
    'US',
    'SG',
    'GB',
    'CA',
    'AU',
    'EU',
  ]);

  const [proposals, setProposals] = useState<
    {
      id: string;
      title: string;
      proposedBy: string;
      proposedByRole: string;
      status: 'pending_signoff' | 'active';
      description: string;
    }[]
  >([
    {
      id: 'gov_01',
      title: 'Expand Operating Jurisdictions: Enable New Zealand (NZ)',
      proposedBy: 'Super Admin Operations',
      proposedByRole: 'super_admin',
      status: 'pending_signoff',
      description:
        'Enable domestic settlement routing and merchant onboarding in New Zealand via Airwallex gateway.',
    },
    {
      id: 'gov_02',
      title: 'Tier 3 High-Risk Rolling Reserve Baseline Adjustment (12.0000%)',
      proposedBy: 'CEO Executive Office',
      proposedByRole: 'ceo',
      status: 'active',
      description:
        'Increase mandatory rolling reserve baseline from 10.0000% to 12.0000% for merchants in elevated chargeback categories.',
    },
  ]);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  const handleSignOff = async (proposalId: string) => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/office/ceo/governance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-role': 'ceo',
          'x-staff-id': '018f6c4c-3500-7fa1-b1e2-200000000001',
        },
        body: JSON.stringify({
          action: 'signoff',
          proposalId,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || 'Failed to sign off policy.');
      }

      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: 'active' } : p))
      );

      setNotification('Policy signed off successfully with Ed25519 signature.');
    } catch (err: unknown) {
      setNotification(err instanceof Error ? err.message : 'Sign-off failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center space-x-2">
          <Globe2 className="w-6 h-6 text-primary" />
          <span>Joint Governance Portal (CEO & Super Admin)</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dual-control governance mechanism for country enable/disable switches and tiered merchant pricing.
        </p>
      </div>

      {/* Protocol Banner */}
      <div className="p-4 bg-muted/40 border border-muted rounded-xl flex items-start space-x-3 text-sm">
        <Users className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">
            Four-Eye Executive Governance Protocol:
          </p>
          <p>
            Major platform policy changes require complementary consensus. Policies proposed by the
            Super Admin require CEO executive sign-off, and policies proposed by the CEO require Super Admin confirmation.
          </p>
        </div>
      </div>

      {notification && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center space-x-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span>{notification}</span>
        </div>
      )}

      {/* Allowed Operating Countries Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Operating Countries</CardTitle>
          <CardDescription>
            Jurisdictions currently open for sub-merchant onboarding and local processing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {allowedCountries.map((c) => (
              <Badge key={c} variant="outline" className="px-3 py-1 bg-primary/10 text-primary border-primary/20 text-xs font-semibold">
                {c} - Active Jurisdiction
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Governance Proposals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Joint Governance Proposals</CardTitle>
          <CardDescription>
            Review and sign off on strategic policy modifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divide-y border rounded-xl overflow-hidden">
            {proposals.map((item) => (
              <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-sm text-foreground">{item.title}</span>
                    <Badge variant={item.status === 'active' ? 'default' : 'outline'} className="text-xs">
                      {item.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                  <p className="text-xs text-muted-foreground pt-1">
                    Proposed By: <span className="font-medium text-foreground">{item.proposedBy}</span> ({item.proposedByRole})
                  </p>
                </div>

                <div>
                  {item.status === 'pending_signoff' ? (
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white space-x-1.5"
                      onClick={() => handleSignOff(item.id)}
                      isLoading={isProcessing}
                    >
                      <Stamp className="w-4 h-4" />
                      <span>CEO Sign-Off</span>
                    </Button>
                  ) : (
                    <span className="text-xs text-emerald-600 font-semibold flex items-center">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Policy Active
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
