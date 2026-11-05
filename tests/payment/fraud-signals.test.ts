// path: tests/payment/fraud-signals.test.ts

import { describe, it, expect } from 'vitest';
import { Money } from '@/lib/money/money';
import {
  evaluateStripeRadarSignal,
  evaluateNmiFraudSignal,
  evaluateRainforestRiskSignal,
  evaluateAirwallexRiskSignal,
  evaluatePayoneerRiskSignal,
  evaluateProviderFraudSignal,
  assertNotFraudulent,
  ProviderFraudSignalRejectionError,
} from '@/lib/payment/fraud-signals';

describe('Real-Time Gateway Fraud Signal Evaluator & Immediate Rejection Engine (Step 140)', () => {
  const context = {
    paymentId: '01a1ab60-1111-7111-8111-111111111111',
    companyId: '22222222-2222-4222-8222-222222222222',
    tenantId: '33333333-3333-4333-8333-333333333333',
    amount: Money.from('240.0000'),
  };

  describe('Stripe Radar Risk Evaluation (Step 140.1)', () => {
    it('immediately rejects when Stripe Radar risk_level is highest', async () => {
      const signal = evaluateStripeRadarSignal({
        risk_level: 'highest',
        risk_score: 88,
        reason: 'highest_risk_level',
        seller_message: 'Stripe evaluated this charge as high risk and blocked it.',
      });

      const evaluation = evaluateProviderFraudSignal(signal);
      expect(evaluation.isRejected).toBe(true);

      await expect(assertNotFraudulent(signal, context)).rejects.toThrow(
        ProviderFraudSignalRejectionError
      );

      await expect(assertNotFraudulent(signal, context)).rejects.toThrow(
        /Payment rejected at once by provider fraud signal \(stripe_connect\)/
      );
    });

    it('passes when Stripe Radar outcome is normal risk', async () => {
      const signal = evaluateStripeRadarSignal({
        risk_level: 'normal',
        risk_score: 12,
      });

      const evaluation = evaluateProviderFraudSignal(signal);
      expect(evaluation.isRejected).toBe(false);

      await expect(assertNotFraudulent(signal, context)).resolves.not.toThrow();
    });
  });

  describe('NMI iSpy Fraud Evaluation (Step 140.2)', () => {
    it('immediately rejects when NMI fraud_status is reject or block', async () => {
      const signal = evaluateNmiFraudSignal({
        fraud_status: 'reject',
        fraud_score: 95,
        reason_code: 'ispy_card_testing_rule_matched',
      });

      const evaluation = evaluateProviderFraudSignal(signal);
      expect(evaluation.isRejected).toBe(true);

      await expect(assertNotFraudulent(signal, context)).rejects.toThrow(
        ProviderFraudSignalRejectionError
      );

      await expect(assertNotFraudulent(signal, context)).rejects.toThrow(
        /Payment rejected at once by provider fraud signal \(nmi\)/
      );
    });

    it('passes when NMI fraud_status is pass', async () => {
      const signal = evaluateNmiFraudSignal({
        fraud_status: 'pass',
        fraud_score: 10,
      });

      expect(evaluateProviderFraudSignal(signal).isRejected).toBe(false);
      await expect(assertNotFraudulent(signal, context)).resolves.not.toThrow();
    });
  });

  describe('Rainforest Risk Signal Evaluation (Step 140.3)', () => {
    it('immediately rejects when Rainforest signals DECLINE or SUSPECTED_FRAUD', async () => {
      const signal = evaluateRainforestRiskSignal({
        risk_decision: 'DECLINE',
        risk_reason: 'SUSPECTED_FRAUD',
        risk_score: 91,
      });

      expect(evaluateProviderFraudSignal(signal).isRejected).toBe(true);

      await expect(assertNotFraudulent(signal, context)).rejects.toThrow(
        ProviderFraudSignalRejectionError
      );

      await expect(assertNotFraudulent(signal, context)).rejects.toThrow(
        /Payment rejected at once by provider fraud signal \(rainforest\)/
      );
    });

    it('passes when Rainforest decision is ACCEPT', async () => {
      const signal = evaluateRainforestRiskSignal({
        risk_decision: 'ACCEPT',
      });

      expect(evaluateProviderFraudSignal(signal).isRejected).toBe(false);
      await expect(assertNotFraudulent(signal, context)).resolves.not.toThrow();
    });
  });

  describe('Airwallex Risk Signal Evaluation (Step 140.4)', () => {
    it('immediately rejects when Airwallex evaluation is REJECT or FRAUD_RULE_TRIGGERED', async () => {
      const signal = evaluateAirwallexRiskSignal({
        risk_evaluation: 'REJECT',
        risk_reason: 'FRAUD_RULE_TRIGGERED',
      });

      expect(evaluateProviderFraudSignal(signal).isRejected).toBe(true);

      await expect(assertNotFraudulent(signal, context)).rejects.toThrow(
        ProviderFraudSignalRejectionError
      );

      await expect(assertNotFraudulent(signal, context)).rejects.toThrow(
        /Payment rejected at once by provider fraud signal \(airwallex\)/
      );
    });
  });

  describe('Payoneer Risk Signal Evaluation (Step 140.5)', () => {
    it('immediately rejects when Payoneer decision is DENY or BLACKLISTED', async () => {
      const signal = evaluatePayoneerRiskSignal({
        fraud_decision: 'BLACKLISTED',
        risk_code: 'COMPLIANCE_WATCHLIST_MATCH',
      });

      expect(evaluateProviderFraudSignal(signal).isRejected).toBe(true);

      await expect(assertNotFraudulent(signal, context)).rejects.toThrow(
        ProviderFraudSignalRejectionError
      );

      await expect(assertNotFraudulent(signal, context)).rejects.toThrow(
        /Payment rejected at once by provider fraud signal \(payoneer\)/
      );
    });
  });
});
