// path: app/(office)/ceo/page.tsx
'use client';

import React from 'react';
import {
  Crown,
  CheckCircle2,
  AlertTriangle,
  Building2,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  ArrowUpRight,
  Globe2,
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
 * Step 067.1: CEO Executive Oversight Dashboard & KPIs.
 */
export default function CeoOverviewPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center space-x-2">
          <Crown className="w-6 h-6 text-amber-600" />
          <span>Executive Governance & Approval Center</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Final sign-off on sub-merchant onboarding, joint pricing policy governance, and platform risk tier oversight.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Platform 30-Day Volume</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">$1,428,950.00</div>
            <p className="text-xs text-emerald-600 mt-1 flex items-center">
              <TrendingUp className="w-3.5 h-3.5 mr-1" />
              +14.2% MoM growth across 5 processors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Pending Final KYC</CardTitle>
            <ShieldCheck className="w-4 h-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">3 Packets</div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting CEO Ed25519 digital sign-off
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Active Sub-Merchants</CardTitle>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">24 Entities</div>
            <p className="text-xs text-muted-foreground mt-1">
              Tier 1 (18) | Tier 2 (5) | Tier 3 (1)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Operating Jurisdictions</CardTitle>
            <Globe2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">6 Regions</div>
            <p className="text-xs text-muted-foreground mt-1">
              US, SG, GB, CA, AU, EU (Active)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base">KYC Underwriting Approval Queue</CardTitle>
                <CardDescription>
                  Review merchant compliance files and provide digital sign-off
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Review underwriting summaries compiled by compliance officers. Approving an onboarding packet
              applies an immutable Ed25519 asymmetric signature and unlocks merchant charge processing.
            </p>
            <a href="/ceo/approvals/kyc" className="inline-block">
              <Button size="sm" className="space-x-1.5 bg-amber-600 hover:bg-amber-700 text-white">
                <span>Open Approval Queue</span>
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Globe2 className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base">Joint Governance Portal</CardTitle>
                <CardDescription>
                  Collaborate with Super Admin on country and pricing decisions
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Dual-control four-eye policy management. Changes to allowed operating jurisdictions
              or tiered merchant pricing structures mandate joint CEO and Super Admin consensus.
            </p>
            <a href="/ceo/governance" className="inline-block">
              <Button size="sm" variant="outline" className="space-x-1.5">
                <span>View Governance Policies</span>
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
