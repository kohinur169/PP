// path: app/(office)/compliance/page.tsx
'use client';

import React from 'react';
import {
  ShieldAlert,
  FileCheck2,
  AlertOctagon,
  Lock,
  Building2,
  DollarSign,
  ArrowUpRight,
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

/**
 * Step 068.1: Compliance & KYC Officer Dedicated Dashboard Overview.
 */
export default function ComplianceOverviewPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center space-x-2">
          <ShieldAlert className="w-6 h-6 text-blue-600" />
          <span>Compliance & KYC Operations Center</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Identity verification, merchant underwriting queues, transaction fraud reviews, and FinCEN SAR filings.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Underwriting Queue</CardTitle>
            <FileCheck2 className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">4 In Review</div>
            <p className="text-xs text-muted-foreground mt-1">
              KYB document & UBO checks active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Flagged Transactions</CardTitle>
            <AlertOctagon className="w-4 h-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">2 Payments</div>
            <p className="text-xs text-muted-foreground mt-1">
              &gt; $5k USD or AVS mismatch triggers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Confidential SARs</CardTitle>
            <Lock className="w-4 h-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">1 Active</div>
            <p className="text-xs text-muted-foreground mt-1">
              FinCEN electronic filing workspace
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">2FA Reset Tickets</CardTitle>
            <KeyRound className="w-4 h-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">1 Pending</div>
            <p className="text-xs text-muted-foreground mt-1">
              Manual document inspection gate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Workspaces Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base">Merchant Underwriting</CardTitle>
                <CardDescription>
                  Review KYB docs, UBOs, and assign risk tiers
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Examine corporate registry records, passport scans, and beneficial ownership structures.
              Escalate approved applications to CEO for final Ed25519 sign-off.
            </p>
            <a href="/compliance/underwriting" className="inline-block">
              <Button size="sm" className="space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                <span>Open Underwriting Queue</span>
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base">Payment Fraud Reviews</CardTitle>
                <CardDescription>
                  Review transactions &gt; $5,000 or AVS mismatches
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Investigate high-value charge intents and address verification failures.
              Decide whether to release captured funds to settlement or cancel as fraud.
            </p>
            <a href="/compliance/payments/review" className="inline-block">
              <Button size="sm" variant="outline" className="space-x-1.5">
                <span>Review Transactions</span>
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base">Confidential SAR Workspace</CardTitle>
                <CardDescription>
                  Suspicious Activity Reports (BSA/AML isolated)
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Prepare BSA regulatory filings for money laundering, structuring, or sanctions evasion.
              Hidden from all non-compliance personnel under statutory confidentiality.
            </p>
            <a href="/compliance/sar" className="inline-block">
              <Button size="sm" variant="outline" className="space-x-1.5">
                <span>Confidential Workspace</span>
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
