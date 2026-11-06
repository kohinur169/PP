// path: components/tenant/TenantProvider.tsx

'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * Company metadata provided to sub-merchant dashboard components.
 */
export interface CompanyMetadata {
  readonly id: string;
  readonly legal_name: string;
  readonly trading_name?: string | null | undefined;
  readonly status?: string | undefined;
  readonly risk_tier?: number | undefined;
  readonly default_currency?: string | undefined;
}

/**
 * Interface for active tenant context state and actions.
 */
export interface TenantContextValue {
  readonly company: CompanyMetadata | null;
  readonly companyId: string;
  readonly role?: string | undefined;
  readonly isOfficeStaff: boolean;
  readonly switchCompany: (newCompanyId: string) => Promise<void>;
}

/**
 * React Context container for active tenant state.
 */
export const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export interface TenantProviderProps {
  readonly initialCompany: CompanyMetadata | null;
  readonly initialCompanyId: string;
  readonly role?: string | undefined;
  readonly isOfficeStaff?: boolean | undefined;
  readonly onSwitchCompany?: ((newCompanyId: string) => Promise<void>) | undefined;
  readonly children?: React.ReactNode | undefined;
}

/**
 * Step 065.3: React context <TenantProvider> providing current company metadata to sub-merchant dashboard.
 */
export function TenantProvider({
  initialCompany,
  initialCompanyId,
  role,
  isOfficeStaff = false,
  onSwitchCompany,
  children,
}: TenantProviderProps): React.ReactElement {
  const [company, setCompany] = useState<CompanyMetadata | null>(initialCompany);
  const [companyId, setCompanyId] = useState<string>(initialCompanyId);

  const switchCompany = useCallback(
    async (newCompanyId: string) => {
      if (!isOfficeStaff) {
        throw new Error('Tenant context switching is restricted to authorized office staff.');
      }

      if (onSwitchCompany) {
        await onSwitchCompany(newCompanyId);
      }

      setCompanyId(newCompanyId);
      if (company && company.id !== newCompanyId) {
        setCompany({
          ...company,
          id: newCompanyId,
        });
      }
    },
    [isOfficeStaff, onSwitchCompany, company]
  );

  const contextValue: TenantContextValue = {
    company,
    companyId,
    role,
    isOfficeStaff,
    switchCompany,
  };

  return React.createElement(
    TenantContext.Provider,
    { value: contextValue },
    children
  );
}


/**
 * Custom hook to consume tenant context in sub-merchant dashboard views.
 */
export function useTenant(): TenantContextValue {
  let context: TenantContextValue | undefined;
  try {
    context = useContext(TenantContext);
  } catch {
    throw new Error('useTenant must be used within a <TenantProvider>');
  }

  if (!context) {
    throw new Error('useTenant must be used within a <TenantProvider>');
  }
  return context;
}


/**
 * Alias for useTenant matching standard naming conventions.
 */
export const useTenantContext = useTenant;
