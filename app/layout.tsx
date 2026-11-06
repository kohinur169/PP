// path: app/layout.tsx
import type { Metadata } from 'next';
import React from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'KD SOLUTION IT - Payment Facilitator Platform',
  description: 'Enterprise multi-tenant SaaS payment facilitator platform for Asian market with worldwide merchant country control',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
