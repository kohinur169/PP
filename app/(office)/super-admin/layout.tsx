// path: app/(office)/super-admin/layout.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  Settings,
  Users,
  CreditCard,
  FileSpreadsheet,
  LayoutDashboard,
  Lock,
  LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Overview', href: '/super-admin', icon: LayoutDashboard },
  { label: 'Platform Settings', href: '/super-admin/settings', icon: Settings },
  { label: 'Staff Roles', href: '/super-admin/staff', icon: Users },
  { label: 'Gateways', href: '/super-admin/gateways', icon: CreditCard },
  { label: 'Audit Trail', href: '/super-admin/audit', icon: FileSpreadsheet },
];

/**
 * Step 066.1: Super Admin Layout & Navigation Bar.
 * Provides unified navigation, platform authority branding, and security posture indicators.
 */
export default function SuperAdminLayout({
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
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-foreground">
                  KD SOLUTION IT
                </span>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                  SUPER ADMIN
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Global Platform Management & Multi-Tenant Authority
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-600 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Full Authority (LR-022 Active)</span>
            </div>
            <div className="flex items-center space-x-1 text-xs text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-lg border">
              <Lock className="w-3.5 h-3.5 text-primary" />
              <span>Step-Up 2FA Enforced</span>
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
                    ? 'border-primary text-primary font-semibold'
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
