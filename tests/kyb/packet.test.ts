// path: tests/kyb/packet.test.ts

import { describe, it, expect } from 'vitest';
import {
  encryptAndPackageKybDocument,
  decryptKybDocument,
  computeKybMerkleRoot,
  validateKybPacketCompleteness,
  buildKybDocumentPacket,
} from '@/lib/kyb/packet';

describe('Step 095: Unified Processor KYB Document Packet Generator', () => {
  const sampleCertificateBuffer = Buffer.from(
    'STATE OF DELAWARE CERTIFICATE OF INCORPORATION - APEX CLOUD SYSTEMS INC'
  );
  const sampleEinBuffer = Buffer.from(
    'DEPARTMENT OF THE TREASURY INTERNAL REVENUE SERVICE CP 575 B NOTICE - EIN: 12-3456789'
  );
  const sampleAddressBuffer = Buffer.from(
    'COMMERCIAL LEASE AGREEMENT & CON EDISON UTILITY BILL - 100 BROADWAY SUITE 400 NY'
  );
  const sampleRegistryBuffer = Buffer.from(
    'DELAWARE DIVISION OF CORPORATIONS CERTIFICATE OF GOOD STANDING'
  );

  it('Step 095.1: encrypts document buffer with AES-256-GCM and produces secure envelope', () => {
    const docItem = encryptAndPackageKybDocument({
      type: 'business_registration_certificate',
      filename: 'certificate_of_incorporation.pdf',
      mimeType: 'application/pdf',
      fileBuffer: sampleCertificateBuffer,
      issuedDate: '2026-01-15',
    });

    expect(docItem.id).toBeDefined();
    expect(docItem.type).toBe('business_registration_certificate');
    expect(docItem.encryptedEnvelope).toMatch(/^v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+/);
    expect(docItem.sha256Hash).toMatch(/^[a-f0-9]{64}$/);
    expect(docItem.fileSizeBytes).toBe(sampleCertificateBuffer.length);
  });

  it('Step 095.2: decrypts encrypted document buffer and verifies SHA-256 plaintext integrity', () => {
    const docItem = encryptAndPackageKybDocument({
      type: 'tax_id_certificate',
      filename: 'irs_ein_cp575.pdf',
      mimeType: 'application/pdf',
      fileBuffer: sampleEinBuffer,
    });

    const decrypted = decryptKybDocument(docItem);
    expect(decrypted.toString('utf8')).toBe(sampleEinBuffer.toString('utf8'));
  });

  it('Step 095.3: calculates deterministic SHA-256 Merkle root across documents', () => {
    const hash1 = 'a'.repeat(64);
    const hash2 = 'b'.repeat(64);
    const rootA = computeKybMerkleRoot([hash1, hash2]);
    const rootB = computeKybMerkleRoot([hash2, hash1]); // order invariant due to internal sorting

    expect(rootA).toBe(rootB);
    expect(rootA).toMatch(/^[a-f0-9]{64}$/);
  });

  it('Step 095.4: asserts full completeness for corporate entity packet', () => {
    const regDoc = encryptAndPackageKybDocument({
      type: 'business_registration_certificate',
      filename: 'delaware_cert.pdf',
      mimeType: 'application/pdf',
      fileBuffer: sampleCertificateBuffer,
    });
    const einDoc = encryptAndPackageKybDocument({
      type: 'tax_id_certificate',
      filename: 'ein_notice.pdf',
      mimeType: 'application/pdf',
      fileBuffer: sampleEinBuffer,
    });
    const addrDoc = encryptAndPackageKybDocument({
      type: 'proof_of_address',
      filename: 'bank_statement.pdf',
      mimeType: 'application/pdf',
      fileBuffer: sampleAddressBuffer,
      issuedDate: new Date().toISOString(), // fresh <= 90 days
    });
    const lookupDoc = encryptAndPackageKybDocument({
      type: 'corporate_registry_lookup',
      filename: 'de_sos_registry.pdf',
      mimeType: 'application/pdf',
      fileBuffer: sampleRegistryBuffer,
    });

    const packet = buildKybDocumentPacket({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999999',
      legalBusinessName: 'Apex Cloud Systems Inc',
      entityType: 'corporation',
      taxId: '12-3456789',
      jurisdiction: 'US-DE',
      targetProcessor: 'rainforest',
      documents: [regDoc, einDoc, addrDoc, lookupDoc],
    });

    expect(packet.status).toBe('complete');
    expect(packet.merkleRootHash).toBeDefined();
    expect(packet.documents).toHaveLength(4);
  });

  it('Step 095.5: flags missing required documents for corporation and sets draft status', () => {
    const regDoc = encryptAndPackageKybDocument({
      type: 'business_registration_certificate',
      filename: 'delaware_cert.pdf',
      mimeType: 'application/pdf',
      fileBuffer: sampleCertificateBuffer,
    });

    const packet = buildKybDocumentPacket({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999999',
      legalBusinessName: 'Apex Cloud Systems Inc',
      entityType: 'corporation',
      taxId: '12-3456789',
      jurisdiction: 'US-DE',
      targetProcessor: 'stripe_connect',
      documents: [regDoc], // missing tax_id, proof_of_address, corporate_registry_lookup
    });

    expect(packet.status).toBe('draft');
  });

  it('Step 095.6: flags proof of address older than 90 days as non-compliant', () => {
    const staleDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(); // 120 days old

    const addrDoc = encryptAndPackageKybDocument({
      type: 'proof_of_address',
      filename: 'old_utility_bill.pdf',
      mimeType: 'application/pdf',
      fileBuffer: sampleAddressBuffer,
      issuedDate: staleDate,
    });

    const validation = validateKybPacketCompleteness({
      entityType: 'corporation',
      targetProcessor: 'rainforest',
      legalBusinessName: 'Stale Address Corp',
      taxId: '12-3456789',
      documents: [addrDoc],
    });

    expect(validation.valid).toBe(false);
    expect(validation.missingRequirements.some((r) => r.includes('older than 90 days'))).toBe(true);
  });

  it('Step 095.7: validates Sole Proprietorship trade license and tax ID requirements', () => {
    const tradeLicenseDoc = encryptAndPackageKybDocument({
      type: 'trade_license',
      filename: 'nyc_dba_certificate.pdf',
      mimeType: 'application/pdf',
      fileBuffer: Buffer.from('NYC CLERK DBA CERTIFICATE - JANE DOE CONSULTING'),
    });
    const ssnCertDoc = encryptAndPackageKybDocument({
      type: 'tax_id_certificate',
      filename: 'ssn_itin_confirmation.pdf',
      mimeType: 'application/pdf',
      fileBuffer: Buffer.from('SOCIAL SECURITY / ITIN TAX RECEIPT'),
    });
    const addrDoc = encryptAndPackageKybDocument({
      type: 'proof_of_address',
      filename: 'home_office_lease.pdf',
      mimeType: 'application/pdf',
      fileBuffer: sampleAddressBuffer,
      issuedDate: new Date().toISOString(),
    });

    const validation = validateKybPacketCompleteness({
      entityType: 'sole_proprietorship',
      targetProcessor: 'nmi',
      legalBusinessName: 'Jane Doe Consulting',
      taxId: '123-45-6789',
      documents: [tradeLicenseDoc, ssnCertDoc, addrDoc],
    });

    expect(validation.valid).toBe(true);
    expect(validation.missingRequirements).toHaveLength(0);
  });

  it('Step 095.8: validates Partnership requires executed partnership agreement', () => {
    const regDoc = encryptAndPackageKybDocument({
      type: 'business_registration_certificate',
      filename: 'partnership_reg.pdf',
      mimeType: 'application/pdf',
      fileBuffer: sampleCertificateBuffer,
    });
    const taxDoc = encryptAndPackageKybDocument({
      type: 'tax_id_certificate',
      filename: 'partnership_ein.pdf',
      mimeType: 'application/pdf',
      fileBuffer: sampleEinBuffer,
    });
    const addrDoc = encryptAndPackageKybDocument({
      type: 'proof_of_address',
      filename: 'office_bill.pdf',
      mimeType: 'application/pdf',
      fileBuffer: sampleAddressBuffer,
      issuedDate: new Date().toISOString(),
    });

    // Without agreement
    const valWithoutAgreement = validateKybPacketCompleteness({
      entityType: 'partnership',
      targetProcessor: 'airwallex',
      legalBusinessName: 'Smith & Jones Partners',
      taxId: '98-7654321',
      documents: [regDoc, taxDoc, addrDoc],
    });
    expect(valWithoutAgreement.valid).toBe(false);
    expect(
      valWithoutAgreement.missingRequirements.some((r) => r.includes('Partnership Agreement'))
    ).toBe(true);

    // With agreement
    const agreementDoc = encryptAndPackageKybDocument({
      type: 'partnership_agreement',
      filename: 'partnership_agreement_signed.pdf',
      mimeType: 'application/pdf',
      fileBuffer: Buffer.from('EXECUTED GENERAL PARTNERSHIP AGREEMENT'),
    });

    const valWithAgreement = validateKybPacketCompleteness({
      entityType: 'partnership',
      targetProcessor: 'airwallex',
      legalBusinessName: 'Smith & Jones Partners',
      taxId: '98-7654321',
      documents: [regDoc, taxDoc, addrDoc, agreementDoc],
    });
    expect(valWithAgreement.valid).toBe(true);
  });
});
