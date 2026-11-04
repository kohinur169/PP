// path: app/(office)/super-admin/settings/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Save,
  Globe,
  Mail,
  Phone,
  DollarSign,
  Percent,
  Power,
  RotateCcw,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/Modal';

interface PlatformSettingsForm {
  platformName: string;
  logoUrl: string;
  supportEmail: string;
  supportPhone: string;
  baseCurrency: 'USD';
  defaultFeePercent: string;
  defaultReservePercent: string;
  emergencyKillswitch: boolean;
}

/**
 * Step 066.2 & Step 066.4: General Platform Settings & Step-Up 2FA Enforcement.
 * Allows Super Admin to configure platform branding, support details, and fee baselines,
 * gating all saves with step-up reauthentication.
 */
export default function PlatformSettingsPage() {
  const [formData, setFormData] = useState<PlatformSettingsForm>({
    platformName: 'KD Solution PayFac',
    logoUrl: '/images/logo.png',
    supportEmail: 'support@kdsolution.it',
    supportPhone: '+1-800-555-0199',
    baseCurrency: 'USD',
    defaultFeePercent: '2.9000',
    defaultReservePercent: '10.0000',
    emergencyKillswitch: false,
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Step-Up 2FA Modal State
  const [isStepUpOpen, setIsStepUpOpen] = useState<boolean>(false);
  const [stepUpCredential, setStepUpCredential] = useState<string>('');
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [isVerifyingStepUp, setIsVerifyingStepUp] = useState<boolean>(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/office/settings');
      if (res.ok) {
        const data = await res.json();
        setFormData({
          platformName: data.platformName || 'KD Solution PayFac',
          logoUrl: data.logoUrl || '/images/logo.png',
          supportEmail: data.supportEmail || 'support@kdsolution.it',
          supportPhone: data.supportPhone || '+1-800-555-0199',
          baseCurrency: 'USD',
          defaultFeePercent: data.defaultFeePercent || '2.9000',
          defaultReservePercent: data.defaultReservePercent || '10.0000',
          emergencyKillswitch: Boolean(data.emergencyKillswitch),
        });
      }
    } catch {
      // Fallback to defaults
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitiateSave = () => {
    setNotification(null);
    setStepUpError(null);
    setStepUpCredential('');
    setIsStepUpOpen(true);
  };

  const handleStepUpAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stepUpCredential.trim()) {
      setStepUpError('Please enter your password or 6-digit TOTP code.');
      return;
    }

    setIsVerifyingStepUp(true);
    setStepUpError(null);

    try {
      // 1. Obtain Step-Up Ticket via POST /api/auth/step-up
      const stepUpRes = await fetch('/api/auth/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'MANAGE_PLATFORM_SETTINGS',
          credential: stepUpCredential.trim(),
        }),
      });

      if (!stepUpRes.ok) {
        const errJson = await stepUpRes.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || 'Invalid step-up credentials.');
      }

      const stepUpJson = await stepUpRes.json();
      const ticketId = stepUpJson.ticket?.id || stepUpJson.ticket_id;

      if (!ticketId) {
        throw new Error('Step-up ticket not issued. Please try again.');
      }

      // 2. Perform Platform Settings Mutation with Step-Up Ticket
      setIsSaving(true);
      setIsStepUpOpen(false);

      const saveRes = await fetch('/api/office/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-step-up-ticket': ticketId,
          'x-staff-role': 'super_admin',
        },
        body: JSON.stringify(formData),
      });

      if (!saveRes.ok) {
        const saveErrJson = await saveRes.json().catch(() => null);
        throw new Error(saveErrJson?.detail || saveErrJson?.message || 'Failed to save settings.');
      }

      setNotification({
        type: 'success',
        message: 'Platform settings updated successfully and verified by Ed25519 audit log.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed.';
      setStepUpError(msg);
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsVerifyingStepUp(false);
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Title & Security Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center space-x-2">
            <Settings className="w-6 h-6 text-primary" />
            <span>Platform General Settings</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global branding, multi-tenant baseline fees, and emergency platform controls.
          </p>
        </div>

        <Button
          onClick={handleInitiateSave}
          disabled={isLoading || isSaving}
          isLoading={isSaving}
          className="space-x-1.5"
        >
          <Save className="w-4 h-4" />
          <span>Save Changes (2FA Required)</span>
        </Button>
      </div>

      {/* Security Gating Alert */}
      <div className="p-4 bg-muted/40 border border-muted rounded-xl flex items-start space-x-3 text-sm">
        <Lock className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">
            Step 066.4 Step-Up 2FA Security Gating:
          </p>
          <p>
            Altering global platform settings or fee structures impacts all onboarded sub-merchants.
            Applying changes requires step-up reauthentication via your authenticator code or master password.
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

      {/* Main Settings Form Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Brand & Identity Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2.5">
              <Globe className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Branding & Platform Identity</CardTitle>
            </div>
            <CardDescription>
              Configures platform name, logo asset, and public merchant references
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Platform Name
              </label>
              <Input
                value={formData.platformName}
                onChange={(e) =>
                  setFormData({ ...formData, platformName: e.target.value })
                }
                placeholder="KD Solution PayFac"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Logo Asset URL
              </label>
              <Input
                value={formData.logoUrl}
                onChange={(e) =>
                  setFormData({ ...formData, logoUrl: e.target.value })
                }
                placeholder="/images/logo.png"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Base Operating Currency
              </label>
              <div className="flex items-center space-x-2">
                <Input value="USD (United States Dollar)" disabled className="bg-muted/50" />
                <Badge variant="outline" className="bg-primary/10 text-primary whitespace-nowrap">
                  MANDATORY BASELINE
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                All platform ledger and settlement records enforce strict USD Numeric(18,4).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Support & Operations Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2.5">
              <Mail className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Support & Contact Information</CardTitle>
            </div>
            <CardDescription>
              Public contact channels displayed to sub-merchants and customers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Support Email Address
              </label>
              <Input
                type="email"
                value={formData.supportEmail}
                onChange={(e) =>
                  setFormData({ ...formData, supportEmail: e.target.value })
                }
                placeholder="support@kdsolution.it"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Support Emergency Phone
              </label>
              <Input
                value={formData.supportPhone}
                onChange={(e) =>
                  setFormData({ ...formData, supportPhone: e.target.value })
                }
                placeholder="+1-800-555-0199"
              />
            </div>
          </CardContent>
        </Card>

        {/* Global Financial Baselines Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2.5">
              <DollarSign className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Default Merchant Fees & Reserves</CardTitle>
            </div>
            <CardDescription>
              Baseline fee percentages applied to newly onboarded sub-merchants
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Standard Processing Fee Percent
              </label>
              <div className="relative">
                <Input
                  value={formData.defaultFeePercent}
                  onChange={(e) =>
                    setFormData({ ...formData, defaultFeePercent: e.target.value })
                  }
                  placeholder="2.9000"
                />
                <Percent className="w-4 h-4 text-muted-foreground absolute right-3 top-3" />
              </div>
              <p className="text-xs text-muted-foreground">
                Format: 4 decimal places (e.g. 2.9000% per successful charge)
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Default Rolling Reserve Percent
              </label>
              <div className="relative">
                <Input
                  value={formData.defaultReservePercent}
                  onChange={(e) =>
                    setFormData({ ...formData, defaultReservePercent: e.target.value })
                  }
                  placeholder="10.0000"
                />
                <Percent className="w-4 h-4 text-muted-foreground absolute right-3 top-3" />
              </div>
              <p className="text-xs text-muted-foreground">
                Held for 180 days across risk tiers unless custom merchant waiver granted.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Platform Killswitch Card */}
        <Card className={formData.emergencyKillswitch ? 'border-destructive/50 bg-destructive/5' : ''}>
          <CardHeader>
            <div className="flex items-center space-x-2.5">
              <Power className={`w-5 h-5 ${formData.emergencyKillswitch ? 'text-destructive' : 'text-primary'}`} />
              <CardTitle className="text-base">Emergency Settlement Killswitch</CardTitle>
            </div>
            <CardDescription>
              Halts all automated outbound payouts across all payment processors
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3.5 border rounded-lg bg-card">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">
                  Global Payout Hold
                </p>
                <p className="text-xs text-muted-foreground">
                  {formData.emergencyKillswitch
                    ? 'KILLSWITCH ENGAGED: Outbound disbursements halted'
                    : 'Normal operations: Outbound payouts flowing per schedule'}
                </p>
              </div>

              <Button
                type="button"
                variant={formData.emergencyKillswitch ? 'destructive' : 'outline'}
                size="sm"
                onClick={() =>
                  setFormData({
                    ...formData,
                    emergencyKillswitch: !formData.emergencyKillswitch,
                  })
                }
              >
                {formData.emergencyKillswitch ? 'Deactivate Killswitch' : 'Engage Killswitch'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Step-Up Reauthentication Modal */}
      <Modal open={isStepUpOpen} onOpenChange={setIsStepUpOpen}>
        <ModalContent>
          <form onSubmit={handleStepUpAndSave} className="space-y-4">
            <ModalHeader>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                <Lock className="w-5 h-5" />
              </div>
              <ModalTitle>Step-Up 2FA Reauthentication</ModalTitle>
              <ModalDescription>
                Sensitive action: <span className="font-semibold text-foreground">Modify Global Platform Settings</span>.
                Enter your 6-digit TOTP authenticator code or master account password to authorize this change.
              </ModalDescription>
            </ModalHeader>

            {stepUpError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{stepUpError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Authenticator Code (TOTP) or Password
              </label>
              <Input
                type="password"
                autoFocus
                value={stepUpCredential}
                onChange={(e) => setStepUpCredential(e.target.value)}
                placeholder="e.g. 123456 or Master Password"
                disabled={isVerifyingStepUp}
              />
            </div>

            <ModalFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsStepUpOpen(false)}
                disabled={isVerifyingStepUp}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={isVerifyingStepUp}
                disabled={isVerifyingStepUp}
              >
                Confirm & Save Settings
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
