// path: app/(office)/super-admin/page.tsx
'use client';

import React from 'react';
import {
  ShieldAlert,
  Settings,
  Users,
  CreditCard,
  Building2,
  DollarSign,
  ArrowUpRight,
  CheckCircle2,
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
 * Super Admin Global Dashboard Overview.
 */
export default function SuperAdminOverviewPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Platform Governance Console
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Root authority control panel for global settings, staff delegations, payment processors, and audit logs.
        </p>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Payment Processors</CardTitle>
            <CreditCard className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">5 / 5 Active</div>
            <p className="text-xs text-muted-foreground mt-1">
              NMI, Payoneer, Rainforest, Stripe, Airwallex
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Sub-Merchants</CardTitle>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">24 Entities</div>
            <p className="text-xs text-emerald-600 mt-1 flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              100% RLS Isolation Verified
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Standard Processing Fee</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">2.9000%</div>
            <p className="text-xs text-muted-foreground mt-1">
              USD Baseline Numeric(18,4)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Rolling Reserve Baseline</CardTitle>
            <ShieldAlert className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">10.0000%</div>
            <p className="text-xs text-muted-foreground mt-1">
              180-Day Automated Release Window
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base">Platform General Settings</CardTitle>
                <CardDescription>
                  Branding logo, platform name, contact email, and fee baselines
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure global platform branding and baseline settlement fees.
              All mutations mandate Step-Up 2FA reauthentication before applying.
            </p>
            <a href="/super-admin/settings" className="inline-block">
              <Button size="sm" className="space-x-1.5">
                <span>Manage Settings</span>
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base">Office Staff Role Delegation</CardTitle>
                <CardDescription>
                  Assign and elevate CEO, Compliance, Finance, Support, and Blogger roles
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Review active office staff members and delegate RBAC permissions.
              Requires step-up confirmation and dispatches automated security notices.
            </p>
            <a href="/super-admin/staff" className="inline-block">
              <Button size="sm" variant="outline" className="space-x-1.5">
                <span>Delegate Roles</span>
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
