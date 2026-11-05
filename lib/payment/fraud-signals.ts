// path: lib/payment/fraud-signals.ts

import { Money } from '@/lib/money/money';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import type { PaymentProcessorSlug } from '@/types/processors';

export type FraudSignalDecision = 'pass' | 'review' | 'reject';

export type FraudRiskLevel = 'normal' | 'elevated' | 'highest';

export interface ProviderFraudSignal {
  provider: PaymentProcessorSlug;
  decision: FraudSignalDecision;
  riskLevel?: FraudRiskLevel | undefined;
  riskScore?: number | undefined; // 0 to 100
  reasonCode?: string | undefined;
  ruleName?: string | undefined;
  rawSignal?: Record<string, unknown> | undefined;
}

export interface FraudEvaluationResult {
  isRejected: boolean;
  reason: string;
  signal: ProviderFraudSignal;
}

export interface AssertFraudSignalContext {
  paymentId: string;
  companyId: string;
  tenantId: string;
  amount: Money;
}

export class ProviderFraudSignalRejectionError extends Error {
  public readonly code = 'PROVIDER_FRAUD_SIGNAL_REJECTED';
  public readonly statusCode = 422;
  public readonly provider: PaymentProcessorSlug;
  public readonly reasonCode?: string | undefined;
  public readonly riskScore?: number | undefined;

  constructor(
    provider: PaymentProcessorSlug,
    detail: string,
    options?: { reasonCode?: string | undefined; riskScore?: number | undefined }
  ) {
    super(`Payment rejected at once by provider fraud signal (${provider}): ${detail}`);
    this.name = 'ProviderFraudSignalRejectionError';
    this.provider = provider;
    this.reasonCode = options?.reasonCode;
    this.riskScore = options?.riskScore;
  }
}

const auditRepo = new AuditLogRepository();

/**
 * Normalizes Stripe Radar outcome into standard ProviderFraudSignal.
 */
export function evaluateStripeRadarSignal(outcome: {
  risk_level?: string | undefined;
  risk_score?: number | undefined;
  reason?: string | undefined;
  seller_message?: string | undefined;
}): ProviderFraudSignal {
  const riskLevelStr = (outcome.risk_level ?? 'normal').toLowerCase();
  let riskLevel: FraudRiskLevel = 'normal';
  if (riskLevelStr === 'highest') riskLevel = 'highest';
  else if (riskLevelStr === 'elevated') riskLevel = 'elevated';

  const riskScore = outcome.risk_score;
  const reasonCode = outcome.reason;

  // Immediate rejection if risk is 'highest', reason is highest_risk_level, or riskScore >= 75
  const isReject =
    riskLevel === 'highest' ||
    reasonCode === 'highest_risk_level' ||
    reasonCode === 'rule' ||
    (riskScore !== undefined && riskScore >= 75);

  return {
    provider: 'stripe_connect',
    decision: isReject ? 'reject' : riskLevel === 'elevated' ? 'review' : 'pass',
    riskLevel,
    riskScore,
    reasonCode,
    ruleName: outcome.seller_message,
    rawSignal: outcome,
  };
}

/**
 * Normalizes NMI iSpy Fraud response into standard ProviderFraudSignal.
 */
export function evaluateNmiFraudSignal(response: {
  fraud_status?: string | undefined; // 'reject' | 'block' | 'flag' | 'review' | 'pass'
  fraud_score?: number | undefined;
  ispy_action?: string | undefined;
  reason_code?: string | undefined;
}): ProviderFraudSignal {
  const status = (response.fraud_status ?? response.ispy_action ?? 'pass').toLowerCase();
  const isReject =
    status === 'reject' ||
    status === 'block' ||
    (response.fraud_score !== undefined && response.fraud_score >= 80);

  return {
    provider: 'nmi',
    decision: isReject ? 'reject' : status === 'review' || status === 'flag' ? 'review' : 'pass',
    riskLevel: isReject ? 'highest' : status === 'flag' ? 'elevated' : 'normal',
    riskScore: response.fraud_score,
    reasonCode: response.reason_code ?? status,
    rawSignal: response,
  };
}

/**
 * Normalizes Rainforest Payment Risk signal into standard ProviderFraudSignal.
 */
export function evaluateRainforestRiskSignal(risk: {
  risk_decision?: string | undefined; // 'DECLINE' | 'REJECT' | 'BLOCKED' | 'ACCEPT'
  risk_reason?: string | undefined;
  risk_score?: number | undefined;
}): ProviderFraudSignal {
  const decision = (risk.risk_decision ?? 'ACCEPT').toUpperCase();
  const isReject =
    decision === 'DECLINE' ||
    decision === 'REJECT' ||
    decision === 'BLOCKED' ||
    risk.risk_reason?.includes('FRAUD') ||
    risk.risk_reason?.includes('STOLEN');

  return {
    provider: 'rainforest',
    decision: isReject ? 'reject' : 'pass',
    riskLevel: isReject ? 'highest' : 'normal',
    riskScore: risk.risk_score,
    reasonCode: risk.risk_reason ?? decision,
    rawSignal: risk,
  };
}

/**
 * Normalizes Airwallex Risk Evaluation into standard ProviderFraudSignal.
 */
export function evaluateAirwallexRiskSignal(risk: {
  risk_evaluation?: string | undefined; // 'REJECT' | 'CHALLENGE' | 'ACCEPT'
  risk_reason?: string | undefined;
  score?: number | undefined;
}): ProviderFraudSignal {
  const evaluation = (risk.risk_evaluation ?? 'ACCEPT').toUpperCase();
  const isReject =
    evaluation === 'REJECT' ||
    risk.risk_reason === 'FRAUD_RULE_TRIGGERED' ||
    risk.risk_reason === 'HIGH_RISK_CARD';

  return {
    provider: 'airwallex',
    decision: isReject ? 'reject' : evaluation === 'CHALLENGE' ? 'review' : 'pass',
    riskLevel: isReject ? 'highest' : evaluation === 'CHALLENGE' ? 'elevated' : 'normal',
    riskScore: risk.score,
    reasonCode: risk.risk_reason ?? evaluation,
    rawSignal: risk,
  };
}

/**
 * Normalizes Payoneer Fraud Signal into standard ProviderFraudSignal.
 */
export function evaluatePayoneerRiskSignal(risk: {
  fraud_decision?: string | undefined; // 'REJECT' | 'DENY' | 'BLACKLISTED' | 'APPROVE'
  risk_code?: string | undefined;
  score?: number | undefined;
}): ProviderFraudSignal {
  const decision = (risk.fraud_decision ?? 'APPROVE').toUpperCase();
  const isReject =
    decision === 'REJECT' ||
    decision === 'DENY' ||
    decision === 'BLACKLISTED';

  return {
    provider: 'payoneer',
    decision: isReject ? 'reject' : 'pass',
    riskLevel: isReject ? 'highest' : 'normal',
    riskScore: risk.score,
    reasonCode: risk.risk_code ?? decision,
    rawSignal: risk,
  };
}

/**
 * Evaluates whether any provider signal mandates immediate rejection.
 * Rule (Section 18, Line 211): "A provider fraud signal rejects the payment at once."
 */
export function evaluateProviderFraudSignal(
  signal: ProviderFraudSignal
): FraudEvaluationResult {
  const isRejected =
    signal.decision === 'reject' ||
    signal.riskLevel === 'highest' ||
    (signal.riskScore !== undefined && signal.riskScore >= 75);

  const reason = isRejected
    ? `Gateway fraud signal flagged payment as fraudulent or high-risk (Reason: ${
        signal.reasonCode ?? signal.ruleName ?? 'FRAUD_DETECTED'
      }, Risk Score: ${signal.riskScore ?? 'N/A'})`
    : 'Payment passed gateway fraud evaluation';

  return {
    isRejected,
    reason,
    signal,
  };
}

/**
 * Step 140: Real-Time Gateway Fraud Signal Assertion.
 * Strictly asserts that no gateway fraud signal exists on the payment.
 * If flagged as fraud, immediately rejects payment and logs structured audit event.
 */
export async function assertNotFraudulent(
  signal: ProviderFraudSignal,
  context: AssertFraudSignalContext
): Promise<void> {
  const evaluation = evaluateProviderFraudSignal(signal);

  if (evaluation.isRejected) {
    logger.error('Payment rejected at once by provider fraud signal', {
      paymentId: context.paymentId,
      companyId: context.companyId,
      provider: signal.provider,
      amount: context.amount.toNumericString(),
      reason: evaluation.reason,
      reasonCode: signal.reasonCode,
      riskScore: signal.riskScore,
    });

    try {
      await auditRepo.append({
        actor_id: '00000000-0000-0000-0000-000000000000',
        action: 'PAYMENT_FRAUD_SIGNAL_REJECTED',
        entity_type: 'payment_fraud_signal',
        entity_id: context.paymentId,
        payload: {
          paymentId: context.paymentId,
          companyId: context.companyId,
          provider: signal.provider,
          amount: context.amount.toNumericString(),
          reason: evaluation.reason,
          reasonCode: signal.reasonCode ?? null,
          riskLevel: signal.riskLevel ?? null,
          riskScore: signal.riskScore ?? null,
        },
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to append audit log for fraud signal rejection', {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    throw new ProviderFraudSignalRejectionError(
      signal.provider,
      evaluation.reason,
      {
        reasonCode: signal.reasonCode,
        riskScore: signal.riskScore,
      }
    );
  }
}
