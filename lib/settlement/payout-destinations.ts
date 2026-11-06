// path: lib/settlement/payout-destinations.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { encryptWithDomainKey, decryptWithDomainKey } from '@/lib/crypto/aes';

export type DestinationType = 'ach' | 'wire' | 'sepa' | 'payoneer' | 'card';

export interface AchDestinationInput {
  routingNumber: string;
  accountNumber: string;
  accountType: 'checking' | 'savings';
  beneficiaryName: string;
}

export interface WireDestinationInput {
  swiftBic: string;
  accountNumber: string;
  beneficiaryName: string;
  bankName: string;
  countryCode: string;
  currency: string;
}

export interface SepaDestinationInput {
  iban: string;
  beneficiaryName: string;
  swiftBic?: string | undefined;
}

export interface PayoneerDestinationInput {
  payeeIdOrEmail: string;
  beneficiaryName: string;
  currency?: string | undefined;
}

export interface CardDestinationInput {
  cardToken: string;
  last4: string;
  brand: 'visa' | 'mastercard';
  beneficiaryName: string;
}

export interface PayoutDestinationRecord {
  id: string;
  tenantId: string;
  companyId: string;
  destinationType: DestinationType;
  encryptedDetails: string;
  maskedAccountIdentifier: string;
  beneficiaryName: string;
  countryCode: string;
  currency: string;
  isVerified: boolean;
  validationStatus: 'valid' | 'invalid' | 'pending_microdeposit';
  validationError?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

const destinationsStore = new Map<string, PayoutDestinationRecord>();
const auditRepo = new AuditLogRepository();

export const SEPA_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'IS', 'LI',
  'NO', 'CH', 'MC', 'SM', 'AD', 'VA',
]);

/**
 * ABA Routing Number Fed Checksum Validator:
 * (3*(d1+d4+d7) + 7*(d2+d5+d8) + 1*(d3+d6+d9)) % 10 == 0
 */
export function validateAbaRoutingNumber(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) {
    return false;
  }
  const digits = routing.split('').map(Number);
  const sum =
    3 * (digits[0]! + digits[3]! + digits[6]!) +
    7 * (digits[1]! + digits[4]! + digits[7]!) +
    1 * (digits[2]! + digits[5]! + digits[8]!);
  return sum % 10 === 0;
}

/**
 * ISO 7064 Mod-97 IBAN Checksum Validator
 */
export function validateIbanMod97(iban: string): boolean {
  const cleanIban = iban.toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleanIban)) {
    return false;
  }

  // Rearrange: move first 4 chars to end
  const rearranged = cleanIban.slice(4) + cleanIban.slice(0, 4);

  // Convert letters to two-digit numbers (A = 10, B = 11, etc.)
  let numericString = '';
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      numericString += (code - 55).toString();
    } else {
      numericString += char;
    }
  }

  // Modulo 97 check using BigInt
  try {
    return BigInt(numericString) % 97n === 1n;
  } catch {
    return false;
  }
}

/**
 * ISO 9362 SWIFT / BIC Code Validator
 */
export function validateSwiftBic(swift: string): boolean {
  const clean = swift.toUpperCase().trim();
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(clean);
}

/**
 * Step 175.1: Validates and registers an ACH payout destination.
 */
export async function registerAchDestination(input: {
  tenantId: string;
  companyId: string;
  ach: AchDestinationInput;
}): Promise<PayoutDestinationRecord> {
  const routing = input.ach.routingNumber.trim();
  const account = input.ach.accountNumber.trim();

  if (!validateAbaRoutingNumber(routing)) {
    throw new Error(`Invalid ABA routing transit number checksum: ${routing}`);
  }

  if (!/^\d{4,17}$/.test(account)) {
    throw new Error('ACH account number must contain between 4 and 17 numeric digits.');
  }

  const masked = `••••${account.slice(-4)}`;
  const encrypted = encryptWithDomainKey(
    'gateways',
    JSON.stringify({
      routingNumber: routing,
      accountNumber: account,
      accountType: input.ach.accountType,
    })
  );

  const id = generateUuidV7();
  const now = new Date().toISOString();

  const record: PayoutDestinationRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    destinationType: 'ach',
    encryptedDetails: encrypted,
    maskedAccountIdentifier: masked,
    beneficiaryName: input.ach.beneficiaryName,
    countryCode: 'US',
    currency: 'USD',
    isVerified: true,
    validationStatus: 'valid',
    createdAt: now,
    updatedAt: now,
  };

  destinationsStore.set(id, record);

  logger.info('ACH payout destination registered and verified', {
    destinationId: id,
    companyId: input.companyId,
    masked,
  });

  return record;
}

/**
 * Step 175.2: Validates and registers a SEPA payout destination.
 */
export async function registerSepaDestination(input: {
  tenantId: string;
  companyId: string;
  sepa: SepaDestinationInput;
}): Promise<PayoutDestinationRecord> {
  const iban = input.sepa.iban.toUpperCase().replace(/\s+/g, '');
  if (!validateIbanMod97(iban)) {
    throw new Error(`Invalid SEPA IBAN Mod-97 checksum or format: ${iban}`);
  }

  const country = iban.slice(0, 2);
  if (!SEPA_COUNTRY_CODES.has(country)) {
    throw new Error(`Country code '${country}' is not part of the SEPA payment area.`);
  }

  if (input.sepa.swiftBic && !validateSwiftBic(input.sepa.swiftBic)) {
    throw new Error(`Invalid SWIFT/BIC code: ${input.sepa.swiftBic}`);
  }

  const masked = `${country}••••••••${iban.slice(-4)}`;
  const encrypted = encryptWithDomainKey(
    'gateways',
    JSON.stringify({
      iban,
      swiftBic: input.sepa.swiftBic ?? null,
    })
  );

  const id = generateUuidV7();
  const now = new Date().toISOString();

  const record: PayoutDestinationRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    destinationType: 'sepa',
    encryptedDetails: encrypted,
    maskedAccountIdentifier: masked,
    beneficiaryName: input.sepa.beneficiaryName,
    countryCode: country,
    currency: 'EUR',
    isVerified: true,
    validationStatus: 'valid',
    createdAt: now,
    updatedAt: now,
  };

  destinationsStore.set(id, record);
  return record;
}

/**
 * Step 175.3: Validates and registers an International Wire payout destination.
 */
export async function registerWireDestination(input: {
  tenantId: string;
  companyId: string;
  wire: WireDestinationInput;
}): Promise<PayoutDestinationRecord> {
  if (!validateSwiftBic(input.wire.swiftBic)) {
    throw new Error(`Invalid SWIFT/BIC code format: ${input.wire.swiftBic}`);
  }

  const account = input.wire.accountNumber.trim();
  if (account.length < 4) {
    throw new Error('Wire account number or IBAN must contain at least 4 characters.');
  }

  const masked = `WIRE-••••${account.slice(-4)}`;
  const encrypted = encryptWithDomainKey('gateways', JSON.stringify(input.wire));

  const id = generateUuidV7();
  const now = new Date().toISOString();

  const record: PayoutDestinationRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    destinationType: 'wire',
    encryptedDetails: encrypted,
    maskedAccountIdentifier: masked,
    beneficiaryName: input.wire.beneficiaryName,
    countryCode: input.wire.countryCode.toUpperCase(),
    currency: input.wire.currency.toUpperCase(),
    isVerified: true,
    validationStatus: 'valid',
    createdAt: now,
    updatedAt: now,
  };

  destinationsStore.set(id, record);
  return record;
}

/**
 * Step 175.4: Validates and registers a Payoneer payout destination.
 */
export async function registerPayoneerDestination(input: {
  tenantId: string;
  companyId: string;
  payoneer: PayoneerDestinationInput;
}): Promise<PayoutDestinationRecord> {
  const payee = input.payoneer.payeeIdOrEmail.trim();
  const isPayeeId = /^PAYO-[A-Z0-9]{5,20}$/i.test(payee);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payee);

  if (!isPayeeId && !isEmail) {
    throw new Error('Payoneer payee identifier must be a valid Payoneer Payee ID or email address.');
  }

  const masked = isEmail ? payee.replace(/(.{2})(.*)(?=@)/, '$1••••') : `PAYO-••••${payee.slice(-4)}`;
  const encrypted = encryptWithDomainKey('gateways', JSON.stringify({ payee }));

  const id = generateUuidV7();
  const now = new Date().toISOString();

  const record: PayoutDestinationRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    destinationType: 'payoneer',
    encryptedDetails: encrypted,
    maskedAccountIdentifier: masked,
    beneficiaryName: input.payoneer.beneficiaryName,
    countryCode: 'US',
    currency: input.payoneer.currency?.toUpperCase() ?? 'USD',
    isVerified: true,
    validationStatus: 'valid',
    createdAt: now,
    updatedAt: now,
  };

  destinationsStore.set(id, record);
  return record;
}

/**
 * Step 175.5: Validates and registers a Card OCT (Push-to-Card) payout destination.
 */
export async function registerCardOctDestination(input: {
  tenantId: string;
  companyId: string;
  card: CardDestinationInput;
}): Promise<PayoutDestinationRecord> {
  if (!['visa', 'mastercard'].includes(input.card.brand)) {
    throw new Error(`Card brand '${input.card.brand}' is not eligible for push-to-card OCT payouts.`);
  }

  if (!/^\d{4}$/.test(input.card.last4)) {
    throw new Error('Card last4 must be exactly 4 digits.');
  }

  const masked = `${input.card.brand.toUpperCase()} ••••${input.card.last4}`;
  const encrypted = encryptWithDomainKey('gateways', JSON.stringify(input.card));

  const id = generateUuidV7();
  const now = new Date().toISOString();

  const record: PayoutDestinationRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    destinationType: 'card',
    encryptedDetails: encrypted,
    maskedAccountIdentifier: masked,
    beneficiaryName: input.card.beneficiaryName,
    countryCode: 'US',
    currency: 'USD',
    isVerified: true,
    validationStatus: 'valid',
    createdAt: now,
    updatedAt: now,
  };

  destinationsStore.set(id, record);
  return record;
}

/**
 * Decrypts destination details for payment execution (restricted).
 */
export function decryptDestinationDetails(encryptedDetails: string): Record<string, unknown> {
  const json = decryptWithDomainKey('gateways', encryptedDetails);
  return JSON.parse(json) as Record<string, unknown>;
}

export function getPayoutDestination(id: string): PayoutDestinationRecord | undefined {
  return destinationsStore.get(id);
}

export function resetPayoutDestinationsStore(): void {
  destinationsStore.clear();
}
