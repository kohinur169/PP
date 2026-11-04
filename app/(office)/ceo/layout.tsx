// path: app/(office)/ceo/layout.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Crown,
  CheckCircle2,
  Globe2,
  FileSpreadsheet,
  LayoutDashboard,
  ShieldCheck,
  LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Executive Overview', href: '/ceo', icon: LayoutDashboard },
  { label: 'KYC Final Approvals', href: '/ceo/approvals/kyc', icon: CheckCircle2 },
  { label: 'Joint Governance', href: '/ceo/governance', icon: Globe2 },
  { label: 'Audit Trail', href: '/ceo/audit', icon: FileSpreadsheet },
];

/**
 * Step 067.1: CEO Executive Dashboard Layout & Navigation Bar.
 * Provides unified executive navigation, authority indicators, and sign-off readiness.
 */
export default function CeoLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Global Bar */}
      <header className="border-b bg-card/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center text-white shadow-sm">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-foreground">
                  KD SOLUTION IT
                </span>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20 text-xs">
                  EXECUTIVE CEO
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Final Underwriting Sign-Off & Joint Governance Authority
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-700 text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Ed25519 Signing Key Active</span>
            </div>
            <div className="flex items-center space-x-1 text-xs text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-lg border">
              <span>Dual-Control Governance</span>
            </div>
          </div>
        </div>

        {/* Horizontal Navigation Tabs */}
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-amber-600 text-amber-700 font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
