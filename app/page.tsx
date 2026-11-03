// path: app/page.tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/Table';
import { Modal, ModalTrigger, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter, ModalClose } from '@/components/ui/Modal';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/Select';
import { t } from '@/lib/i18n';
import { ShieldCheck, CreditCard, Lock, ArrowRight, DollarSign, Database, Activity, CheckCircle2, Server, Key } from 'lucide-react';

export default function HomePage() {
  const [selectedTier, setSelectedTier] = useState('tier1');

  return (
    <main className="container mx-auto max-w-6xl py-12 px-4 space-y-12">
      {/* Header */}
      <section className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold">
          <ShieldCheck className="w-4 h-4" />
          <span>{t('common.platformName')} - {t('common.tagline')}</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
          Next-Gen Payment Facilitator Infrastructure
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Multi-tenant SaaS payment facilitator for Asian and global merchants. Strict compliance, double-entry ledger, and multi-gateway orchestration.
        </p>
      </section>

      {/* Phase 1 Platform Architecture Telemetry (Step 011) */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Phase 1 Platform Foundations Telemetry
          </h2>
          <Badge variant="success" className="px-3 py-1">All 11 Steps Verified</Badge>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  Supabase PostgreSQL 17
                </CardTitle>
                <Badge variant="success">RLS Active</Badge>
              </div>
              <CardDescription>Multi-Tenant Row-Level Security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between py-1 border-b">
                <span>Migration Pipeline:</span>
                <span className="font-mono text-foreground font-semibold">idempotent SHA-256</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span>Tenant Isolation:</span>
                <span className="font-mono text-emerald-600 font-semibold">app.current_tenant_id</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Primary Key Schema:</span>
                <span className="font-mono text-foreground font-semibold">UUIDv7 timestamp-ordered</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Decimal Money Math
                </CardTitle>
                <Badge variant="default">numeric(18,4)</Badge>
              </div>
              <CardDescription>Zero-Loss Financial Engine</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between py-1 border-b">
                <span>Rounding Strategy:</span>
                <span className="font-mono text-foreground font-semibold">Banker&apos;s (HALF_EVEN)</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span>Multi-party Splits:</span>
                <span className="font-mono text-foreground font-semibold">Pro-rata Penny Conservation</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Platform Currency:</span>
                <span className="font-mono text-emerald-600 font-semibold">USD strictly enforced</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-500" />
                  Security & Sanitization
                </CardTitle>
                <Badge variant="warning">Multi-Vector</Badge>
              </div>
              <CardDescription>Universal Ingestion Defenses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between py-1 border-b">
                <span>XSS & HTML:</span>
                <span className="font-mono text-foreground font-semibold">DOMPurify strict whitelist</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span>SSRF Protection:</span>
                <span className="font-mono text-foreground font-semibold">RFC 1918 & Cloud Metadata</span>
              </div>
              <div className="flex justify-between py-1">
                <span>PII Redactor:</span>
                <span className="font-mono text-emerald-600 font-semibold">PAN mask & Secret stripping</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Core Architectural Pillars */}
      <section className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>PCI-DSS SAQ A</CardTitle>
              <Lock className="w-5 h-5 text-emerald-600" />
            </div>
            <CardDescription>CDE Complete Isolation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            Zero cardholder data touches platform servers. All card details collected via Collect.js and Stripe Elements hosted iframes.
            <div className="pt-2">
              <Badge variant="success">SAQ A Compliant</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Double-Entry Ledger</CardTitle>
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <CardDescription>Immutable Journaling</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            Zero-balance DB triggers guarantee balanced accounting. Fixed numeric(18,4) decimal precision with Banker&apos;s rounding.
            <div className="pt-2">
              <Badge variant="default">Balanced Invariant</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>5 Processors</CardTitle>
              <CreditCard className="w-5 h-5 text-amber-500" />
            </div>
            <CardDescription>Multi-Gateway Sync</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            NMI, Payoneer, Rainforest, Stripe Connect, and Airwallex integrated via deterministic fail-closed routing rules.
            <div className="pt-2">
              <Badge variant="warning">5 Gateways Active</Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Interactive UI Showcase */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Design System Primitives (Step 002)</h2>
        <Card>
          <CardHeader>
            <CardTitle>Interactive Component Testing</CardTitle>
            <CardDescription>Demonstration of Button, Modal, Table, Input, Select, and Badges</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Merchant Legal Name</label>
                <Input placeholder="e.g. Asia Global Trading Ltd" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Risk Tier Policy</label>
                <Select value={selectedTier} onValueChange={setSelectedTier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Risk Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tier1">Tier 1: Max $500/tx, 10% Reserve</SelectItem>
                    <SelectItem value="tier2">Tier 2: Max $2,500/tx, 5% Reserve</SelectItem>
                    <SelectItem value="tier3">Tier 3: Max $10,000/tx, 0-5% Reserve</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="default">
                Confirm Settings <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Button variant="success">Approve KYC</Button>
              <Button variant="outline">Test Connection</Button>
              <Button variant="destructive">Freeze Payouts</Button>

              <Modal>
                <ModalTrigger asChild>
                  <Button variant="secondary">Open Security Modal</Button>
                </ModalTrigger>
                <ModalContent>
                  <ModalHeader>
                    <ModalTitle>Security & Compliance Verification</ModalTitle>
                    <ModalDescription>
                      All actions are logged in the append-only cryptographic audit trail with Ed25519 signing.
                    </ModalDescription>
                  </ModalHeader>
                  <div className="py-4 space-y-2 text-sm">
                    <p>Current Session: LR-022 Bound Cookie</p>
                    <p>Reauthentication Age: &lt; 5 minutes</p>
                    <Badge variant="success">2FA TOTP Verified</Badge>
                  </div>
                  <ModalFooter>
                    <ModalClose asChild>
                      <Button variant="default">Acknowledge</Button>
                    </ModalClose>
                  </ModalFooter>
                </ModalContent>
              </Modal>
            </div>

            {/* Table */}
            <div className="pt-4">
              <h3 className="text-sm font-semibold mb-2">Connected Payment Processors Matrix</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Primary Function</TableHead>
                    <TableHead>Card Capture Method</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">NMI</TableCell>
                    <TableCell>Cards & Gateway</TableCell>
                    <TableCell>Collect.js Hosted Token</TableCell>
                    <TableCell><Badge variant="success">Active</Badge></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Payoneer</TableCell>
                    <TableCell>Global Payouts</TableCell>
                    <TableCell>Bank Disburse API</TableCell>
                    <TableCell><Badge variant="success">Active</Badge></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Stripe Connect</TableCell>
                    <TableCell>Connected Sub-Merchants</TableCell>
                    <TableCell>Stripe Elements</TableCell>
                    <TableCell><Badge variant="success">Active</Badge></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
