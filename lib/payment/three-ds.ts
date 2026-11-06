// path: lib/payment/three-ds.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { Money } from '@/lib/money/money';
import { logger } from '@/lib/logger/logger';
import type { PaymentProcessorSlug } from '@/types/processors';
import type { CardBrand } from '@/lib/processors/routing';

export type ThreeDsStatus =
  | 'frictionless_authenticated'
  | 'challenge_required'
  | 'challenge_authenticated'
  | 'challenge_failed'
  | 'attempted_liability_shifted'
  | 'rejected';

export type EciCode = '05' | '02' | '06' | '01' | '07' | '00';

export interface ThreeDsAuthRequest {
  paymentId: string;
  amount: Money;
  currency: 'USD';
  provider: PaymentProcessorSlug;
  cardBrand: CardBrand;
  cardToken: string;
  billingCountry: string;
  payerIp?: string | undefined;
  returnUrl: string;
}

export interface ThreeDsAuthResult {
  paymentId: string;
  status: ThreeDsStatus;
  eci: EciCode;
  cavv?: string | undefined; // Cardholder Authentication Verification Value (base64)
  xid?: string | undefined; // Transaction Identifier
  dsTransId?: string | undefined;
  liabilityShifted: boolean;
  challengeUrl?: string | undefined;
  authenticationTimestamp: string;
  version: '2.2.0' | '2.1.0';
  provider: PaymentProcessorSlug;
}

export interface ThreeDsRecordEntity {
  id: string;
  paymentId: string;
  provider: PaymentProcessorSlug;
  version: string;
  status: ThreeDsStatus;
  eci: EciCode;
  cavv: string;
  xid: string;
  liabilityShifted: boolean;
  recordedAt: string;
}

// In-memory record store for 3DS verification and dispute defense audit logs
const threeDsRecords = new Map<string, ThreeDsRecordEntity>();

/**
 * Step 134.3: Verifies liability shift status based on card brand and Electronic Commerce Indicator (ECI).
 * ECI 05 / 02: Fully authenticated -> Liability shifted to card issuer.
 * ECI 06 / 01: Merchant attempted / Issuer not enrolled -> Liability shifted to card issuer.
 * ECI 07 / 00: Authentication failed / Not performed -> Liability NOT shifted (Merchant liable).
 */
export function evaluateLiabilityShift(eci: EciCode, cardBrand: CardBrand): boolean {
  switch (cardBrand) {
    case 'mastercard':
      return eci === '02' || eci === '01';
    case 'visa':
    case 'amex':
    case 'discover':
    case 'jcb':
    case 'unionpay':
    default:
      return eci === '05' || eci === '06';
  }
}

/**
 * Resolves standard ECI code for authenticated flow based on card brand.
 */
function getAuthenticatedEci(cardBrand: CardBrand): EciCode {
  return cardBrand === 'mastercard' ? '02' : '05';
}

/**
 * Resolves standard ECI code for unauthenticated / failed flow based on card brand.
 */
function getFailedEci(cardBrand: CardBrand): EciCode {
  return cardBrand === 'mastercard' ? '00' : '07';
}

/**
 * Generates cryptographic mock CAVV and XID identifiers for sandbox testing.
 */
function generateCavvAndXid(): { cavv: string; xid: string; dsTransId: string } {
  const cavv = crypto.randomBytes(20).toString('base64');
  const xid = crypto.randomBytes(20).toString('base64');
  const dsTransId = generateUuidV7();
  return { cavv, xid, dsTransId };
}

/**
 * Step 134.1: Initiates 3D Secure 2.0 authentication for a payment transaction.
 * Evaluates risk and enrollment to determine frictionless vs step-up challenge flow.
 */
export async function initiate3dsAuthentication(
  request: ThreeDsAuthRequest
): Promise<ThreeDsAuthResult> {
  const now = new Date().toISOString();

  // Test cards ending in 3063 or 3001, or high-risk tickets require step-up challenge modal
  const requiresChallenge =
    request.cardToken.includes('3063') ||
    request.cardToken.includes('3001') ||
    request.cardToken.includes('challenge') ||
    request.amount.greaterThan(Money.from('1000.0000'));

  if (requiresChallenge) {
    const challengeUrl = `https://3ds-acs.auth.platform/challenge/${request.paymentId}?return_to=${encodeURIComponent(
      request.returnUrl
    )}`;

    logger.info('3DS2 Step-Up Challenge Modal Required', {
      paymentId: request.paymentId,
      provider: request.provider,
      challengeUrl,
    });

    return {
      paymentId: request.paymentId,
      status: 'challenge_required',
      eci: getFailedEci(request.cardBrand),
      liabilityShifted: false,
      challengeUrl,
      authenticationTimestamp: now,
      version: '2.2.0',
      provider: request.provider,
    };
  }

  // Frictionless Flow: Automatically authenticated
  const { cavv, xid, dsTransId } = generateCavvAndXid();
  const eci = getAuthenticatedEci(request.cardBrand);
  const liabilityShifted = evaluateLiabilityShift(eci, request.cardBrand);

  const result: ThreeDsAuthResult = {
    paymentId: request.paymentId,
    status: 'frictionless_authenticated',
    eci,
    cavv,
    xid,
    dsTransId,
    liabilityShifted,
    authenticationTimestamp: now,
    version: '2.2.0',
    provider: request.provider,
  };

  await record3dsAuthenticationRecord(result);

  logger.info('3DS2 Frictionless Authentication Cleared with Liability Shift', {
    paymentId: request.paymentId,
    provider: request.provider,
    eci,
    liabilityShifted,
  });

  return result;
}

/**
 * Step 134.2 & 134.3: Completes 3DS step-up challenge after user response from challenge modal.
 */
export async function complete3dsChallenge(params: {
  paymentId: string;
  challengeResponseToken: string;
  provider: PaymentProcessorSlug;
  cardBrand: CardBrand;
}): Promise<ThreeDsAuthResult> {
  const now = new Date().toISOString();
  const isFailed =
    params.challengeResponseToken.includes('failed') ||
    params.challengeResponseToken.includes('declined') ||
    params.challengeResponseToken === 'INVALID_OTP';

  if (isFailed) {
    const eci = getFailedEci(params.cardBrand);
    const result: ThreeDsAuthResult = {
      paymentId: params.paymentId,
      status: 'challenge_failed',
      eci,
      liabilityShifted: false,
      authenticationTimestamp: now,
      version: '2.2.0',
      provider: params.provider,
    };

    logger.warn('3DS2 Challenge Authentication Failed', {
      paymentId: params.paymentId,
      provider: params.provider,
      eci,
    });

    return result;
  }

  // Challenge successful: issuer grants liability shift
  const { cavv, xid, dsTransId } = generateCavvAndXid();
  const eci = getAuthenticatedEci(params.cardBrand);
  const liabilityShifted = evaluateLiabilityShift(eci, params.cardBrand);

  const result: ThreeDsAuthResult = {
    paymentId: params.paymentId,
    status: 'challenge_authenticated',
    eci,
    cavv,
    xid,
    dsTransId,
    liabilityShifted,
    authenticationTimestamp: now,
    version: '2.2.0',
    provider: params.provider,
  };

  await record3dsAuthenticationRecord(result);

  logger.info('3DS2 Challenge Authenticated; Issuer Liability Shift Secured', {
    paymentId: params.paymentId,
    provider: params.provider,
    eci,
    liabilityShifted,
  });

  return result;
}

/**
 * Step 134.4: Persists 3DS authentication record (CAVV, XID, ECI) for chargeback defense.
 */
export async function record3dsAuthenticationRecord(
  result: ThreeDsAuthResult
): Promise<ThreeDsRecordEntity> {
  const record: ThreeDsRecordEntity = {
    id: generateUuidV7(),
    paymentId: result.paymentId,
    provider: result.provider,
    version: result.version,
    status: result.status,
    eci: result.eci,
    cavv: result.cavv ?? 'N/A',
    xid: result.xid ?? 'N/A',
    liabilityShifted: result.liabilityShifted,
    recordedAt: result.authenticationTimestamp,
  };

  threeDsRecords.set(result.paymentId, record);
  return record;
}

/**
 * Retrieves stored 3DS authentication record for dispute evidence representation.
 */
export function get3dsRecord(paymentId: string): ThreeDsRecordEntity | null {
  return threeDsRecords.get(paymentId) ?? null;
}

/**
 * Clears 3DS records for test isolation.
 */
export function clear3dsRecords(): void {
  threeDsRecords.clear();
}
