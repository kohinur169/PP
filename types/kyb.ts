// path: types/kyb.ts

export type CompanyEntityType =
  | 'corporation'
  | 'llc'
  | 'partnership'
  | 'sole_proprietorship'
  | 'non_profit';

export type ProcessorTarget =
  | 'nmi'
  | 'stripe_connect'
  | 'rainforest'
  | 'airwallex'
  | 'payoneer';

export type KybDocumentType =
  | 'business_registration_certificate'
  | 'trade_license'
  | 'tax_id_certificate'
  | 'proof_of_address'
  | 'corporate_registry_lookup'
  | 'ownership_structure_chart'
  | 'partnership_agreement'
  | 'articles_of_incorporation';

export interface KybDocumentItem {
  id: string;
  type: KybDocumentType;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  encryptedEnvelope: string; // "v1:<iv>:<authTag>:<ciphertext>"
  sha256Hash: string;
  uploadedAt: string;
  issuedDate?: string | undefined;
  expiryDate?: string | undefined;
  verified: boolean;
}

export interface KybDocumentPacket {
  packetId: string;
  tenantId: string;
  companyId: string;
  legalBusinessName: string;
  dbaName?: string | undefined;
  entityType: CompanyEntityType;
  taxId: string;
  jurisdiction: string;
  targetProcessor: ProcessorTarget;
  documents: KybDocumentItem[];
  merkleRootHash: string;
  status: 'draft' | 'complete' | 'submitted' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface KybValidationResult {
  valid: boolean;
  missingRequirements: string[];
  warnings: string[];
}
