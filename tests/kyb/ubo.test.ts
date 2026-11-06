// path: tests/kyb/ubo.test.ts

import { describe, it, expect } from 'vitest';
import {
  validateUboRegistry,
  isUboThresholdMet,
  packageAndEncryptUboIdentityDoc,
  type BeneficialOwnerInput,
} from '@/lib/kyb/ubo';

describe('Step 096: Director & UBO Identity Collection & Liveness Verification Pipeline', () => {
  const validAddress = {
    streetAddress: '100 Main St, Suite 200',
    city: 'San Francisco',
    stateOrProvince: 'CA',
    postalCode: '94105',
    country: 'US',
  };

  it('Step 096.1: passes two 50% shareholders when both have valid IDs and directors are assigned', () => {
    const owners: BeneficialOwnerInput[] = [
      {
        fullName: 'Alice Walker',
        dateOfBirth: '1982-03-15',
        nationality: 'US',
        equityPercentage: 50.0,
        isDirector: true,
        isPrimarySignatory: true,
        residentialAddress: validAddress,
        idDocId: 'file_id_01',
        livenessStatus: 'passed',
      },
      {
        fullName: 'Bob Martinez',
        dateOfBirth: '1987-11-20',
        nationality: 'US',
        equityPercentage: 50.0,
        isDirector: true,
        isPrimarySignatory: false,
        residentialAddress: validAddress,
        idDocId: 'file_id_02',
        livenessStatus: 'passed',
      },
    ];

    const result = validateUboRegistry(owners);

    expect(result.valid).toBe(true);
    expect(result.totalEquityPercentage).toBe(100.0);
    expect(result.qualifyingUboCount).toBe(2);
    expect(result.directorsCount).toBe(2);
    expect(result.issues).toHaveLength(0);
  });

  it('Step 096.2: rejects application if any owner holding >= 25% equity lacks identity document upload', () => {
    const owners: BeneficialOwnerInput[] = [
      {
        fullName: 'Alice Walker',
        dateOfBirth: '1982-03-15',
        nationality: 'US',
        equityPercentage: 50.0,
        isDirector: true,
        isPrimarySignatory: true,
        residentialAddress: validAddress,
        idDocId: 'file_id_01',
      },
      {
        fullName: 'Bob Martinez',
        dateOfBirth: '1987-11-20',
        nationality: 'US',
        equityPercentage: 50.0,
        isDirector: true,
        isPrimarySignatory: false,
        residentialAddress: validAddress,
        idDocId: '', // MISSING ID DOCUMENT
      },
    ];

    const result = validateUboRegistry(owners);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'idDocId')).toBe(true);
    expect(
      result.issues.find((i) => i.field === 'idDocId')?.message
    ).toContain('Bob Martinez');
  });

  it('Step 096.3: permits minority shareholder with < 25% equity without mandatory ID upload', () => {
    const owners: BeneficialOwnerInput[] = [
      {
        fullName: 'Alice Walker',
        dateOfBirth: '1982-03-15',
        nationality: 'US',
        equityPercentage: 80.0,
        isDirector: true,
        isPrimarySignatory: true,
        residentialAddress: validAddress,
        idDocId: 'file_id_01',
      },
      {
        fullName: 'Charlie Minor',
        dateOfBirth: '1992-06-10',
        nationality: 'US',
        equityPercentage: 20.0, // < 25% threshold
        isDirector: false,
        isPrimarySignatory: false,
        residentialAddress: validAddress,
        idDocId: '', // Optional for < 25%
      },
    ];

    const result = validateUboRegistry(owners);

    expect(result.valid).toBe(true);
    expect(result.qualifyingUboCount).toBe(1);
  });

  it('Step 096.4: rejects when total declared equity exceeds 100%', () => {
    const owners: BeneficialOwnerInput[] = [
      {
        fullName: 'Alice Walker',
        dateOfBirth: '1982-03-15',
        nationality: 'US',
        equityPercentage: 60.0,
        isDirector: true,
        isPrimarySignatory: true,
        residentialAddress: validAddress,
        idDocId: 'file_id_01',
      },
      {
        fullName: 'Bob Martinez',
        dateOfBirth: '1987-11-20',
        nationality: 'US',
        equityPercentage: 50.0, // 60 + 50 = 110%
        isDirector: true,
        isPrimarySignatory: false,
        residentialAddress: validAddress,
        idDocId: 'file_id_02',
      },
    ];

    const result = validateUboRegistry(owners);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'equityPercentage')).toBe(true);
    expect(result.issues.find((i) => i.field === 'equityPercentage')?.message).toContain(
      'cannot exceed 100.0%'
    );
  });

  it('Step 096.5: rejects when no managing director or primary signatory is identified', () => {
    const owners: BeneficialOwnerInput[] = [
      {
        fullName: 'Silent Investor LLC Rep',
        dateOfBirth: '1980-01-01',
        nationality: 'US',
        equityPercentage: 100.0,
        isDirector: false,
        isPrimarySignatory: false,
        residentialAddress: validAddress,
        idDocId: 'file_id_01',
      },
    ];

    const result = validateUboRegistry(owners);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'isDirector')).toBe(true);
  });

  it('Step 096.6: rejects underage beneficial owner (< 18 years old)', () => {
    const owners: BeneficialOwnerInput[] = [
      {
        fullName: 'Minor Owner',
        dateOfBirth: '2015-05-12', // ~11 years old
        nationality: 'US',
        equityPercentage: 100.0,
        isDirector: true,
        isPrimarySignatory: true,
        residentialAddress: validAddress,
        idDocId: 'file_id_01',
      },
    ];

    const result = validateUboRegistry(owners);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'dateOfBirth')).toBe(true);
    expect(result.issues.find((i) => i.field === 'dateOfBirth')?.message).toContain('minor');
  });

  it('Step 096.7: correctly detects UBO threshold at exactly 25.0%', () => {
    expect(isUboThresholdMet(24.99)).toBe(false);
    expect(isUboThresholdMet(25.0)).toBe(true);
    expect(isUboThresholdMet(50.0)).toBe(true);
  });

  it('Step 096.8: packages and encrypts UBO passport document with AES-256-GCM', () => {
    const samplePassportBuffer = Buffer.from(
      'PASSPORT DOCUMENT - UNITED STATES OF AMERICA - DOE, JOHN'
    );

    const packaged = packageAndEncryptUboIdentityDoc({
      ownerId: 'owner_uuid_01',
      docType: 'passport',
      filename: 'passport.pdf',
      mimeType: 'application/pdf',
      fileBuffer: samplePassportBuffer,
    });

    expect(packaged.encryptedEnvelope).toMatch(/^v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+/);
    expect(packaged.sha256Hash).toMatch(/^[a-f0-9]{64}$/);
    expect(packaged.fileSizeBytes).toBe(samplePassportBuffer.length);
  });
});
