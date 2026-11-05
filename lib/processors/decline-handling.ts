// path: lib/processors/decline-handling.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { PaymentProcessorId } from '@/lib/processors/routing-waterfall';
import { filterHealthyWaterfall } from '@/lib/processors/circuit-breaker';

export type DeclineCategory = 'soft' | 'hard';

export interface DeclineClassification {
  code: string;
  category: DeclineCategory;
  isRetryable: boolean;
  description: string;
  cardholderMessage: string;
}

export interface FailoverEvaluationInput {
  tenantId: string;
  paymentIntentId: string;
  primaryProcessor: PaymentProcessorId;
  declineCode: string;
  attemptNumber: number; // 1-based
  waterfallOrder: PaymentProcessorId[];
}

export interface FailoverEvaluationResult {
  canFailover: boolean;
  isTerminalHardDecline: boolean;
  nextProcessor?: PaymentProcessorId | undefined;
  attemptNumber: number;
  declineClassification: DeclineClassification;
  cardholderMessage: string;
}

export interface PaymentFailoverRecord {
  id: string;
  tenantId: string;
  paymentIntentId: string;
  attemptNumber: number;
  primaryProcessor: PaymentProcessorId;
  declineCode: string;
  declineCategory: DeclineCategory;
  failoverProcessor?: PaymentProcessorId | undefined;
  failoverStatus: 'succeeded' | 'failed' | 'terminal_hard_decline';
  createdAt: string;
}

const failoverLogsStore = new Map<string, PaymentFailoverRecord>();
const auditRepo = new AuditLogRepository();

export const MAX_FAILOVER_ATTEMPTS = 2;

/**
 * Standard ISO 8583 / Scheme Decline Codes Dictionary
 */
export const DECLINE_CODES: Record<string, DeclineClassification> = {
  // --- SOFT DECLINES (Retryable / Failover Eligible) ---
  '05': {
    code: '05',
    category: 'soft',
    isRetryable: true,
    description: 'Do Not Honor / General Bank Risk Decline',
    cardholderMessage: 'Your transaction was declined by your bank. Retrying with secondary network.',
  },
  '12': {
    code: '12',
    category: 'soft',
    isRetryable: true,
    description: 'Invalid Transaction (Processor Formatting Mismatch)',
    cardholderMessage: 'Unable to route with primary gateway. Attempting secondary network.',
  },
  '19': {
    code: '19',
    category: 'soft',
    isRetryable: true,
    description: 'Re-enter Transaction',
    cardholderMessage: 'Temporary gateway communication error. Retrying transaction.',
  },
  '51': {
    code: '51',
    category: 'soft',
    isRetryable: true,
    description: 'Insufficient Funds / Credit Limit Exceeded',
    cardholderMessage: 'Insufficient funds. Please verify card balance or try another card.',
  },
  '91': {
    code: '91',
    category: 'soft',
    isRetryable: true,
    description: 'Issuer or Switch Inoperative / Network Timeout',
    cardholderMessage: 'Bank network temporarily unavailable. Retrying with backup processor.',
  },
  '96': {
    code: '96',
    category: 'soft',
    isRetryable: true,
    description: 'System Malfunction',
    cardholderMessage: 'Processing system error. Routing to secondary processor.',
  },
  TO: {
    code: 'TO',
    category: 'soft',
    isRetryable: true,
    description: 'Gateway Timeout / Connection Reset',
    cardholderMessage: 'Gateway timeout occurred. Retrying on failover processor.',
  },

  // --- HARD DECLINES (Terminal / Strictly Non-Retryable) ---
  '04': {
    code: '04',
    category: 'hard',
    isRetryable: false,
    description: 'Pick Up Card (Fraud Flag)',
    cardholderMessage: 'Your card was declined by your bank. Please use another payment method.',
  },
  '14': {
    code: '14',
    category: 'hard',
    isRetryable: false,
    description: 'Invalid Card Number',
    cardholderMessage: 'The card number entered is invalid. Please check your card details.',
  },
  '15': {
    code: '15',
    category: 'hard',
    isRetryable: false,
    description: 'No Such Issuer',
    cardholderMessage: 'Issuer could not be located. Please use another card.',
  },
  '41': {
    code: '41',
    category: 'hard',
    isRetryable: false,
    description: 'Lost Card (Terminal)',
    cardholderMessage: 'Your card was declined by your bank. Please contact your card issuer.',
  },
  '43': {
    code: '43',
    category: 'hard',
    isRetryable: false,
    description: 'Stolen Card (Terminal)',
    cardholderMessage: 'Your card was declined by your bank. Please contact your card issuer.',
  },
  '54': {
    code: '54',
    category: 'hard',
    isRetryable: false,
    description: 'Expired Card',
    cardholderMessage: 'Your card has expired. Please use a valid card.',
  },
  '57': {
    code: '57',
    category: 'hard',
    isRetryable: false,
    description: 'Transaction Not Permitted to Cardholder',
    cardholderMessage: 'This transaction is not permitted on this card. Please contact your bank.',
  },
  '62': {
    code: '62',
    category: 'hard',
    isRetryable: false,
    description: 'Restricted Card',
    cardholderMessage: 'Your card is restricted. Please use another payment method.',
  },
  '82': {
    code: '82',
    category: 'hard',
    isRetryable: false,
    description: 'Policy Violation / Card Blacklisted',
    cardholderMessage: 'Payment declined due to security policy. Please use another card.',
  },
};

/**
 * Classifies a decline code into soft (retryable) vs hard (terminal).
 */
export function classifyDeclineCode(code: string): DeclineClassification {
  const normalized = code.toUpperCase().trim();
  const known = DECLINE_CODES[normalized];
  if (known) {
    return known;
  }

  // Default: Unknown 5xx or timeout codes treat as soft, unknown numeric treat as soft unless starting with fraud flags
  return {
    code: normalized,
    category: 'soft',
    isRetryable: true,
    description: `Generic or Unmapped Decline Code: ${normalized}`,
    cardholderMessage: 'Transaction declined. Attempting backup routing.',
  };
}

/**
 * Step 180.1: Evaluates soft decline automatic failover and hard decline terminal enforcement.
 * Section 30: "Soft decline retry logic: automatic failover to secondary processor... Hard decline terminal handling with no retry."
 */
export async function evaluateDeclineAndFailover(
  input: FailoverEvaluationInput
): Promise<FailoverEvaluationResult> {
  const classification = classifyDeclineCode(input.declineCode);
  const logId = generateUuidV7();
  const now = new Date().toISOString();

  // Invariant 1: Hard Declines are strictly terminal. Never retry.
  if (classification.category === 'hard') {
    logger.warn('Terminal hard decline encountered; suppressing all failover attempts', {
      paymentIntentId: input.paymentIntentId,
      declineCode: classification.code,
      processor: input.primaryProcessor,
    });

    const record: PaymentFailoverRecord = {
      id: logId,
      tenantId: input.tenantId,
      paymentIntentId: input.paymentIntentId,
      attemptNumber: input.attemptNumber,
      primaryProcessor: input.primaryProcessor,
      declineCode: classification.code,
      declineCategory: 'hard',
      failoverStatus: 'terminal_hard_decline',
      createdAt: now,
    };
    failoverLogsStore.set(logId, record);

    try {
      await auditRepo.append({
        actor_id: '00000000-0000-4000-8000-000000000000',
        action: 'HARD_DECLINE_TERMINATED',
        entity_type: 'payment_failover_log',
        entity_id: logId,
        payload: {
          paymentIntentId: input.paymentIntentId,
          primaryProcessor: input.primaryProcessor,
          declineCode: classification.code,
        },
      });
    } catch {}

    return {
      canFailover: false,
      isTerminalHardDecline: true,
      attemptNumber: input.attemptNumber,
      declineClassification: classification,
      cardholderMessage: classification.cardholderMessage,
    };
  }

  // Invariant 2: Check max failover attempt limit
  if (input.attemptNumber >= MAX_FAILOVER_ATTEMPTS + 1) {
    logger.info('Max failover attempts reached for payment intent', {
      paymentIntentId: input.paymentIntentId,
      attempts: input.attemptNumber,
    });

    return {
      canFailover: false,
      isTerminalHardDecline: false,
      attemptNumber: input.attemptNumber,
      declineClassification: classification,
      cardholderMessage: 'Unable to authorize payment across available gateways. Please try another card.',
    };
  }

  // Invariant 3: Select next healthy processor from waterfall
  const healthyWaterfall = filterHealthyWaterfall(input.tenantId, input.waterfallOrder);
  const nextProcessor = healthyWaterfall.find((p) => p !== input.primaryProcessor);

  if (!nextProcessor) {
    logger.warn('No alternate healthy processor available in waterfall for failover', {
      paymentIntentId: input.paymentIntentId,
      primaryProcessor: input.primaryProcessor,
    });

    return {
      canFailover: false,
      isTerminalHardDecline: false,
      attemptNumber: input.attemptNumber,
      declineClassification: classification,
      cardholderMessage: 'Card declined by issuing bank. Please use another card.',
    };
  }

  // Soft decline eligible for failover
  const nextAttempt = input.attemptNumber + 1;
  const record: PaymentFailoverRecord = {
    id: logId,
    tenantId: input.tenantId,
    paymentIntentId: input.paymentIntentId,
    attemptNumber: input.attemptNumber,
    primaryProcessor: input.primaryProcessor,
    declineCode: classification.code,
    declineCategory: 'soft',
    failoverProcessor: nextProcessor,
    failoverStatus: 'succeeded',
    createdAt: now,
  };
  failoverLogsStore.set(logId, record);

  logger.info('Soft decline triggered automatic processor failover', {
    paymentIntentId: input.paymentIntentId,
    primaryProcessor: input.primaryProcessor,
    failoverProcessor: nextProcessor,
    declineCode: classification.code,
    nextAttempt,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'PAYMENT_FAILOVER_ATTEMPTED',
      entity_type: 'payment_failover_log',
      entity_id: logId,
      payload: {
        paymentIntentId: input.paymentIntentId,
        primaryProcessor: input.primaryProcessor,
        failoverProcessor: nextProcessor,
        declineCode: classification.code,
        attemptNumber: nextAttempt,
      },
    });
  } catch {}

  return {
    canFailover: true,
    isTerminalHardDecline: false,
    nextProcessor,
    attemptNumber: nextAttempt,
    declineClassification: classification,
    cardholderMessage: classification.cardholderMessage,
  };
}

export function getFailoverRecord(id: string): PaymentFailoverRecord | undefined {
  return failoverLogsStore.get(id);
}

export function resetFailoverLogsStore(): void {
  failoverLogsStore.clear();
}
