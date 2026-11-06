// path: tests/compliance/sar.test.ts

import { describe, it, expect } from 'vitest';
import { Role } from '@/lib/auth/roles';
import { Money } from '@/lib/money/money';
import {
  assertSarRoleAccess,
  assembleSarEvidencePack,
  createSarCase,
  fileSarWithFinCEN,
  getSarCaseConfidential,
  UnauthorizedSarAccessError,
} from '@/lib/compliance/sar';

describe('Step 108: Suspicious Activity Report (SAR) Case Management Subsystem', () => {
  it('Step 108.1: restricts SAR access strictly to Compliance Officer and Super Admin roles', () => {
    expect(() => assertSarRoleAccess(Role.COMPLIANCE_KYC)).not.toThrow();
    expect(() => assertSarRoleAccess(Role.SUPER_ADMIN)).not.toThrow();

    // Merchant roles and support staff MUST be blocked (Anti-Tipping-Off Rule)
    expect(() => assertSarRoleAccess(Role.OWNER)).toThrow(UnauthorizedSarAccessError);
    expect(() => assertSarRoleAccess(Role.SUPPORT)).toThrow(UnauthorizedSarAccessError);
    expect(() => assertSarRoleAccess(Role.CLIENT)).toThrow(UnauthorizedSarAccessError);
    expect(() => assertSarRoleAccess(Role.BLOGGER)).toThrow(UnauthorizedSarAccessError);
  });

  it('Step 108.2: compiles automated evidence document pack with transaction timeline, IP logs, and device fingerprints', () => {
    const evidence = assembleSarEvidencePack({
      transactions: [
        {
          id: 'tx_001',
          amount: new Money('490.0000'),
          createdAt: '2026-10-25T12:00:00Z',
          chargebackReason: 'UNAUTHORIZED_CHARGE',
          isCardTestingPattern: true,
        },
        {
          id: 'tx_002',
          amount: new Money('495.0000'),
          createdAt: '2026-10-25T12:05:00Z',
          isCardTestingPattern: true,
        },
      ],
      ipAddresses: ['185.220.101.5', '185.220.101.5', '198.51.100.88'], // Contains duplicate
      deviceFingerprints: ['fp_tor_01', 'fp_tor_01'], // Contains duplicate
      kycDocumentIds: ['doc_passport_01', 'doc_lease_02'],
      alertNotes: ['Structuring below $500 threshold detected.'],
    });

    expect(evidence.transactionTimeline).toHaveLength(2);
    expect(evidence.transactionTimeline[0]?.amountUsd).toBe('490.0000');
    expect(evidence.ipAddresses).toHaveLength(2); // Deduplicated
    expect(evidence.deviceFingerprints).toHaveLength(1); // Deduplicated
    expect(evidence.compiledAt).toBeDefined();
  });

  it('Step 108.3: creates confidential SAR case file in draft status with formal narrative', () => {
    const evidence = assembleSarEvidencePack({
      transactions: [
        {
          id: 'tx_001',
          amount: new Money('4900.0000'),
          createdAt: '2026-10-25T12:00:00Z',
        },
      ],
      ipAddresses: ['185.220.101.5'],
      deviceFingerprints: ['fp_tor_01'],
      kycDocumentIds: ['doc_passport_01'],
      alertNotes: ['High velocity cash withdrawal requested.'],
    });

    const sarCase = createSarCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      actorRole: Role.COMPLIANCE_KYC,
      actorUserId: 'officer_elena_01',
      suspectDetails: {
        fullName: 'Victor Vance Sterling',
        role: 'Managing Director',
        knownIpAddresses: ['185.220.101.5'],
        associatedBankAccounts: ['CHASE-8812'],
      },
      suspiciousActivityCategories: ['structuring', 'money_laundering'],
      narrative:
        'Between October 22 and October 29, 2026, the merchant executed systematic rapid transactions from anonymous prepaid cards originating from Tor exit nodes.',
      evidencePack: evidence,
      totalSuspiciousAmountUsd: new Money('48250.0000'),
      fictitiousTransactionCount: 112,
    });

    expect(sarCase.id).toBeDefined();
    expect(sarCase.caseNumber).toMatch(/^SAR-2026-/);
    expect(sarCase.status).toBe('draft');
    expect(sarCase.totalSuspiciousAmountUsd).toBe('48250.0000');
    expect(sarCase.fictitiousTransactionCount).toBe(112);
  });

  it('Step 108.4: blocks sub-merchant and support queries to confidential SAR case with 403 Forbidden', () => {
    const evidence = assembleSarEvidencePack({
      transactions: [],
      ipAddresses: [],
      deviceFingerprints: [],
      kycDocumentIds: [],
      alertNotes: [],
    });

    const sarCase = createSarCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      actorRole: Role.COMPLIANCE_KYC,
      actorUserId: 'officer_elena_01',
      suspectDetails: {
        fullName: 'Victor Vance Sterling',
        role: 'Director',
        knownIpAddresses: [],
        associatedBankAccounts: [],
      },
      suspiciousActivityCategories: ['fraud'],
      narrative:
        'Sub-merchant initiated card testing transactions using stolen credentials across overseas processing routes.',
      evidencePack: evidence,
      totalSuspiciousAmountUsd: new Money('12500.0000'),
    });

    // Sub-merchant queries SAR endpoint -> 403 Forbidden
    expect(() => getSarCaseConfidential(sarCase, Role.OWNER)).toThrow(
      UnauthorizedSarAccessError
    );

    // Support staff queries SAR endpoint -> 403 Forbidden
    expect(() => getSarCaseConfidential(sarCase, Role.SUPPORT)).toThrow(
      UnauthorizedSarAccessError
    );

    // Compliance Officer query -> SUCCESS
    const retrieved = getSarCaseConfidential(sarCase, Role.COMPLIANCE_KYC);
    expect(retrieved.caseNumber).toBe(sarCase.caseNumber);
  });

  it('Step 108.5: seals SAR case with official FinCEN BSA filing tracking identifier', () => {
    const evidence = assembleSarEvidencePack({
      transactions: [],
      ipAddresses: [],
      deviceFingerprints: [],
      kycDocumentIds: [],
      alertNotes: [],
    });

    const sarCase = createSarCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      actorRole: Role.COMPLIANCE_KYC,
      actorUserId: 'officer_elena_01',
      suspectDetails: {
        fullName: 'Victor Vance Sterling',
        role: 'Director',
        knownIpAddresses: [],
        associatedBankAccounts: [],
      },
      suspiciousActivityCategories: ['fraud'],
      narrative:
        'Sub-merchant initiated card testing transactions using stolen credentials across overseas processing routes.',
      evidencePack: evidence,
      totalSuspiciousAmountUsd: new Money('12500.0000'),
    });

    const filedCase = fileSarWithFinCEN({
      sarCase,
      actorRole: Role.COMPLIANCE_KYC,
      actorUserId: 'officer_elena_01',
      fincenBsaIdentifier: 'BSA-2026-99182371',
    });

    expect(filedCase.status).toBe('filed');
    expect(filedCase.fincenBsaIdentifier).toBe('BSA-2026-99182371');
    expect(filedCase.filedByUserId).toBe('officer_elena_01');
    expect(filedCase.filedAt).toBeDefined();

    // Double-filing rejected
    expect(() =>
      fileSarWithFinCEN({
        sarCase: filedCase,
        actorRole: Role.COMPLIANCE_KYC,
        actorUserId: 'officer_elena_01',
        fincenBsaIdentifier: 'BSA-2026-99182371',
      })
    ).toThrow('SAR case has already been filed with FinCEN');
  });
});
