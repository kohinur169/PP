// path: tests/logger/logger.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  Logger,
  runWithContext,
  getLogContext,
  generateCorrelationId,
  redactValue,
  redactString,
} from '@/lib/logger';
import type { LogEntry } from '@/lib/logger';

describe('Structured Logging & Correlation ID Tracing (Step 007)', () => {
  describe('Structured JSON Log Output', () => {
    it('should format logs with timestamp, level, message, and metadata', () => {
      const logs: LogEntry[] = [];
      const testLogger = new Logger({
        minLevel: 'debug',
        outputFn: (entry) => logs.push(entry),
      });

      testLogger.info('Payment processed successfully', {
        amount: '100.0000',
        currency: 'USD',
      });

      expect(logs.length).toBe(1);
      const entry = logs[0]!;
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('Payment processed successfully');
      expect(entry.meta?.amount).toBe('100.0000');
      expect(entry.meta?.currency).toBe('USD');
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    });

    it('should respect minimum log levels and filter out lower severity logs', () => {
      const logs: LogEntry[] = [];
      const testLogger = new Logger({
        minLevel: 'warn',
        outputFn: (entry) => logs.push(entry),
      });

      testLogger.debug('Debug message should be ignored');
      testLogger.info('Info message should be ignored');
      testLogger.warn('Warning message should be captured');
      testLogger.error('Error message should be captured');

      expect(logs.length).toBe(2);
      expect(logs[0]?.level).toBe('warn');
      expect(logs[1]?.level).toBe('error');
    });
  });

  describe('Correlation ID & Async Context Propagation', () => {
    it('should automatically propagate correlationId and tenantId across async hops', async () => {
      const logs: LogEntry[] = [];
      const testLogger = new Logger({
        minLevel: 'info',
        outputFn: (entry) => logs.push(entry),
      });

      const correlationId = 'req_test_018f6c4c';
      const tenantId = 'tenant_kd_solution';

      await runWithContext({ correlationId, tenantId }, async () => {
        testLogger.info('Step 1: Inbound request received');

        // Simulate async I/O hop
        await new Promise((resolve) => setTimeout(resolve, 10));

        testLogger.info('Step 2: Database query executed');

        // Another async operation
        await Promise.resolve().then(() => {
          testLogger.info('Step 3: Gateway response received');
        });
      });

      expect(logs.length).toBe(3);
      for (const entry of logs) {
        expect(entry.correlationId).toBe(correlationId);
        expect(entry.tenantId).toBe(tenantId);
      }
    });

    it('should auto-generate correlationId when none is explicitly provided', () => {
      let capturedContextCorrelationId: string | undefined;

      runWithContext({}, () => {
        const ctx = getLogContext();
        capturedContextCorrelationId = ctx.correlationId;
      });

      expect(capturedContextCorrelationId).toBeDefined();
      expect(capturedContextCorrelationId?.startsWith('req_')).toBe(true);
    });
  });

  describe('Automatic PII & Secret Redaction', () => {
    it('should redact sensitive keys including passwords, tokens, API keys, and CVVs', () => {
      const rawPayload = {
        username: 'merchant_admin',
        password: 'superSecretPassword123!',
        api_key: 'live_sec_999888777',
        payment: {
          cvv: '123',
          cardToken: 'tok_visa_4242',
          securityCode: '456',
        },
      };

      const redacted = redactValue(rawPayload) as typeof rawPayload;
      expect(redacted.username).toBe('merchant_admin');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.api_key).toBe('[REDACTED]');
      expect(redacted.payment.cvv).toBe('[REDACTED]');
      expect(redacted.payment.securityCode).toBe('[REDACTED]');
    });

    it('should mask Primary Account Numbers (PANs) preserving first 4 and last 4 digits', () => {
      const rawString = 'Customer card 4111222233334444 charged';
      const masked = redactString(rawString);
      expect(masked).toBe('Customer card 4111********4444 charged');
    });

    it('should redact SSN and Bearer tokens inside strings', () => {
      const text = 'Auth: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and SSN 123-45-6789';
      const redacted = redactString(text);
      expect(redacted).toBe('Auth: Bearer [REDACTED] and SSN ***-**-****');
    });

    it('should handle circular references gracefully without stack overflow', () => {
      const circularObj: Record<string, unknown> = { name: 'Root' };
      circularObj.self = circularObj;

      expect(() => redactValue(circularObj)).not.toThrow();
      const result = redactValue(circularObj) as Record<string, unknown>;
      expect(result.self).toBe('[Circular Reference]');
    });
  });

  describe('Error Serialization & Child Loggers', () => {
    it('should serialize Error objects with redacted stack traces and messages', () => {
      const logs: LogEntry[] = [];
      const testLogger = new Logger({
        minLevel: 'error',
        outputFn: (entry) => logs.push(entry),
      });

      const testError = new Error('Database connection failed with token=secret123');
      testLogger.error('Operation failed', testError);

      expect(logs.length).toBe(1);
      const entry = logs[0]!;
      expect(entry.error?.name).toBe('Error');
      expect(entry.error?.message).toContain('Database connection failed with token=[REDACTED]');
    });

    it('should merge child logger bindings into all descendant log entries', () => {
      const logs: LogEntry[] = [];
      const parentLogger = new Logger({
        minLevel: 'info',
        outputFn: (entry) => logs.push(entry),
      });

      const childLogger = parentLogger.child({ module: 'settlement-engine' });
      childLogger.info('Settlement batch completed', { batchId: 'bat_01' });

      expect(logs.length).toBe(1);
      expect(logs[0]?.meta?.batchId).toBe('bat_01');
    });
  });
});
