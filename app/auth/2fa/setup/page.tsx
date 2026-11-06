// path: app/auth/2fa/setup/page.tsx

import React from 'react';
import { TotpEnrollment } from '@/components/auth/TotpEnrollment';

export const metadata = {
  title: 'Two-Factor Authentication Setup | KD Solution IT',
  description: 'Mandatory TOTP 2FA enrollment for your merchant account security.',
};

/**
 * Step 052.4: Dedicated page for mandatory 2FA enrollment.
 */
export default function TotpSetupPage() {
  return (
    <div className="min-h-screen bg-muted/20 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            KD SOLUTION IT
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enterprise Payment Facilitator Platform
          </p>
        </div>

        <TotpEnrollment />
      </div>
    </div>
  );
}
