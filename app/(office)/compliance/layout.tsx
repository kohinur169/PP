// path: app/(office)/compliance/layout.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldAlert,
  FileCheck2,
  AlertOctagon,
  Lock,
  LayoutDashboard,
  KeyRound,
  LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Compliance Overview', href: '/compliance', icon: LayoutDashboard },
  { label: 'Merchant Underwriting', href: '/compliance/underwriting', icon: FileCheck2 },
  { label: 'Payment Manual Reviews', href: '/compliance/payments/review', icon: AlertOctagon },
  { label: 'Confidential SAR Cases', href: '/compliance/sar', icon: Lock },
  { label: '2FA Reset Requests', href: '/compliance/2fa-resets', icon: KeyRound },
];

/**
 * Step 068.1: Compliance Officer Dashboard Layout & Navigation Bar.
 */
export default function ComplianceLayout({
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
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-foreground">
                  KD SOLUTION IT
                </span>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/20 text-xs">
                  COMPLIANCE & KYC
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Merchant Underwriting, AML Sanctions & BSA Regulatory Oversight
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-700 text-xs font-medium">
              <span>BSA/AML Certified Workspace</span>
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
                    ? 'border-blue-600 text-blue-700 font-semibold'
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
