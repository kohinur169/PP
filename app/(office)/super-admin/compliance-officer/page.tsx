// path: app/(office)/super-admin/compliance-officer/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserCheck,
  Building2,
  Mail,
  Phone,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  FileBadge,
  Globe,
  Clock,
  Sparkles,
  Scale,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Role } from '@/lib/auth/roles';

interface OfficerDetails {
  officerName: string;
  officialEmail: string;
  regulatorRegistration: string;
  jurisdiction: string;
  contactPhone: string;
  appointmentDate: string;
}

interface PendingAppointment {
  id: string;
  officer_name: string;
  official_email: string;
  regulator_registration_number: string;
  contact_phone: string;
  jurisdiction: string;
  status: string;
  change_justification: string;
  created_at: string;
}

export default function ComplianceOfficerPage() {
  const [activeOfficer, setActiveOfficer] = useState<OfficerDetails>({
    officerName: 'Dr. Sarah Jenkins, CAMS',
    officialEmail: 'compliance.officer@kdsolution.it',
    regulatorRegistration: 'FINCEN-MSB-2026-99128',
    jurisdiction: 'US-Delaware / EU-EEA Unified Facilitator',
    contactPhone: '+1 (800) 555-0199',
    appointmentDate: '2026-01-01T00:00:00.000Z',
  });

  const [pendingAppointment, setPendingAppointment] = useState<PendingAppointment | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRegulatorId, setFormRegulatorId] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formJurisdiction, setFormJurisdiction] = useState('US-Delaware / EU-EEA');
  const [formJustification, setFormJustification] = useState('');

  // Fetch current data
  const fetchData = async () => {
    try {
      const res = await fetch('/api/office/compliance-officer');
      if (res.ok) {
        const data = await res.json();
        if (data.disclosure) {
          setActiveOfficer(data.disclosure);
        }
        if (data.pendingAppointment) {
          setPendingAppointment(data.pendingAppointment);
        } else {
          setPendingAppointment(null);
        }
      }
    } catch {
      // Keep initial default mock state
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handlePropose = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/office/compliance-officer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.SUPER_ADMIN,
        },
        body: JSON.stringify({
          action: 'propose',
          officerName: formName,
          officialEmail: formEmail,
          regulatorRegistrationNumber: formRegulatorId,
          contactPhone: formPhone,
          jurisdiction: formJurisdiction,
          justification: formJustification,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to submit proposal');
      }

      setSuccessMessage('Appointment proposed successfully. Awaiting CEO ratification.');
      setFormName('');
      setFormEmail('');
      setFormRegulatorId('');
      setFormPhone('');
      setFormJustification('');
      await fetchData();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveAsCEO = async () => {
    if (!pendingAppointment) return;
    setIsLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/office/compliance-officer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.CEO,
        },
        body: JSON.stringify({
          action: 'approve',
          appointmentId: pendingAppointment.id,
          approvalNotes: 'Formally approved and appointed by Chief Executive Officer.',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to approve appointment');
      }

      setSuccessMessage('Appointment confirmed and ratified by CEO. Updated platform-wide.');
      await fetchData();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="border-b pb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Designated Compliance & AML Officer Registry
            </h1>
            <p className="text-sm text-muted-foreground">
              Step 078: Statutory officer records, FinCEN/FCA regulatory credentials, and two-tier Super Admin + CEO appointment governance.
            </p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Active Compliance Officer Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                Officially Appointed Officer
              </CardTitle>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                ACTIVE & RATIFIED
              </Badge>
            </div>
            <CardDescription>
              Designated platform representative for Anti-Money Laundering (AML) and Counter-Terrorist Financing (CTF).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/30 border grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground block">Appointed Officer</span>
                <span className="text-base font-bold text-foreground">{activeOfficer.officerName}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Regulator Registration / License</span>
                <span className="font-mono text-sm font-semibold text-primary">
                  {activeOfficer.regulatorRegistration}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> Official Inquiries Email
                </span>
                <span className="text-sm font-mono text-foreground">{activeOfficer.officialEmail}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> Statutory Direct Phone
                </span>
                <span className="text-sm font-mono text-foreground">{activeOfficer.contactPhone}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" /> Primary Legal Jurisdiction
                </span>
                <span className="text-sm text-foreground">{activeOfficer.jurisdiction}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Appointment Effective Date
                </span>
                <span className="text-sm text-foreground">
                  {new Date(activeOfficer.appointmentDate).toLocaleDateString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Public Legal Disclosure Preview */}
        <Card className="border shadow-sm bg-muted/20">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" />
              Public Disclosure Preview
            </CardTitle>
            <CardDescription className="text-xs">
              Live footer & terms disclaimer shown to sub-merchants and regulators.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs space-y-3 leading-relaxed text-muted-foreground">
            <p>
              &ldquo;KD Solution IT operates as a registered Payment Facilitator. Regulatory notices, SAR queries, and statutory inquiries should be addressed to our Designated AML Compliance Officer: <strong>{activeOfficer.officerName}</strong> ({activeOfficer.regulatorRegistration}) via <code>{activeOfficer.officialEmail}</code>.&rdquo;
            </p>
            <div className="pt-2 border-t text-[11px] flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Automatically synced with legal policy CMS</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending CEO Confirmation Banner */}
      {pendingAppointment && (
        <Card className="border-amber-500/30 bg-amber-500/5 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-amber-600">
                <Clock className="w-5 h-5" />
                Pending Appointment Awaiting CEO Ratification
              </CardTitle>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs">
                DUAL-CONTROL PENDING
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Super Admin submitted a candidate appointment. CEO approval is legally required before public activation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-card border text-xs">
              <div>
                <span className="text-muted-foreground block">Candidate Officer</span>
                <strong className="text-foreground">{pendingAppointment.officer_name}</strong>
              </div>
              <div>
                <span className="text-muted-foreground block">Official Email</span>
                <span className="font-mono">{pendingAppointment.official_email}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Regulator License</span>
                <span className="font-mono text-primary font-semibold">
                  {pendingAppointment.regulator_registration_number}
                </span>
              </div>
            </div>
            <p className="text-xs italic text-muted-foreground">
              Justification: &ldquo;{pendingAppointment.change_justification}&rdquo;
            </p>
          </CardContent>
          <CardFooter className="flex justify-end gap-3 pt-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleApproveAsCEO}
              disabled={isLoading}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Ratify & Activate as CEO
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Propose Updated Appointment Form */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Propose Updated Compliance Officer Appointment</CardTitle>
          <CardDescription>
            Super Admin initiation form. Submission creates a pending record and alerts the Chief Executive Officer for dual-control approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePropose} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Officer Full Legal Name & Credentials</label>
                <Input
                  placeholder="e.g. Marcus Vance, CAMS, CRCM"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Official Corporate Email Address</label>
                <Input
                  type="email"
                  placeholder="compliance@kdsolution.it"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Regulator Registration / MSB Number</label>
                <Input
                  placeholder="e.g. FINCEN-MSB-2026-99881"
                  value={formRegulatorId}
                  onChange={(e) => setFormRegulatorId(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Contact Phone Number</label>
                <Input
                  placeholder="+1 (800) 555-0122"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  required
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Primary Regulatory Jurisdiction</label>
                <Input
                  placeholder="US-Delaware / EU-EEA"
                  value={formJurisdiction}
                  onChange={(e) => setFormJurisdiction(e.target.value)}
                  required
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Formal Justification / Board Appointment Reference</label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 text-xs border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Provide board resolution number, AML license credentials, or replacement justification (min 10 characters)..."
                  value={formJustification}
                  onChange={(e) => setFormJustification(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isLoading} className="flex items-center gap-2">
                <span>Submit Appointment for CEO Confirmation</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
